# Get Fresh

A Blinkit-style quick-commerce grocery app for Maharashtra, with an AI-generated personalised weekly vegetable meal plan and daily subscription delivery.

The full specification lives in `AaharCart_BUILD.md`. This file covers how to run it.

---

## Quick start

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run dev
```

Open <http://localhost:3000> — it redirects to `/mr`.

**Everything runs on mocks out of the box.** No API keys, no database, no cost. The six external services (`ai`, `sms`, `storage`, `payment`, `push`, `queue`) all default to `mock` or `local`, so the app boots and the whole test suite passes on a fresh clone.

To see which providers are actually live: <http://localhost:3000/api/health>.

> **Leave `DATABASE_URL` empty until you have a real one.** An unreachable placeholder is worse than nothing — every page that touches the database waits for the connection to time out. Empty fails instantly and the app renders its empty state.

> **If a route you just added 404s in `npm run dev`**, delete `.next` and restart. Running `next build` and then `next dev` leaves a stale cache on this machine (Next flags the `E:` drive as slow). It is not your route — see D-89b.

### What works without a database

| Works now | Needs `DATABASE_URL` |
|---|---|
| Full layout, 5-tab nav, all screens | Catalogue, search, product pages |
| Marathi / Hindi / English switching | OTP login and everything behind it |
| Design system, empty and loading states | Cart, checkout, orders |
| `/api/health` | Wallet and top-up |

### Adding a database

TiDB Cloud Starter is free and needs no credit card. **Create the instance in Singapore** — see [Region](#region) below.

```bash
# Put your TiDB connection string in .env as DATABASE_URL, then:
npm run db:push      # push the schema (no migration history yet)
npm run db:seed      # 6 categories, 40+ products, service areas, settings
```

`npm run db:seed` is idempotent — run it as often as you like.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then a production build |
| `npm run typecheck` | `tsc --noEmit` — type errors are bugs, not warnings |
| `npm run lint` | ESLint, including the R1 vendor-import guard |
| `npm run test` | Vitest, entirely against mocks |
| `npm run check` | typecheck + lint + test. Run this before every commit |
| `npm run db:push` | Push the Prisma schema without a migration |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Seed realistic Indian grocery data |
| `npm run db:reset-demo` | Wipe demo activity, keep catalogue + the 4 seed accounts (refuses in production) |
| `npm run db:studio` | Prisma Studio |
| `npm run icons:generate` | Regenerate the PWA icons from `scripts/generate-icons.mjs` |
| `npm run cap:add-android` / `cap:sync` / `cap:open` | Capacitor — see [Play Store (Capacitor)](#play-store-capacitor) |

---

## Architecture

### The six ports (R1)

Every external service sits behind an interface in `src/lib/services/<port>/`:

```
src/lib/services/
├── ai/         types.ts · index.ts · mock.ts · providers/{gemini,anthropic,groq}.ts
├── sms/        types.ts · index.ts · mock.ts · providers/{msg91,whatsapp}.ts
├── storage/    types.ts · index.ts · mock.ts · providers/{local,cloudinary,r2}.ts
├── payment/    types.ts · index.ts · mock.ts · providers/razorpay.ts
├── push/       types.ts · index.ts · mock.ts · providers/fcm.ts
└── queue/      types.ts · index.ts · mock.ts · providers/qstash.ts
```

**Application code never imports a vendor SDK.** It calls `getAIProvider()`, `getPaymentProvider()` and so on. An ESLint `no-restricted-imports` rule turns a violation into a build failure, and every provider is implemented over plain `fetch` — no SDK is installed at all.

Moving from a free tier to a paid one is a `.env` change and nothing else:

```bash
AI_PROVIDER=mock  →  gemini  →  anthropic
PAYMENT_PROVIDER=mock  →  razorpay
STORAGE_PROVIDER=local  →  cloudinary  →  r2
```

### Money (R4)

Money is **integer paise in a `BigInt`**, everywhere. Never a float, never a `Decimal`.

```ts
import { formatPaise, rupeesToPaise, addPercent } from '@/lib/money';

rupeesToPaise('149')        // 14900n
addPercent(140000n, 15)     // 161000n  — the B3 wallet buffer
formatPaise(12345600n)      // '₹1,23,456'  — Indian grouping
```

The wallet is an **append-only ledger** (`wallet_transactions`). Balance is derived by summing it; there is no mutable balance column to drift. Every ledger write is idempotent on `(source, ref_type, ref_id)`.

`BigInt` does not survive `JSON.stringify`, so `ok()` in `src/lib/api/response.ts` serialises it to a decimal string. Parse it back with `paise()`.

### Portion quantity (B4)

Computed in code, never by the AI — `src/lib/quantity.ts`:

```
serving_units  = adults + (children × 0.5)
raw_grams      = 200 × serving_units
quantity_grams = round UP to the nearest 250, min 250, max 2000
```

Four adults → 800 g → **1000 g**. Two adults + one child → 500 g → **500 g**. Above 2000 g the plan is flagged for admin review. Piece and bunch items get 1 per 4 serving units, minimum 1.

Every constant is injectable and seeded into `app_settings`.

### Settings (R8)

No hard-coded business numbers. Every fee, threshold, portion size, duration and limit lives in `app_settings` and is editable from the admin panel at runtime. The values in `.env` are **bootstrap defaults only** — they seed the table on first run and act as the fallback if a row is missing.

```ts
import { SETTING_KEYS, getSettingPaise } from '@/lib/settings';
const fee = await getSettingPaise(SETTING_KEYS.deliveryFeePaise);
```

### Auth (M1)

Phone + OTP, no passwords. `jose`-signed JWTs in httpOnly cookies, so no script on the page can read them.

- 6-digit code, 5-minute expiry, max 5 attempts, 60-second resend cooldown, max 5 requests per number per hour — all enforced in `src/lib/auth/otp.ts`, not in the route.
- Codes are stored as an HMAC bound to the phone number, never in plain text.
- Access and refresh tokens use **different secrets and different audiences**, so neither can stand in for the other.
- Refresh tokens are stored hashed and rotate on use. Presenting an already-rotated token revokes every session for that user — that pattern means it was stolen.
- While `SMS_PROVIDER=mock` the code is `DEV_FIXED_OTP` (123456) and the login screen shows it, so no one has to read a log line to demo.
- "Resend on WhatsApp" appears after 30 seconds (B16).

RBAC is server-side on every route (R9) via `requireUser()` / `requireRole()`. There is no client-side role check anywhere.

### Serviceability (B11)

`checkServiceability()` requires **both** the pincode allow-list and the 8 km radius. A pincode alone is not enough — Indian pincodes cover wide rural areas — and a radius alone would accept an address across a river with no road.

When the customer has not granted location permission, only the allow-list can be checked; the result reports `radiusChecked: false`, and the check is repeated at address save and again at checkout. A refusal routes to the waitlist, whose demand the admin dashboard groups by pincode.

### Cart & orders (M3)

**Cart.** Logged in → a server cart, so it survives a reinstall and follows the customer between devices. Guest → localStorage (B17). At login the guest lines go to `POST /api/cart/merge`, which takes `max(existing, incoming)` per variant rather than summing — summing double-counts the same person adding the same item on two devices. Components use `useCart()` and never know which backend they are on.

**Order placement** is idempotent, atomic and transactional:

- The client sends an **idempotency key**, generated once per visit to checkout and reused on every retry. On rural 4G a request that times out has very often succeeded, and the customer's instinct is to tap again. Submitting the same key twice returns the same order.
- **Stock is decremented with a conditional `UPDATE`** (`where: { stockQty: { gte: n } }`) inside the transaction. Two customers racing for the last kilo of onions: exactly one wins, and the loser is told now rather than at 07:00 tomorrow.
- **The wallet debit is in the same transaction as the order.** An order without its debit is free vegetables; a debit without its order is theft.
- Orders **snapshot** the address, product name, image and unit price. Editing an address next month must not rewrite where last month's order went.

**Status machine** (`src/lib/orders/status.ts`) — one table, because "can this still be cancelled?" is asked by the customer app, the admin panel and the rider app, and three copies of that rule will disagree:

```
PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED
        ↘ CANCELLED → REFUNDED        ↘ FAILED_DELIVERY
```

Customers may cancel while PLACED, CONFIRMED or PAYMENT_PENDING — by PACKED the vegetables are weighed and bagged. Cancelling returns the stock and credits the wallet, **exactly once**, idempotent on `(CANCELLATION, order_refund, orderId)`.

**Complaints (B14).** A photo-backed complaint under ₹100 is auto-credited, max 2 per customer per month. No photo → admin review, whatever the value: the auto-credit must not become a way to shop for free. The claim is capped at the order total regardless of what is entered.

### Wallet (M7)

Balance, quick top-up chips (₹200 / ₹500 / ₹1,000 / custom), a statement with filters and a running balance, and low-balance alerts at ₹200 (B10).

The top-up flow and why it looks like this:

```
initiate → open gateway checkout → widget closes → POLL our own status
                                          ↑
   webhook (the only thing that credits) ─┘
```

- `POST /api/wallet/topup/initiate` records the intent and returns provider-neutral fields. **It credits nothing.**
- The gateway's success callback only tells the UI to start watching. The browser then polls `/api/wallet/topup/status`, which is a pure read.
- The credit happens in the webhook handler. So closing the browser mid-payment is harmless — the balance is simply right the next time the app opens.
- If the poll window expires the UI says *"not confirmed yet"*, never *"failed"*. Telling someone their payment failed when it did not is what causes a double payment.

**Idempotency has two independent layers:** `payments.gateway_payment_id` is unique, and the ledger entry is unique on `(TOPUP, payment, gatewayPaymentId)`. A crash between the two is still safe.

**Reconciliation** (`/api/cron/reconcile-payments`, every 15 minutes) is the safety net. Webhooks get lost — a deploy restarts the process mid-request, a tunnel drops, the retry budget runs out. Anything PENDING past `PAYMENT_PENDING_RECONCILE_MINUTES` is re-queried; if we never got a payment id it looks the order up instead. Still pending after 24 hours → FAILED.

**Trying it without a Razorpay account:** with `PAYMENT_PROVIDER=mock` the top-up sheet shows a *Simulate payment* button. It builds a correctly HMAC-signed payload and feeds it through the **real** webhook handler, signature check included — a stand-in for the gateway, not a shortcut around it. The route is double-guarded (development only, and mock provider only).

### Search (M2)

Must find कांदा, `kanda` and `onion` as the same product. Two mechanisms, in order of authority:

1. **`product_aliases`** — the dictionary. `kanda` → कांदा → Onion is a fact, not something to infer. Seeded now, grown past 200 Marathi terms in Phase 7.
2. **`transliterationKey()`** — the fuzzy fallback, folding the spellings a phone keyboard produces (`kaanda`, `khanda`, `bhendi`/`bhindi`) onto one key.

TiDB Starter has no full-text index, so matching is `LIKE` over a denormalised `search_keywords` column plus the alias table, ranked in memory over a bounded result set.

### Daily delivery (M6)

Four scheduled jobs, all authenticated with `Bearer CRON_SECRET`, all idempotent, all reporting enough for an admin alert:

| IST | UTC cron | Job |
|---|---|---|
| **00:30** | `0 19 * * *` | Generate one `MEAL_PLAN_DAILY` order per active subscription |
| **08:00** | `30 2 * * *` | Retry orders held for an insufficient balance |
| **20:00** | `30 14 * * *` | Tomorrow's preview with the exact bill + low-balance warning |
| 01:30 | `0 20 * * *` | Expire finished periods, remind at T-2 |

**The 00:30 job is what the business rests on.** It reads the plan template for that weekday and turns it into a real order six hours before the 06:30–09:00 delivery. Design points that are not obvious:

- It generates for the **IST date it fires on**, not "tomorrow". At 00:30 that morning's delivery *is* today.
- Each subscription runs in its own transaction. One exception must not leave the other 199 households without vegetables.
- An **insufficient balance does not roll back the order** — B3 needs it to exist as `PAYMENT_PENDING` for the 08:00 retry. Stock stays held; a customer who tops up at 07:00 should not find their vegetables sold on.
- A failed retry cancels the **day**, not the subscription. The date is recorded as `SKIPPED_UNPAID` so My Week can explain the gap.

**Out-of-stock substitution (B7)** happens at 00:30 because waiting for a customer reply at midnight means delaying delivery or dropping the item. The substitute passes the same hard filters as generation, prefers the same category, and is deterministic — two runs must pick the same thing or a retry would change what the customer is charged. If nothing works, the item is dropped, not charged, and the customer is told. `is_substituted` and `original_product_id` are kept on the order item.

**Reliability.** `GET /api/admin/cron-health` alerts when active subscriptions exist but nothing was generated; `POST` reruns the same job under an admin session. A silent cron failure means nobody gets vegetables, and the owner finds out from phone calls at 07:00.

**Notifications** are recorded here and sent by P9's own cron — see below.

### Smart List (M4)

Speak your list, photograph it, or type it.

```
VOICE: mic (max 60s, webm/opus) → STT → EDITABLE transcript → parse → match → review → cart
PHOTO: camera → vision → parse → match → review → cart
TEXT:  typed → parse → match → review → cart
```

**The model splits the sentence; it never picks the product.** AI-4 and AI-5 return `{item, quantity, unit}` with no catalogue in the prompt. Matching is done by the alias dictionary and `match.ts` — because a model that silently maps मिरची to capsicum is a bug nobody can find, whereas a wrong alias is one row the owner can edit.

**394 aliases across 44 products** (`prisma/aliases.ts`), covering regional variants (दुधी / लौकी / घिया), plurals (कांदा / कांदे), and the Latin spellings a phone keyboard actually produces (kanda / kaanda / khanda).

**Marathi quantities are a lookup table, not arithmetic.** पाव, अर्धा, पाऊण, सव्वा, दीड, अडीच, साडेतीन — the amounts a vegetable market actually uses, none of which are digits. Note that साडेदोन is not a word: 2.5 is अडीच. Getting the item right and the amount wrong is worse than not parsing at all.

**Measured match rate: 100%** on a 20-item Marathi voice note (M4 requires ≥80%). The test asserts the floor, so improving aliases can't break it and regressing them will.

**Ambiguity is never resolved by guessing.** Two candidates within 0.12 confidence → amber row with the top 3 to tap. Unmatched → grey row that still appears, and `to-cart` reports what it skipped. Colour is never the only signal: every row carries an icon and a word.

**Without AI**, the deterministic parser reads "दोन किलो कांदा, एक किलो टोमॅटो, अर्धा किलो बटाटा आणि एक जुडी कोथिंबीर" correctly on its own. It is also the typed-entry path, so it is exercised constantly rather than rotting as an untested branch.

### Localisation (R7, B15)

Marathi is the default language and the product, not a checkbox. No user-facing string is hard-coded; everything resolves from `src/i18n/messages/{mr,hi,en}.json`.

URLs are always locale-prefixed (`/mr/wallet`, `/en/wallet`) and `/` redirects to `/mr`. Import `Link`, `useRouter` and `usePathname` from `@/i18n/navigation`, **never** from `next/link` or `next/navigation` — ESLint enforces this, because a raw `next/link` silently drops the locale prefix.

`tests/i18n.test.ts` fails the build if a key is missing from a locale, if a Marathi value contains no Devanagari, or if an ICU placeholder is inconsistent across locales.

### Medical safety (R3, PART 6.4)

Non-negotiable, and mostly enforced in code rather than in prompts:

- Allergens and disliked items are stripped from the catalogue **before** the AI call and re-validated **after** the response. A plan containing a declared allergen is never persisted or displayed.
- Red-flag conditions set `flaggedForReview`, show a doctor-consultation banner and enter the admin review queue. The customer may still proceed.
- Mandatory consent checkbox and disclaimer at intake and on every plan (`MedicalDisclaimer`, `src/components/meal-plan/`).
- The words *prescription*, *treatment*, *cure* and *medical advice* never appear as a claim anywhere in the UI. A test enforces this against the message catalogue.
- `AI_ALLOW_REAL_HEALTH_DATA` defaults to `false`, because free AI tiers may train on prompt data. With the gate off the prompt is **redacted, not disabled**: the model gets an age *band*, household size, diet and goal, and never sees conditions, medications or free-text notes. It loses almost nothing, because allergies and dislikes were already removed from the catalogue in code.

### The meal plan pipeline (M5, PART 6.3)

```
profile + meal-plan-eligible catalogue
  → strip allergens and dislikes from candidates      ← in code, before the call
  → safety pre-check (S3 red flags)                   ← deterministic
  → LLM call, schema-constrained
  → Zod + business rules (ids, 7×2 slots, max 2×/week, no medical wording)
  → fail → retry once with the errors fed back → fail again → rule-based fallback
  → assertNoForbiddenProducts                         ← S4, one last time
  → B4 quantity, in code
  → save as PENDING_CUSTOMER
```

**What makes S4 a guarantee and not a hope:** the model is never given a product it must not pick, so "avoid peanuts" is not something it can forget. An id from outside the candidate list is therefore treated as a *safety* failure, not a formatting nit — and `assertNoForbiddenProducts` runs again on whatever produced the final plan, including the fallback.

**S3 runs before the model and the model can only raise the flag, never lower it.** `flaggedForReview` is the OR of the two. A flagged plan still generates and displays (B8) with a doctor banner; the clinical reason goes to the admin queue, never to the customer.

**The fallback is not an embarrassment.** When the model is rate-limited or returns nonsense twice, a deterministic seeded rotation of in-season vegetables — leafy ones early, max twice a week — is roughly what the owner was writing by hand before this app existed. The plan screen says so when it was used.

### Swaps and approval (M5 part 2)

**Swaps apply instantly (B6).** Reason → 3 AI alternatives → pick → done. No admin approval anywhere in the path: removing the dietitian was the point, and rebuilding the approval wait would automate the paperwork and keep the bottleneck. Every swap is logged and visible in admin — visibility without a gate.

- Suggestions come from the same filtered candidate list as generation, so an allergen cannot be suggested even if the model tries.
- The confirmed product must be one of the three offered, and safety is **re-validated at confirm time** — stock runs out and profiles change in between.
- Anything already used twice this week is excluded, or confirming would break the rule generation enforced.
- The rejected vegetable is remembered as a dislike **only** for "don't like it" and "doesn't agree with me". Swapping because something was out of stock should not blacklist a vegetable the customer likes — and the sheet says which reasons will be remembered before they pick.
- Limit: 10 **applied** swaps per plan per week. Asking what's available isn't rate-limited; changing the plan is.

**Approval (B2, B3, B5).** Duration (7/15/30, first plan defaults to the free 7-day trial), start date, slot, address, then the money:

```
estimated period cost   ← summed per calendar weekday, not daily-average × days
+ 15% buffer            ← shown as its own line, named
+ plan fee              ← ₹99/month, prorated below 30 days, waived on trial
= required wallet balance
```

That total is a **required balance, not a charge**. Only the plan fee is debited at approval; the rest stays in the wallet as the float the daily orders draw down. A short balance returns the exact shortfall and opens the top-up sheet for that amount — nothing is charged and no subscription is created on that path.

### Admin panel (M9)

Desktop-optimised, its own route group (`(admin)`) so Next code-splits it away from the customer bundle entirely (R10) — nothing under `src/components/admin/**` is imported by a customer-facing screen.

```
Dashboard · Picklist ⭐ · Orders · Inventory · Catalogue
Meal plans (flagged queue) · Customers · Swaps · Waitlist · Settings · Audit log
```

**Daily Picklist** is the screen this panel exists for — it replaces the owner's notebook. Two views of the same tomorrow's orders:

- **Aggregate** — one line per variant, summed in the variant's own unit ("2 kg", never "four times 500 g"), sorted heaviest first, with a shortfall column against live stock. This is the list carried to the mandi at 05:00.
- **Packing slips** — one per customer, items grouped under सकाळी / संध्याकाळी (B1), substitutions shown against what they replaced.

Both export as CSV with a UTF-8 BOM and CRLF line endings, because Excel on Windows is what the owner actually opens, and without the BOM every Marathi vegetable name arrives as mojibake.

**Rider assignment (B12) suggests, and never assigns.** `suggestRiders()` ranks available riders in the order's service area by the fewest deliveries already assigned that day, and falls back to the whole pool — with a stated reason — when nobody local is free. The owner taps to confirm; nothing is written until they do, because "with two or three riders the owner knows things the system does not."

**Settings (R8)** is the escape hatch for every hard-coded business number: fee, threshold, portion size, duration and limit lives in `app_settings`, editable here, with the rule in the brief it comes from shown next to the value. Money is entered in rupees and stored in paise (R4) — the one screen that deliberately shows the human unit instead of the stored one.

**Every mutation is audited.** `diffOf()` records only the fields that actually changed — not twenty unchanged columns around the one that moved — so `/admin/audit-log` stays a diff a human can read, comparing by value rather than by strict type so a `"4000"` from a form and a stored `4000` don't read as a change.

RBAC is enforced server-side on every admin route (R9), same as everywhere else in the app — there is no separate admin-only auth path to drift out of sync.

**Delivery Partners** is the admin section M10 actually depends on: a rider cannot sign in to the delivery PWA at all until a row here links their phone number to a `DeliveryPartner`. Creating one is a `User` (role `DELIVERY_PARTNER`) and a partner row written together, and it refuses outright on a phone number already in use rather than silently promoting an existing customer's role. The load column shown here is the same number B12's suggestion panel ranks riders by.

### Rider PWA (M10)

Its own route group (`(delivery)`), same reasoning as the admin panel — riders run cheap Android phones on flaky networks, so this tree stays minimal and never pulls in the customer storefront. Auth reuses the ordinary phone + OTP login; a `DELIVERY_PARTNER` role on the session is what routes a rider here instead of the storefront.

```
Dashboard: today's assignments sorted by slot + availability toggle + daily summary (incl. COD collected)
  → Order detail: customer name, click-to-call, address, map link, item checklist
    → Picked Up → Out for Delivery → Delivered (OTP or proof photo) — or Failed, with a reason
```

**The delivery OTP is never shown to the rider.** It renders on the CUSTOMER's own order screen once a rider is assigned, and only while the delivery is still in progress. The rider's job is to ask for it — a rider who could read it from their own screen would make the whole check pointless. `POST /api/uploads/photo` is the alternative: a proof photo is accepted on its own, checked before an OTP field the rider may not have touched.

**Two status machines move together but are not the same one.** The rider sees Picked Up → Out for Delivery → Delivered/Failed; the order the customer and admin see has five states. Only `Picked Up` actually advances the order (to `OUT_FOR_DELIVERY`) — the finer rider-side step is not something the customer needs a separate status for. Both are guarded by the same conditional-update pattern order cancellation uses (D-60), so two taps racing each other cannot both apply.

### Notifications (M8)

```
notify() / notifyEvent()  →  one row per channel the event needs, IN_APP marked SENT immediately
                           →  WHATSAPP / PUSH stay QUEUED
/api/cron/send-notifications (every 5 min)  →  renders the template in the recipient's language, dispatches, marks SENT/FAILED
```

Every event in Part 7's M8 table fans out to the channels listed there — WhatsApp is B16's primary channel, push is secondary, and SMS is never used here at all because B16 reserves it for OTP alone. `getWhatsAppProvider()` is deliberately a separate switch from the OTP path's `getSmsProvider()` (same reasoning as `AI_STT_PROVIDER`, D-9): a production deployment sends OTP over MSG91 and notifications over WhatsApp at the same time, which one `SMS_PROVIDER` switch cannot express.

Message text is never stored — a notification row holds a template key and structured data (R7), and `src/lib/notifications/render.ts` resolves it into a sentence in the recipient's own language only when it is actually sent, using `next-intl`'s `createTranslator` outside of any request context.

The sender runs as its own cron rather than inline with the event that queued it, for the same reason payment reconciliation does (D-75): one customer's unreachable phone must not stall the order or subscription action that queued the notification.

### Progressive Web App (M11)

```
manifest.json (Phase 0) → real icons (P10) → sw.js offline shell (P10) → installable
```

The manifest existed since Phase 0, but referenced icon files that were never generated — the app was never actually installable until this phase. `npm run icons:generate` rasterises a hand-drawn sprout mark (`scripts/generate-icons.mjs`, using `sharp`) into the 192px, 512px and maskable-512px PNGs the manifest needs; it is a real, placeholder-honest icon (D-16's spirit applied to a brand asset), not a broken link, but a designer's mark should replace it before any store listing.

`public/sw.js` is hand-written rather than generated by a Workbox build step — consistent with R1/R11's "no vendor SDK" posture, and small enough not to need one. It is network-first for pages (falling back to cache, then to `public/offline.html`) and cache-first for Next's own hashed static assets, plus a `push`/`notificationclick` handler that is the browser-side half of M8's push channel (the server-side half shipped in P9). **It registers in production only** — a dev-mode service worker caching `/_next/static/*` would actively fight Turbopack's hot reload, and this machine already has one documented stale-cache footgun (D-89b) without adding a second.

### Play Store (Capacitor)

B18: *"PWA first, Play Store second. Capacitor wrap for Play Store only after the PWA is stable in real use. Same codebase produces both."*

`capacitor.config.ts` is scaffolded and `@capacitor/core`/`@capacitor/cli` are installed, but `npx cap add android` has deliberately not been run — that generates a full native Gradle project, which is only worth committing once there is a real Android Studio + SDK environment to build it in, and B18 itself says the wrap comes after real PWA usage, which this build (no deployment, no connected database) has not had yet. When that day comes, this is the whole remaining path:

```bash
npm install --save-exact @capacitor/android@8.5.0
npm run cap:add-android
npm run cap:sync
npm run cap:open   # opens Android Studio
```

`server.url` in `capacitor.config.ts` points the native shell at the deployed PWA rather than bundling a static copy — a bug fix ships to both surfaces the moment it deploys, with no separate native release for a text change.

---

## Payments

### Three-stage rollout

| Stage | Phase | `PAYMENT_PROVIDER` | Keys | Cost | KYC |
|---|---|---|---|---|---|
| Mock | 0–2 | `mock` | none | ₹0 | No |
| **Test** | 3 onward, all demos | `razorpay` | `rzp_test_…` | ₹0 | **No** |
| Live | Before real customers | `razorpay` | `rzp_live_…` | 2% + 18% GST | Yes |

Razorpay test keys appear immediately after signup. Test mode is functionally identical to live; cards and accounts are simply never charged.

**Test credentials:** card `4111 1111 1111 1111` (any future expiry, any CVV) · UPI success `success@razorpay` · UPI failure `failure@razorpay`.

### The webhook is the source of truth

The wallet is credited **only** by a signature-verified `payment.captured` webhook at `POST /api/webhooks/razorpay`. The browser callback updates the UI optimistically and does nothing else.

This is not paranoia. The client handler can be tampered with, and it simply does not fire when the app closes or the network drops mid-payment — which on rural 4G happens constantly. Crediting from the callback lets users credit themselves for free while honest users lose money they actually paid.

- HMAC-verified against `RAZORPAY_WEBHOOK_SECRET`; a bad signature is a 400 and a log line.
- Idempotent on `gateway_payment_id`. Razorpay retries; a replay must never double-credit.
- The full raw payload is stored in `payments.raw_payload`.
- Anything `PENDING` for over 15 minutes is re-queried against the Razorpay API by the reconciliation job.
- **The app refuses to boot in production with an `rzp_test_` key** (`assertProductionSafety()` in `src/lib/env.ts`).

### Testing webhooks locally

Razorpay cannot reach `localhost`, so tunnel it:

```bash
# Cloudflare Tunnel (no account needed for a quick tunnel)
cloudflared tunnel --url http://localhost:3000

# or ngrok
ngrok http 3000
```

Then in the Razorpay dashboard → Settings → Webhooks, point the URL at
`https://<your-tunnel>/api/webhooks/razorpay`, subscribe to `payment.captured`,
`payment.failed` and `refund.processed`, and put the signing secret in
`RAZORPAY_WEBHOOK_SECRET`.

With `PAYMENT_PROVIDER=mock` you need no tunnel at all — `MockPaymentProvider.simulateCapture()` produces a correctly signed payload, and `tests/services.test.ts` exercises the tampered-signature and ten-times-replay cases.

### No UPI Autopay, no Razorpay Subscriptions

Recurring billing is handled entirely by the wallet prepayment model. Daily deliveries debit the internal ledger and touch no gateway at all — one gateway transaction per period instead of thirty. The fee is nearly identical either way; the difference is thirty daily chances for a mandate to fail versus one.

Refunds go to the wallet (`REFUND_DESTINATION=wallet`). Bank refund on explicit request or account closure, with no friction.

---

## Hosting

| Stage | Where | Cost |
|---|---|---|
| Development | Local + Cloudflare Tunnel for webhooks | ₹0 |
| Client demo | Vercel preview deployment | ₹0 |
| Commercial launch | **Vercel Pro** | ~$20/mo |
| Escape hatch | Cloudflare Workers via `@opennextjs/cloudflare` | ₹0 |

> ⚠️ **Vercel Hobby is non-commercial only, and their definition is broad** — it explicitly covers being paid to build or host a site, so a client project is commercial before it takes a single rupee. **Pro is required from launch day**, not from the first sale.

R11 keeps the Cloudflare door open: no Vercel-only APIs, standard Web Fetch throughout, small serverless functions. The one current blocker is the Node-only MySQL driver adapter — see D-2 in `DECISIONS.md`.

### Region

> ⚠️ **TiDB Cloud Starter has no India region.** Mumbai ↔ Singapore is roughly 60–80 ms round trip, and that is per **query**, not per request.

**Deploy serverless functions to Singapore (`sin1`), the same region as the TiDB instance.**

```
❌ Compute in Mumbai:    user 5ms  + (6 queries × 60ms) = ~365ms
✅ Compute in Singapore: user 60ms + (6 queries × 2ms)  = ~72ms
```

Static assets and images still serve from the CDN edge in Mumbai; only dynamic API calls cross the water. Regardless of region, **avoid N+1 queries** — batch with `include`/`in`, cache `/api/home`, and keep round trips per request low.

### Free-tier notes that affect the build

- **TiDB Starter:** 5 GiB row storage, 50M Request Units. Requires TLS (`?sslaccept=strict`). No native full-text search — search uses `LIKE`/keyword columns plus the `product_aliases` table. With `relationMode = "prisma"` the database does **not** create foreign-key indexes, so **every foreign key column carries an explicit `@@index`** in `schema.prisma`. Removing one turns a lookup into a table scan.
- **Cloudinary:** 25 credits/month, and there is nothing between free and ~$99/month. Cloudflare R2 is the documented exit; the storage port is what makes that an `.env` change.
- **Gemini free tier may train on prompts.** Hence `AI_ALLOW_REAL_HEALTH_DATA=false` and synthetic profiles during demos.
- **SMS in India requires DLT registration** for production. `MockSmsProvider` (fixed OTP `123456`) unblocks all development.

---

## Project structure

```
prisma/
├── schema.prisma          Complete PART 8 data model, @@index on every FK
├── aliases.ts             394 Marathi/Hindi/English grocery aliases (M4)
├── seed.ts                Idempotent, realistic Indian grocery data
└── reset-demo.ts          Wipes demo activity, keeps catalogue + seed accounts
scripts/
└── generate-icons.mjs     Rasterises the PWA icon set (npm run icons:generate)
capacitor.config.ts        Play Store wrap — scaffolded, `cap add android` not yet run
public/
├── manifest.json · icons/ PWA install metadata + icon set (P10)
├── sw.js                  Hand-written offline shell + push display (P10)
└── offline.html           Fallback when nothing is cached and the network is down
src/
├── app/
│   ├── [locale]/
│   │   ├── (shop)/        Customer storefront + 5-tab bottom nav
│   │   ├── (admin)/       Admin panel — never bundled with the storefront
│   │   └── (delivery)/    Rider PWA
│   └── api/               Route handlers
├── components/
│   ├── ui/                shadcn primitives
│   ├── auth/              login flow, profile form
│   ├── shop/ meal-plan/ smart-list/ admin/ delivery/
│   └── providers/
├── hooks/                 use-session, use-recent-searches
├── stores/                cart (Zustand + localStorage)
├── i18n/
│   ├── routing.ts navigation.ts request.ts
│   └── messages/{mr,hi,en}.json
├── lib/
│   ├── services/          ⭐ the six ports
│   ├── auth/              jwt · otp · session (RBAC)
│   ├── catalog/           queries (no N+1) · text (search/transliteration)
│   ├── cart/              server cart · guest merge
│   ├── orders/            pricing (B10) · status machine · create · cancel · issues
│   ├── meal-plan/         taxonomy · allergens (S4) · safety (S3) · candidates
│   │                      validate · fallback · generate · queries
│   │                      swap (B6) · pricing (B2) · approve (B3)
│   ├── ai/                prompts/ (versioned) · schemas/ · logger
│   ├── smart-list/        numbers · units · parse-text · match · pipeline
│   ├── subscription/      schedule · substitute (B7) · generate-orders
│   │                      daily-jobs · queries (My Week) · manage
│   ├── notifications/     notify · notifyEvent · render (ICU) · send · push-tokens
│   ├── wallet/            ledger (R4) · topup · webhook · reconcile · adjust
│   ├── admin/             picklist · orders (B12 suggest) · inventory · catalogue
│   │                      customers · meal-plans · settings (R8) · audit (diffOf)
│   │                      delivery-partners
│   ├── delivery/          guard (rider RBAC) · queries · status · availability
│   ├── cron.ts            Bearer CRON_SECRET guard, IST helpers
│   ├── serviceability.ts  B11 — pincode allow-list AND 8 km radius
│   ├── validators/        shared Zod schemas (form + API)
│   ├── api/response.ts    { success, data, error }
│   ├── api/handler.ts     route() wrapper, ApiError
│   ├── db.ts              Prisma singleton (lazy)
│   ├── env.ts             Bootstrap config + production safety assertion
│   ├── settings.ts        app_settings reader (R8)
│   ├── money.ts           Paise helpers (R4)
│   ├── quantity.ts        The B4 formula
│   └── ids.ts             Prefixed, time-sortable ids
├── instrumentation.ts     P2 boot assertion — refuses rzp_test_ in production
└── generated/prisma/      Build output — git-ignored
tests/                     Vitest, mocks only
```

---

## Phase status

| Phase | Deliverable | Status |
|---|---|---|
| **P0** | Foundation: schema, six ports, i18n, design system, app shell | ✅ Done |
| **P1** | M1, M2 — auth, addresses, serviceability, catalogue, search | ✅ Done |
| **P2** | M3 — cart, checkout, idempotent orders, status machine, COD | ✅ Done |
| **P3** | M7 — wallet, Razorpay test top-up, verified webhook, reconciliation | ✅ Done |
| **P4** | M5 part 1 — health profile, AI generation, full safety layer | ✅ Done |
| **P5** | M5 part 2 — swaps, approval, wallet prepay | ✅ Done |
| **P6** | M6 — subscriptions, 00:30 cron, auto-substitution | ✅ Done |
| **P7** | M4 — Smart List voice and photo | ✅ Done |
| **P8** | M9 — admin panel and the daily picklist | ✅ Done |
| **P9** | M10, M8 — rider PWA and notifications | ✅ Done |
| **P10** | M11 — PWA polish, performance, accessibility, Capacitor | ✅ Done |

**Demo order for the client:** P1 → P2 → P4 → P5 → P6. That sequence tells the whole business story — browse, buy, get a plan, tweak it, receive daily deliveries — in about four minutes.

---

## Seeded demo accounts

| Phone | Role |
|---|---|
| `9999900001` | Super Admin |
| `9999900002` | Customer (सुनिता पवार) |
| `9999900010` | Delivery Partner (रमेश शिंदे, Pathardi) |
| `9999900011` | Delivery Partner (सुरेश काळे, Mirajgaon) |

OTP while `SMS_PROVIDER=mock` is `123456` (`DEV_FIXED_OTP`). The mock also prints every message to the server console. A delivery partner logs in through the same `/login` screen as a customer — the role on their account routes them to `/delivery` instead of the storefront.

Before a client demo, `npm run db:reset-demo` wipes every order, wallet transaction, meal plan, subscription and notification, and removes any account beyond these four — a clean slate without touching the catalogue or `app_settings`. It refuses to run when `NODE_ENV=production`.
