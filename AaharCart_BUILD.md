# AaharCart — Complete Build Brief

> **HOW TO USE THIS FILE**
>
> Open a fresh conversation in **Claude Code**, attach this file, and send exactly this message:
>
> > *Read AaharCart_BUILD.md completely, then begin Phase 0.*
>
> That is all. Everything the build needs is in this document. Nothing is left open.

---

**Project:** AaharCart — a Blinkit-style quick-commerce grocery app for Maharashtra, with an AI-generated personalised weekly vegetable meal plan and daily subscription delivery.
**Version:** 1.0 (final, all decisions locked)
**Date:** August 2026

---

# PART 0 — YOUR MISSION

You are the lead full-stack engineer on this project. This document is the complete and final specification. Every business question has already been decided — **do not reopen them, do not ask the client to confirm scope, do not propose alternatives to locked decisions.** Build what is written here.

Where this document is genuinely silent on a small implementation detail, choose the sensible option, record it in `DECISIONS.md`, and keep moving.

## 0.1 Hard Rules

These are correctness requirements, not style preferences. Violating one is a bug.

**R1 — Provider abstraction is mandatory.**
Every external service sits behind an interface in `src/lib/services/<port>/`. The six ports are `ai`, `sms`, `storage`, `payment`, `push`, `queue`. Each contains `types.ts` (interface), `index.ts` (env-var factory), `providers/*.ts`, and `mock.ts`. Application code must **never** import a vendor SDK directly. Add an ESLint `no-restricted-imports` rule blocking vendor packages outside `src/lib/services/**`. Moving from a free tier to a paid tier must be a `.env` change and nothing else.

**R2 — Every port ships its mock first.**
Write `mock.ts` before any real provider. Mocks are deterministic. The whole app must run end to end with every provider set to `mock`. All tests run against mocks, so CI is free and never rate-limited.

**R3 — Medical safety is not optional.** See Part 6. Summarised:
- Allergens and disliked items are filtered **out of the catalogue before** the AI call and **re-validated after** the response. A plan containing a declared allergen must never be persisted or displayed. Enforce in code, not in the prompt.
- Red-flag conditions set `flaggedForReview = true`, show a doctor-consultation banner, and enter the admin review queue.
- Mandatory consent checkbox and medical disclaimer at intake and on every plan.
- Never use the words *prescription*, *treatment*, *cure*, or *medical advice* anywhere in the UI.
- `AI_ALLOW_REAL_HEALTH_DATA` defaults to `false`, because free AI tiers may train on prompt data.

**R4 — Money is integer paise, stored as BigInt.** Never floats. The wallet is an **append-only ledger**; balance is derived, never a mutable column. Every wallet transaction is idempotent on `(source, ref_type, ref_id)`.

**R5 — Idempotency everywhere.** Order creation takes a client idempotency key. The daily-order cron has a unique constraint on `(subscription_id, scheduled_date)`. Payment webhooks are signature-verified and idempotent on `gateway_payment_id`. Running any job twice must be harmless.

**R6 — AI output is always schema-validated.** Every AI call returns JSON validated with Zod, constrained to real catalogue product IDs, retried exactly once with the validation error fed back, and falls back to a deterministic rule-based result if it still fails. Log every call to `ai_generation_logs`. Version every prompt file.

**R7 — No hard-coded user-facing strings.** Everything comes from `messages/{mr,hi,en}.json`. Marathi is the default locale and must contain real translations, not placeholders.

**R8 — No hard-coded business numbers.** Every fee, threshold, portion size, duration and limit is seeded into `app_settings` and editable from the admin panel at runtime. Env values are bootstrap defaults only.

**R9 — RBAC is server-side on every route.** Never rely on a client-side role check. Validate every API input with Zod.

**R10 — Mobile-first.** Design for a 390px viewport. Minimum 44×44px touch targets. Assume a mid-range Android phone on 4G. Initial JS bundle under 200 KB gzipped. The admin panel must not ship in the customer bundle.

**R11 — Stay Cloudflare-compatible.** Avoid Vercel-only APIs. Use standard Web Fetch APIs. Keep serverless functions small, so hosting can move later without a rewrite.

## 0.2 How To Work

Build in the phase order in Part 11. For each phase:

1. State the phase goal and list the files you will create or change.
2. Write the code. **Complete files.** No `// ... rest of the implementation` placeholders.
3. Update the Prisma schema and generate a migration if the data model changed.
4. Extend the seed script so the phase is demoable with realistic Indian grocery data — real Marathi vegetable names, realistic prices in paise, real category structure.
5. Verify it builds and typechecks.
6. **STOP.** Report: what works now, what to click to see it, what is next, and any judgement call I should know about.

Do not skip ahead. Do not start the next phase until told to continue.

Maintain `DECISIONS.md` at the repo root. Every judgement call this document did not cover gets one line: the decision, why, and what would change it.

---

# PART 1 — THE PRODUCT

A customer in Pathardi, Maharashtra installs the app and logs in with a mobile OTP. They can shop normally — categories, cart, order, delivery — or they can fill in a health profile and receive an **AI-generated Monday-to-Sunday vegetable plan**: one vegetable for the morning meal and one for the evening meal, every day.

If they dislike a vegetable, they request a swap and the AI instantly proposes three alternatives. Once they approve the plan, they prepay into their in-app wallet and the system generates a delivery order **automatically every single day**, debiting the wallet.

There is also a **Smart List**: the customer speaks their grocery list in Marathi, or photographs a handwritten list, and AI turns it into a cart.

**There is no human dietitian in this system.** The AI replaces that role, which is exactly why Part 6 exists.

### What exists today
The business is run entirely by hand. The owner collects health details on paper or WhatsApp, writes a weekly plan, negotiates swaps over messages, and delivers daily while tracking everything mentally. We are replacing that.

### Roles

| Role | Access |
|---|---|
| **Guest** | Browse catalogue and search. Cannot add to cart. |
| **Customer** | Everything customer-facing |
| **Delivery Partner** | Assigned orders, status updates, delivery OTP |
| **Store Admin** | Catalogue, stock, orders, picklist, swaps, wallet adjustments |
| **Super Admin** | Everything, plus users, settings, AI config, audit log |

### Out of scope for v1
Calorie/macro tracking, cooked meal delivery, multi-vendor marketplace, live rider GPS map, loyalty tiers and referrals, ratings and reviews, desktop-optimised storefront, iOS App Store.

---

# PART 2 — LOCKED BUSINESS RULES

These are decided. Build to them exactly.

### B1 — One delivery per day
A subscriber gets **one delivery**, in a single morning slot **06:30–09:00 IST**, containing **both** the morning and evening vegetables for that day.
*The brief's "morning/evening" refers to meals, not deliveries. Two deliveries would double rider cost for no customer benefit.*

Packing slips group items under **सकाळी** / **संध्याकाळी** headers so the customer knows what to cook when.

### B2 — Pricing: per-delivery + flat plan fee
Vegetables are billed **daily at the live catalogue price**. A separate **₹99/month plan fee** covers personalisation, unlimited swaps, and free delivery on plan days. The first 7-day trial plan has **no plan fee**.
*A flat all-inclusive price is a trap — Indian vegetable prices are volatile enough that one tomato spike would make every subscriber loss-making at once.*

`subscriptions.pricing_mode = PER_DELIVERY`. The `FLAT` mode stays in the schema, unused.
The approval screen must show estimated daily cost, estimated period total, plan fee, and a clear "prices vary daily with market rates" line. Tomorrow's exact bill goes out in the 20:00 preview notification.

### B3 — Prepay the full period into the wallet
At plan approval the customer prepays `(estimated period cost × 1.15) + plan fee` into the wallet. Daily deliveries debit that balance.
*This is what makes the business actually get paid, and it removes daily payment failure entirely.*

- Short balance at approval → route to top-up for the difference, then return to approval
- Balance below one day's estimated cost → top-up notification at 20:00 the previous evening
- Insufficient at generation → hold order `PAYMENT_PENDING`, notify, retry 08:00; still unpaid → mark that day `SKIPPED_UNPAID`, subscription continues
- On cancellation, refund unused balance to the wallet. Never forfeit it.

### B4 — Portion quantity is computed in code, never by the AI
```
serving_units  = adults + (children × 0.5)
raw_grams      = 200 × serving_units
quantity_grams = round_UP_to_nearest(raw_grams, 250)
min 250 g, max 2000 g (above max → flag for admin review)
```
Four adults → 800 g → **1000 g**. Two adults + one child → 500 g → **500 g**.
*250 g steps because that is how vegetables are actually weighed and packed.*

Piece/bunch items (coriander, curry leaves, lemon): 1 bunch per 4 serving units, minimum 1.

### B5 — Plan duration and repetition
The Mon–Sun plan is a **template that repeats weekly**. Durations: **7 / 15 / 30 days**. First plan defaults to **7 days, free trial**. Every plan after that defaults to **30 days**.
After 4 repeated weeks, prompt: *"तुमचा plan refresh करायचा का?"* → one AI call generates a new template.
Editing the health profile always prompts regeneration. Regeneration creates a **new version**; a running subscription switches at the next Monday, never mid-week.

### B6 — Swaps apply instantly, no admin approval
Customer requests a swap → AI returns 3 alternatives → customer picks → applied immediately.
*Removing the dietitian was the point; rebuilding the approval wait would automate the paperwork and keep the bottleneck.*

`FEATURE_ADMIN_SWAP_APPROVAL = false` (flag retained for future use). Every swap is logged and visible in admin — visibility without a gate. The rejected vegetable is auto-added to `disliked_product_ids`. Limit: **10 swaps per plan per week**.

### B7 — Out-of-stock items are auto-substituted
At 00:30 order generation, an out-of-stock vegetable is replaced automatically using the swap logic, and the customer is notified at 08:00 with the reason and a one-tap "हे नको" that adds it to dislikes.
*This decision happens at midnight; waiting for a customer reply means delaying delivery or dropping the item.*

Substitute must pass the same hard filters: not an allergen, not disliked, in stock, meal-plan-eligible, same category where possible. Price difference settles honestly in the wallet. Mark `is_substituted = true` and retain `original_product_id`. If no acceptable substitute exists, drop the item, do not charge, and notify.

### B8 — Human review only for red flags
Red-flagged plans still generate and display, with a prominent **"कृपया डॉक्टरांचा सल्ला घ्या"** banner, and appear in the admin review queue. The customer may proceed without waiting — the banner and disclaimer are the safeguard, the review is a second layer. Admin dashboard shows the unreviewed count prominently.

### B9 — COD for instant orders only
`FEATURE_COD = true`, but checkout hides COD when `order.type = MEAL_PLAN_DAILY`. COD capped at ₹1,500.
*COD on daily recurring delivery makes cash reconciliation the owner's second job.*

### B10 — Fees and thresholds

| Setting | Value |
|---|---|
| Minimum order value (instant) | ₹149 |
| Delivery fee (instant, below threshold) | ₹25 |
| Free delivery threshold (instant) | ₹299 |
| Delivery fee (meal plan days) | ₹0 always |
| Handling fee | **₹0 — do not add one** |
| Plan fee | ₹99/month, waived on first trial |
| Low-wallet alert | ₹200 |
| COD cap | ₹1,500 |

### B11 — Service area
**Pincode allow-list AND 8 km radius** from the store — both must pass. Seeded with Pathardi and surrounding pincodes.
Non-serviceable users see a waitlist screen capturing phone and pincode. Admin dashboard shows waitlist demand grouped by pincode — that is how the owner decides where to expand.

### B12 — Rider assignment is manual with a suggestion
The system suggests; the owner confirms with one tap. Include an "Assign all suggested" bulk button. No auto-assignment.
*With two or three riders the owner knows things the system does not.*

### B13 — Non-vegetable categories are never in meal plans
All six home categories ship. Only **Vegetables and Fruits** have `is_meal_plan_eligible = true`. Ice Cream, Bakery & Biscuits, Dairy and Grocery are normal catalogue items only.

### B14 — Complaint credits auto-approve below ₹100
A photo-backed quality complaint under ₹100 is auto-credited to the wallet, maximum **2 per customer per month**. Above that value or limit → admin review. Repeat patterns surface in admin.

### B15 — Marathi is the default language
`mr` is pre-selected on first launch; `hi` and `en` available. Marathi is the product, not a localisation checkbox.

### B16 — WhatsApp is the primary notification channel
WhatsApp primary, push secondary, SMS **only** for OTP.
*Push reach in this segment is genuinely poor. The business already runs on WhatsApp.*

### B17 — Guest browsing, login at commitment
Full catalogue is public. Login required at add-to-cart and meal-plan entry.

### B18 — PWA first, Play Store second
Ship an installable PWA. Capacitor wrap for Play Store only after the PWA is stable in real use. Same codebase produces both.

---

# PART 3 — PAYMENTS

### P1 — Razorpay, three-stage rollout

| Stage | Phase | Provider | Cost | KYC |
|---|---|---|---|---|
| Mock | 0–2 | `MockPaymentProvider` | ₹0 | No |
| **Test** | 3 onward, all demos | Razorpay sandbox | ₹0 | **No** |
| Live | Before real customers | Razorpay live keys | 2% + 18% GST | Yes |

Razorpay test keys are generated immediately after signup — KYC and activation are required only for live payments. Test mode is functionally identical to live; cards and accounts are simply never charged.

Test credentials for the README: card `4111 1111 1111 1111` (any future expiry, any CVV), UPI success `success@razorpay`, UPI failure `failure@razorpay`.

### P2 — Webhooks are the source of truth
The wallet is credited **only** by a signature-verified `payment.captured` webhook. The browser callback updates UI optimistically and does nothing else.
*The client handler can be tampered with, and it simply does not fire when the app closes or the network drops mid-payment — which on rural 4G happens constantly. Crediting from the callback lets users credit themselves for free while honest users lose money they actually paid.*

- `POST /api/webhooks/razorpay`, HMAC-verified against `RAZORPAY_WEBHOOK_SECRET`
- Idempotent on `gateway_payment_id` — Razorpay retries; a replay must never double-credit
- Store the full raw payload in `payments.raw_payload`
- Reconciliation job: anything `PENDING` for over 15 minutes is re-queried against the Razorpay API and resolved
- **Startup assertion:** refuse to boot in production if `RAZORPAY_KEY_ID` starts with `rzp_test_`
- README must document local webhook testing via a tunnel (ngrok / Cloudflare Tunnel)

### P3 — Refunds go to the wallet
`REFUND_DESTINATION=wallet`. Bank refund only on explicit request or account closure — no friction, clearly stated in Terms.
*The original 2% fee is not returned on a refund, so a bank refund costs the business twice on money it never kept. But the customer must never feel trapped; if the wallet default is ever used as a lock-in it becomes a trust problem far more expensive than the fee it saved.*

### P4 — No UPI Autopay, no Razorpay Subscriptions
Recurring billing is handled entirely by the wallet prepayment model. **Daily deliveries debit the internal ledger and touch no gateway at all** — one gateway transaction per period instead of thirty. The fee is nearly identical either way; the difference is thirty daily opportunities for a mandate to fail versus one.

*V2 idea: UPI Autopay as an auto-top-up trigger ("below ₹300, add ₹1,000") — that fits the wallet model rather than replacing it.*

### P5 — Keep the provider interface generic
`createOrder`, `verifyWebhook`, `refund`, `fetchPayment`. No Razorpay-shaped field names may leak into application code. **Cashfree** is the documented fallback if activation is refused, then **PhonePe PG**. Do not use Stripe — it is card-only in India, has no UPI, and is materially more expensive for domestic traffic.

### P6 — Financial planning assumption
Assume **2.4%** blended (2% + 18% GST). UPI rates in India are ambiguous — zero-MDR applies below ₹2,000 but gateways apply platform fees, and most top-ups here will exceed ₹2,000 anyway. Budget 2.4% and be pleasantly surprised.

---

# PART 4 — TECH STACK

| Layer | Choice |
|---|---|
| Framework | **Next.js 15+ App Router, TypeScript strict** |
| UI | Tailwind CSS + shadcn/ui |
| State | Zustand (cart, UI) + TanStack Query (server state) |
| Forms | React Hook Form + Zod (schemas shared with API validation) |
| ORM | Prisma, `provider = "mysql"`, `relationMode = "prisma"` |
| Database | **TiDB Cloud Starter** (free tier) |
| Media | **Cloudinary** (free tier) |
| Auth | Custom JWT + OTP using `jose` |
| Payments | **Razorpay** |
| AI | Provider-abstracted: Gemini free → Claude/Gemini paid |
| i18n | `next-intl` — mr / hi / en |
| Cron | Vercel Cron (demo) → Cloudflare Cron / QStash |
| Mobile | PWA, then Capacitor Android |
| Errors | Sentry (free tier) |

### 4.1 Hosting — decided

| Stage | Where | Cost |
|---|---|---|
| Development | Local (`next dev`) + Cloudflare Tunnel for webhook testing | ₹0 |
| Client demo | **Vercel** preview deployment | ₹0 |
| Commercial launch | **Vercel Pro** | ~$20/mo (₹1,750) |
| Escape hatch | Cloudflare Workers via `@opennextjs/cloudflare` | ₹0, commercial-legal |

**Vercel, not Cloudflare, for now.** Cloudflare Workers' free tier permits commercial use and would save the $20, but its free plan caps a Worker at 3 MiB compressed, and Next.js plus Prisma plus auth libraries realistically overflow that. Fighting the OpenNext adapter and the size limit costs days of engineering to save ₹1,750/month — a bad trade at this stage. Revisit when bandwidth actually starts costing money.

⚠️ **Vercel Hobby is non-commercial only, and their definition is broad** — it explicitly covers being paid to build or host a site, so a client project is commercial even before it takes a single rupee. For the demo phase this is a preview URL nobody transacts on and the practical risk is low, but the honest options are: accept that, upgrade to Pro at demo time, or demo from localhost over a Cloudflare Tunnel. **Pro is required from launch day**, not from the first sale.

**R11 exists precisely to keep the Cloudflare door open.** Do not use Vercel-only APIs.

### 4.2 Region — put compute next to the database, not next to the user

⚠️ **TiDB Cloud Starter has no India region.** It runs on AWS only, in a standard US zone plus premium Singapore, Tokyo and Frankfurt zones. Mumbai ↔ Singapore is roughly 60–80 ms round trip.

That number is per **query**, not per request. A page doing six sequential queries from Mumbai compute against a Singapore database spends nearly half a second waiting on the network alone.

**DECISION: deploy serverless functions to Singapore (`sin1`), the same region as the TiDB instance.** The user then pays one 60 ms hop to reach the API, after which every database query is local. Static assets and images still serve from the CDN edge in Mumbai, so only dynamic API calls cross the water.

```
❌ Compute in Mumbai:    user 5ms  + (6 queries × 60ms) = ~365ms
✅ Compute in Singapore: user 60ms + (6 queries × 2ms)  = ~72ms
```

**BUILD:**
- Set the Vercel function region to `sin1`. Create the TiDB instance in Singapore.
- Regardless of region, **avoid N+1 queries**. Batch with `include`/`in` clauses, cache the `/api/home` payload, and keep the number of round trips per request low. This is good practice anywhere and load-bearing here.
- *If cross-region latency ever becomes the bottleneck,* the fix is to move the database to a Mumbai-region Postgres (Supabase offers one) and move compute to `bom1`. Keep Prisma usage portable enough that this stays a migration rather than a rewrite — but do not do it pre-emptively.



### 4.3 Free-tier notes that affect the build

- **TiDB Starter:** free, no credit card, 5 GiB row storage and 50M Request Units per instance. Requires TLS (`?sslaccept=strict`). No native full-text search — search uses `LIKE`/keyword columns plus the alias table. With `relationMode = "prisma"` the database does **not** create foreign-key indexes, so **you must add an explicit `@@index` on every foreign key column** or queries will table-scan. Region caveat in 4.2.
- **Cloudinary:** free tier is 25 credits/month (1 credit ≈ 1 GB storage *or* 1 GB bandwidth *or* 1,000 transformations). There is **no tier between free and ~$99/month**, so the storage port matters — Cloudflare R2 is the documented exit.
- **Gemini free tier may train on prompts.** Hence `AI_ALLOW_REAL_HEALTH_DATA=false` and synthetic profiles only during demo.
- **SMS in India requires DLT registration** for production. `MockSmsProvider` (fixed OTP `123456`) unblocks all development.

---

# PART 5 — DESIGN SYSTEM & UI

### Bottom navigation — 5 tabs
```
Home  |  Smart List  |  My Meal Plan  |  Wallet  |  Profile
```
The **Smart List mic icon sits in the centre** and is the most prominent element.

### Home screen
Sticky header: delivery time estimate + address selector + wallet balance chip + profile avatar. Then a promo banner carousel. Then a category grid with at least these six:

**Vegetables · Fruits · Dairy · Bakery & Biscuits · Ice Cream · Grocery**

Then a **Bestsellers** section using 4-image collage tiles with a **"+N more"** badge.

Data-driven throughout — admin can add and reorder categories.

### Tokens
```css
--primary:        #1B7A43;  /* deep leaf green */
--primary-fg:     #FFFFFF;
--accent:         #F2A33C;  /* warm saffron */
--surface:        #FDFCF8;  /* warm off-white */
--surface-raised: #FFFFFF;
--text:           #16211B;
--text-muted:     #5C6B62;
--success:        #1B7A43;
--warning:        #C97A17;
--danger:         #C0392B;
--radius:         14px;
```

Rounded cards, generous whitespace, clear price hierarchy with struck-through MRP.

**Typography:** use one font family with proper Devanagari support across the entire UI. Do **not** pair a Latin-only display font with a Devanagari fallback — the mismatch looks broken in Marathi, which is the default language.

---

# PART 6 — AI DESIGN & SAFETY

### 6.1 AI features

| # | Feature | Input | Output |
|---|---|---|---|
| AI-1 | Meal plan generation | Health profile + catalogue | 7-day structured plan |
| AI-2 | Swap suggestions | Item + profile + catalogue | 3 alternatives with reasons |
| AI-3 | Voice → transcript | Audio (mr/hi/en) | Text |
| AI-4 | Transcript → items | Text | `[{item, qty, unit}]` |
| AI-5 | Photo → items | Image | `[{item, qty, unit}]` |
| AI-6 | Product rationale | Product + profile | One sentence (cached) |

### 6.2 The provider interface

```ts
export interface AIProvider {
  generateJSON<T>(opts: {
    system: string; user: string; schema: ZodSchema<T>; maxTokens?: number;
  }): Promise<T>;

  transcribeAudio(opts: {
    audio: Buffer; mimeType: string; languageHint?: 'mr' | 'hi' | 'en';
  }): Promise<{ text: string; detectedLanguage: string }>;

  extractFromImage<T>(opts: {
    image: Buffer; mimeType: string; prompt: string; schema: ZodSchema<T>;
  }): Promise<T>;
}
```
Implementations: `GeminiProvider`, `AnthropicProvider`, `GroqProvider`, `MockProvider`. Selected by `AI_PROVIDER`.

### 6.3 Prompt rules

1. **Catalogue-constrained.** The model receives `{id, name, tags}` and may return only IDs from that list. Any ID outside it is a validation failure.
2. **Strict JSON schema.** No prose. Zod-validated. Retry once with the validation error appended.
3. **Hard constraints in code, not prompts.** Allergens and dislikes are removed from the catalogue *before* the call and re-checked *after*.
4. Low temperature for structured extraction.
5. Cache rationale strings. Compress the catalogue payload. Log tokens to `ai_generation_logs`.
6. Prompts live in `src/lib/ai/prompts/` with a version constant stored alongside every generation.

**AI-1 output schema:**
```json
{
  "plan": [{
    "dayOfWeek": "MONDAY",
    "meals": [
      { "slot": "MORNING", "productId": "prd_123", "rationale": "High in iron, supports your reported anaemia." },
      { "slot": "EVENING", "productId": "prd_456", "rationale": "..." }
    ]
  }],
  "overallNote": "Balanced across iron, fibre and vitamin C for the week.",
  "flaggedForReview": false,
  "flagReason": null
}
```
Note the AI returns **no quantity** — that is computed by B4.

**Generation pipeline:**
```
load profile + meal-plan-eligible catalogue
  → strip allergens and dislikes from candidates
  → safety pre-check (red flags)
  → LLM call, schema-constrained
  → Zod validation + business rules:
       no allergen · no disliked item · all IDs in catalogue
       all 7 days × 2 slots filled · no vegetable more than 2× per week
  → fail → retry once with error feedback → fail again → rule-based fallback
  → apply B4 quantity formula
  → save as MealPlan (PENDING_CUSTOMER)
```

### 6.4 Medical safety layer — NON-NEGOTIABLE

Removing the dietitian is a business decision and also a liability decision. The app must clearly be a **vegetable-selection assistant**, not medical nutrition therapy.

**S1 — Positioning.** Never write *prescription*, *treatment*, *cure*, or *medical advice*. Use "suggested vegetable plan".

**S2 — Disclaimer.** At intake with a mandatory checkbox, on every generated plan, and in Terms:

> *This plan suggests vegetables based on the information you provided. It is generated automatically and is not medical advice, diagnosis, or treatment. Please consult a doctor or registered dietitian before making dietary changes, especially if you have a medical condition, are pregnant, or take medication.*

Translate properly into Marathi and Hindi.

**S3 — Red-flag routing.** Any of these sets `flaggedForReview = true`:
- Age under 18 or over 75
- Pregnancy or breastfeeding
- Chronic kidney disease or dialysis *(potassium restriction is genuinely dangerous to get wrong)*
- Cancer treatment
- Type 1 diabetes, or insulin use
- Eating-disorder indicators, or a stated goal of extreme or rapid weight loss
- Recent surgery
- Free-text notes matching a red-flag keyword list

**S4 — Allergy hard-block.** Code-level guarantee, not a prompt-level hope. A plan containing a declared allergen must never be persisted or shown.

**S5 — No calorie or macro prescriptions in v1.** Vegetable selection only.

**S6 — Data protection.** Health data is sensitive personal data under India's DPDP Act. Explicit timestamped consent. Health profile access restricted to the customer and Super Admin, every admin view logged. Never send real health data to a training-enabled free tier — gate on `AI_ALLOW_REAL_HEALTH_DATA`.

**S7 — Human override.** Admin can always edit a plan manually. The manual path from the old business must remain available.

---

# PART 7 — MODULES

### M1 — Auth & Onboarding
```
Splash → Language (mr default) → Location permission → Serviceability check
   ├─ Not serviceable → Waitlist (capture phone + pincode)
   └─ Serviceable → Home (guest browse)
                       │ [add to cart / meal plan tapped]
                       ▼
              Phone → OTP (6 digit) → new user? → Profile (name, DOB, gender)
                       ▼
              Address (map pin + house, landmark, pincode, label) → return
```
- OTP: 6 digits, 5-minute expiry, max 5 attempts, 60s resend cooldown, max 5 requests per number per hour
- Offer "resend via WhatsApp" after 30s
- JWT access + refresh in httpOnly cookies, 30-day refresh
- Multiple saved addresses, one default
- Logout, delete account, data export

### M2 — Catalog & Browse
Home, Category Listing, Product Grid, Product Detail, Search.
- Product card: image, localised name, weight/unit, struck-through MRP, price, ADD → quantity stepper
- PDP: gallery, description, variants (250g/500g/1kg), nutrition, "why this is good for you" if in the user's plan, similar products
- Search: debounced autocomplete, recent searches, matches Marathi + English + transliteration (`kanda` → कांदा → Onion) via the `product_aliases` table
- Out of stock: greyed card + "Notify me"
- Images via Cloudinary `f_auto,q_auto,w_300`

### M3 — Cart, Checkout & Orders
- Server-side cart for logged-in users, localStorage for guests, merged on login
- Bill summary: item total, delivery fee, discount, grand total
- "Add ₹X more for free delivery" nudge
- Serviceability re-validated at checkout
- Slots: Express / Morning 7–9 / Evening 5–7 (instant orders)
- Payment: Wallet, Razorpay, COD (per B9)
- **Idempotent** order placement; stock decremented atomically inside a DB transaction
- Status machine: `PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED`, plus `CANCELLED`, `FAILED_DELIVERY`, `REFUNDED`
- Cancel allowed until `PACKED`, auto wallet refund
- Order history, detail, reorder, invoice
- "Report an issue" with photo (per B14)

### M4 — Smart List
```
VOICE: mic → record (max 60s) → upload → STT
       → EDITABLE transcript shown to user
       → LLM parse → fuzzy match → review screen → cart

PHOTO: camera → upload → vision LLM extracts line items
       → same parse → match → review → cart
```
- Waveform feedback and visible timer during recording; client-side compression (webm/opus)
- Review screen colour-codes: matched (green), ambiguous (amber, tap to choose from top 3), unmatched (grey, "not available")
- Confidence score per item
- Saved lists — name and reuse ("Weekly Sabzi")
- Alias dictionary managed in admin. **Seed 200+ common Marathi grocery terms** — the alias table does more work here than the model does
- If AI is unavailable, fall back to manual list entry

### M5 — Health Profile & AI Meal Plan ⭐
**Intake wizard**, all editable later:

| Step | Fields |
|---|---|
| 1 Basics | Age (from DOB), gender, height, weight, activity level |
| 2 Household | Adults, children *(drives B4)* |
| 3 Health | Conditions multi-select (diabetes, hypertension, thyroid, PCOS, cholesterol, anaemia, acidity, joint pain, kidney, none) + free-text |
| 4 Allergies | Multi-select + free text — **hard constraint** |
| 5 Preferences | Diet type (veg/vegan/Jain/eggetarian), liked and disliked vegetables |
| 6 Goal | Weight loss / gain / maintenance / general health / manage a condition |
| 7 Consent | Mandatory checkbox + medical disclaimer |

**Plan display:** week view of 7 day cards, each showing Morning and Evening items with image, name, quantity and a one-line AI rationale. Tap a day to expand. Swap button per item. Sticky footer: *Approve Plan* / *Regenerate*.

**Swap flow:** reason selection (Don't like it / Allergic / Not available / Too expensive / Other) → 3 AI alternatives → pick → applied instantly (B6).

**Approval:** start date, duration (B5), delivery slot, address → show estimated daily and period cost + plan fee → wallet check → prepay (B3) → create subscription.

### M6 — Subscription & Daily Delivery
- **Cron at 00:30 IST:** for every ACTIVE subscription, read tomorrow's weekday from the plan template and generate a `MEAL_PLAN_DAILY` order. Idempotent via unique `(subscription_id, scheduled_date)`.
- Wallet auto-debit at generation; failure path per B3
- Skip a day (before 20:00 previous day), pause a date range, cancel with prorated wallet refund
- Change slot or address for future deliveries
- **My Week** screen: next 7 days with per-day status
- Out-of-stock substitution per B7
- Expiry reminder at T-2 days with one-tap renewal
- **Reliability:** admin dashboard alerts if today's generated order count is zero, plus a manual "regenerate today" button. A silent cron failure means nobody gets vegetables.

### M7 — Wallet & Payments
- Balance, quick top-up chips (₹200 / ₹500 / ₹1000 / custom)
- Transaction history with filters and running balance
- Razorpay top-up, webhook-verified (P2)
- Debits: instant orders, daily plan orders, plan fee
- Credits: top-up, refund, cancellation, admin adjustment, complaint credit
- Low-balance alerts per B10
- Admin manual adjustment requires a reason and is audited

### M8 — Notifications

| Event | Channel |
|---|---|
| OTP | SMS (WhatsApp fallback) |
| Order status changes | Push + in-app |
| Meal plan ready | Push + in-app |
| Swap suggestions ready | Push + in-app |
| Low wallet balance | Push + WhatsApp |
| Tomorrow's delivery preview + exact bill (20:00) | WhatsApp + push |
| Subscription expiring | WhatsApp |
| Item substituted (08:00) | Push + in-app, action available |

All templates localised. Per-channel preferences in Settings.
**WhatsApp Cloud API templates need Meta approval — start that in Phase 0**, it takes days and will otherwise block Phase 9.

### M9 — Admin Panel
Route group `/admin`, RBAC-protected, desktop-optimised, **lazy-loaded and excluded from the customer bundle**.

| Section | Capabilities |
|---|---|
| Dashboard | Today's orders, revenue, active subscriptions, pending swaps, low stock, **unreviewed flagged plans**, cron health |
| Catalogue | Categories and products CRUD, variants, pricing, image upload, bulk CSV import |
| Inventory | Stock levels, thresholds, bulk update, mark unavailable |
| Orders | Filters, detail, status change, assign rider (B12), cancel/refund |
| **Daily Picklist** ⭐ | Aggregated *"Tomorrow — 12 kg Spinach, 8 kg Tomato…"* plus per-customer packing slips. Printable + CSV. **Highest-value screen — this replaces the owner's notebook.** |
| Meal Plans | All plans, view, regenerate, manual edit, flagged review queue |
| Swap Requests | Log view (no approval gate per B6) |
| Subscriptions | Active/paused/expired, pause or cancel on behalf |
| Customers | Search, profile, health profile, orders, wallet ledger, manual credit |
| Delivery Partners | CRUD, availability, load |
| Content | Banners, home layout order |
| Settings | Every value from Part 9, editable at runtime |
| Waitlist | Demand grouped by pincode (B11) |
| Audit Log | Every admin action: who, what, when, before/after |

### M10 — Delivery Partner View
Mobile web PWA, minimal, must work on cheap Android phones and flaky networks.
- Phone + OTP login, availability toggle
- Today's assigned orders sorted by slot
- Order detail: customer name, click-to-call, address, map link, item checklist
- Status: Picked Up → Out for Delivery → Delivered
- Delivery OTP verification (4-digit, read out by customer) or proof photo
- Mark Failed Delivery with reason
- Daily summary including COD cash collected

### M11 — Settings, i18n & Support
Language switcher (instant, no reload), notification preferences, address management, health profile edit (prompts regeneration), Help/FAQ, WhatsApp support deep link, Terms, Privacy Policy, **Medical Disclaimer**, delete account, export data.

---

# PART 8 — DATA MODEL

MySQL-compatible (TiDB), Prisma, prefixed CUID ids, money in paise as BigInt, timestamps UTC.
**Add an explicit `@@index` on every foreign key column** — `relationMode = "prisma"` does not create them.

```
users ─┬─ addresses
       ├─ health_profiles ─── meal_plans ─── meal_plan_days ─── meal_plan_items
       │                          │                                  └─ swap_requests
       │                          └─ subscriptions ─── orders
       ├─ carts ─── cart_items
       ├─ orders ─── order_items
       │        └─ delivery_assignments ─── delivery_partners
       ├─ wallet_transactions ─── payments
       └─ smart_lists ─── smart_list_items

categories ─── products ─── product_variants ─── product_aliases
service_areas   waitlist   ai_generation_logs   audit_logs   app_settings
```

**users** `id, phone (unique), name, email, dob, gender, role, preferred_language, is_active, timestamps`

**addresses** `id, user_id, label, line1, line2, landmark, city, state, pincode, latitude, longitude, is_default`

**service_areas** `id, name, pincode, center_lat, center_lng, radius_meters, is_active, delivery_fee_paise, free_delivery_threshold_paise, slots_json`

**waitlist** `id, phone, pincode, latitude, longitude, created_at`

**categories** `id, parent_id, slug (unique), name_en, name_mr, name_hi, icon_url, banner_url, sort_order, is_active`

**products** `id, category_id, sku (unique), name_en, name_mr, name_hi, description, image_urls (JSON), unit_type (G|KG|ML|L|PIECE|BUNCH|PACK), tags (JSON), nutrition (JSON), is_meal_plan_eligible, is_active, search_keywords, timestamps`

**product_variants** `id, product_id, label, quantity, unit, mrp_paise, price_paise, stock_qty, low_stock_threshold, is_default, is_active`

**product_aliases** `id, product_id, alias, locale`

**carts** `id, user_id (unique), updated_at`
**cart_items** `id, cart_id, product_id, variant_id, quantity, added_at` — unique `(cart_id, variant_id)`

**orders** `id, order_number (unique), user_id, address_snapshot (JSON), type (INSTANT|MEAL_PLAN_DAILY), status, subtotal_paise, delivery_fee_paise, handling_fee_paise, discount_paise, total_paise, payment_method, payment_status, subscription_id, scheduled_date, delivery_slot, idempotency_key (unique), placed_at, delivered_at`
Unique: `(subscription_id, scheduled_date)` where subscription_id is not null.

**order_items** `id, order_id, product_id, variant_id, name_snapshot, image_snapshot, quantity, unit_price_paise, total_paise, is_substituted, original_product_id`

**order_status_history** `id, order_id, from_status, to_status, changed_by, reason, created_at`

**health_profiles** `id, user_id, age, height_cm, weight_kg, gender, activity_level, household_adults, household_children, medical_conditions (JSON), allergies (JSON), medications, dietary_preference, liked_product_ids (JSON), disliked_product_ids (JSON), goal, notes, consent_given_at, consent_version, timestamps`

**meal_plans** `id, user_id, version, profile_snapshot (JSON), status (DRAFT|PENDING_CUSTOMER|ACTIVE|SUPERSEDED|EXPIRED), generated_by (AI|ADMIN), ai_provider, ai_model, prompt_version, overall_note, flagged_for_review, flag_reason, approved_at, created_at`

**meal_plan_days** `id, meal_plan_id, day_of_week (1–7)` — unique `(meal_plan_id, day_of_week)`

**meal_plan_items** `id, meal_plan_day_id, slot (MORNING|EVENING), product_id, variant_id, quantity, unit, rationale, sort_order`

**meal_plan_swap_requests** `id, meal_plan_item_id, user_id, reason_code, reason_text, status, ai_suggestions (JSON), chosen_product_id, created_at, resolved_at`

**subscriptions** `id, user_id, meal_plan_id, address_id, delivery_slot, start_date, end_date, status (ACTIVE|PAUSED|CANCELLED|COMPLETED), pricing_mode, plan_fee_paise, auto_renew, created_at`

**subscription_exceptions** `id, subscription_id, date, type (SKIP|PAUSE|SKIPPED_UNPAID), reason` — unique `(subscription_id, date)`

**wallet_transactions** `id, user_id, direction (CREDIT|DEBIT), amount_paise, source (TOPUP|ORDER|PLAN_FEE|REFUND|ADJUSTMENT|COMPLAINT_CREDIT|CANCELLATION), ref_type, ref_id, balance_after_paise, note, created_by, created_at` — unique `(source, ref_type, ref_id)`

**payments** `id, user_id, gateway, gateway_order_id, gateway_payment_id (unique), amount_paise, status, signature_verified, raw_payload (JSON), created_at`

**smart_lists** `id, user_id, source (VOICE|PHOTO|TEXT), media_url, transcript, detected_language, ai_raw_output (JSON), status, name, created_at`

**smart_list_items** `id, smart_list_id, raw_text, parsed_name, quantity, unit, matched_product_id, matched_variant_id, confidence, status (MATCHED|AMBIGUOUS|UNMATCHED|USER_CONFIRMED)`

**delivery_partners** `id, user_id, vehicle_type, is_available, service_area_id`
**delivery_assignments** `id, order_id, partner_id, status, delivery_otp, proof_image_url, assigned_at, picked_at, delivered_at, failure_reason`

**notifications** `id, user_id, channel, template_key, payload (JSON), status, sent_at, read_at`

**ai_generation_logs** `id, user_id, feature, provider, model, prompt_version, input_tokens, output_tokens, latency_ms, status, error, created_at`

**audit_logs** `id, actor_id, action, entity_type, entity_id, before (JSON), after (JSON), ip, created_at`

**app_settings** `key (PK), value (JSON), updated_by, updated_at` — all of Part 9 lives here

---

# PART 9 — API & CONFIG

### API surface
All responses `{ success, data, error }`. Zod on every input.

```
AUTH        POST /api/auth/otp/send · /otp/verify · /refresh · /logout
            GET|PATCH /api/me
ADDRESS     GET|POST /api/addresses · PATCH|DELETE /api/addresses/:id
            GET /api/serviceability?pincode= | ?lat=&lng=
            POST /api/waitlist
CATALOG     GET /api/home · /api/categories · /api/categories/:slug/products
            GET /api/products/:id · /api/products/search?q=&locale=
CART        GET /api/cart · POST /api/cart/items · PATCH|DELETE /api/cart/items/:id
            POST /api/cart/merge
ORDERS      POST /api/checkout/quote · POST /api/orders
            GET /api/orders · /api/orders/:id
            POST /api/orders/:id/cancel · /issue
SMARTLIST   POST /api/smart-list/voice · /photo · /:id/reparse · /:id/to-cart
            PATCH /api/smart-list/:id/items/:itemId · GET /api/smart-list
MEALPLAN    GET|PUT /api/health-profile
            POST /api/meal-plan/generate · /:id/approve · /:id/regenerate
            GET /api/meal-plan/current · /:id
            POST /api/meal-plan/:id/items/:itemId/swap · /swap/confirm
SUBS        GET /api/subscriptions/current · /:id/schedule
            POST /api/subscriptions/:id/skip · /pause · /resume · /cancel
            PATCH /api/subscriptions/:id
WALLET      GET /api/wallet · /api/wallet/transactions
            POST /api/wallet/topup/initiate
            POST /api/webhooks/razorpay
ADMIN       /api/admin/* — dashboard, catalogue, inventory, orders, picklist,
            meal-plans, swap-requests, subscriptions, customers, delivery-partners,
            service-areas, waitlist, settings, audit-logs
DELIVERY    GET /api/delivery/orders · PATCH /api/delivery/orders/:id/status
            PATCH /api/delivery/availability
CRON        POST /api/cron/generate-daily-orders · retry-failed-payments
            · send-tomorrow-preview · expire-subscriptions · reconcile-payments
            (Bearer CRON_SECRET)
```

### Environment variables

```bash
# ── Core ────────────────────────────────────────────────
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=AaharCart

# ── Database ────────────────────────────────────────────
DATABASE_URL="mysql://USER:PASS@gateway.tidbcloud.com:4000/aaharcart?sslaccept=strict"

# ── Auth ────────────────────────────────────────────────
JWT_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5

# ── AI ──────────────────────────────────────────────────
AI_PROVIDER=mock              # mock | gemini | anthropic | groq
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
ANTHROPIC_API_KEY=
GROQ_API_KEY=
AI_STT_PROVIDER=gemini
AI_MAX_RETRIES=1
AI_ALLOW_REAL_HEALTH_DATA=false

# ── SMS ─────────────────────────────────────────────────
SMS_PROVIDER=mock             # mock | msg91 | whatsapp
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_OTP_TEMPLATE_ID=
DEV_FIXED_OTP=123456

# ── Storage ─────────────────────────────────────────────
STORAGE_PROVIDER=local        # local | cloudinary | r2
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# ── Payments ────────────────────────────────────────────
PAYMENT_PROVIDER=mock         # mock | razorpay | cashfree
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENT_CURRENCY=INR
PAYMENT_ASSUME_FEE_PERCENT=2.4
REFUND_DESTINATION=wallet
PAYMENT_PENDING_RECONCILE_MINUTES=15
MIN_WALLET_TOPUP_PAISE=10000
WALLET_TOPUP_PRESETS_PAISE=20000,50000,100000,200000

# ── Push & notifications ────────────────────────────────
PUSH_PROVIDER=mock
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
NOTIFY_PRIMARY_CHANNEL=whatsapp
NOTIFY_TOMORROW_PREVIEW_HOUR=20

# ── Cron ────────────────────────────────────────────────
CRON_SECRET=
CRON_TIMEZONE=Asia/Kolkata

# ── Pricing & fees (paise) ──────────────────────────────
MIN_ORDER_VALUE_PAISE=14900
DEFAULT_DELIVERY_FEE_PAISE=2500
FREE_DELIVERY_THRESHOLD_PAISE=29900
HANDLING_FEE_PAISE=0
PLAN_FEE_PAISE=9900
LOW_WALLET_THRESHOLD_PAISE=20000
COD_MAX_ORDER_PAISE=150000
COMPLAINT_AUTO_CREDIT_MAX_PAISE=10000
COMPLAINT_AUTO_CREDIT_MONTHLY_LIMIT=2

# ── Meal plan ───────────────────────────────────────────
MEAL_PLAN_TRIAL_DAYS=7
MEAL_PLAN_DEFAULT_DURATION_DAYS=30
MEAL_PLAN_DURATION_OPTIONS=7,15,30
MEAL_PLAN_REFRESH_PROMPT_WEEKS=4
DEFAULT_SERVING_GRAMS_PER_ADULT=200
CHILD_SERVING_MULTIPLIER=0.5
QUANTITY_ROUNDING_GRAMS=250
QUANTITY_MIN_GRAMS=250
QUANTITY_MAX_GRAMS=2000
MAX_SWAPS_PER_PLAN_PER_WEEK=10
WALLET_PREPAY_BUFFER_PERCENT=15

# ── Delivery & locale ───────────────────────────────────
SUBSCRIPTION_SLOT=06:30-09:00
SERVICE_RADIUS_METERS=8000
SKIP_CUTOFF_HOUR=20
DEFAULT_LOCALE=mr
SUPPORTED_LOCALES=mr,hi,en

# ── Feature flags ───────────────────────────────────────
FEATURE_COD=true
FEATURE_ADMIN_SWAP_APPROVAL=false
FEATURE_AUTO_SUBSTITUTE=true
FEATURE_SMART_LIST=true
FEATURE_VOICE_LIST=true
FEATURE_PHOTO_LIST=true

# ── Observability ───────────────────────────────────────
SENTRY_DSN=
```

---

# PART 10 — PROJECT STRUCTURE

```
aaharcart/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (shop)/          page · category/[slug] · product/[id] · search
│   │   │                    cart · checkout · orders · smart-list
│   │   │                    meal-plan (+ onboarding, [id]) · wallet · profile
│   │   ├── (admin)/admin/
│   │   ├── (delivery)/delivery/
│   │   └── api/             auth catalog cart orders smart-list meal-plan
│   │                        subscriptions wallet admin delivery cron webhooks
│   ├── components/
│   │   ├── ui/              shadcn primitives
│   │   ├── shop/            ProductCard CategoryTile CartSheet QtyStepper
│   │   ├── meal-plan/       DayCard MealItem SwapSheet PlanWeekView
│   │   ├── smart-list/      Recorder ListReview PhotoCapture
│   │   └── admin/
│   ├── lib/
│   │   ├── services/        ⭐ ai/ sms/ storage/ payment/ push/ queue/
│   │   ├── ai/              prompts/ (versioned) · schemas/
│   │   ├── db.ts            Prisma singleton
│   │   ├── auth/
│   │   ├── validators/      shared Zod schemas
│   │   ├── money.ts         paise helpers
│   │   └── quantity.ts      B4 formula
│   ├── hooks/ · stores/ · types/
│   └── i18n/messages/{mr,hi,en}.json
├── public/manifest.json · icons/
├── tests/
├── .env.example
├── DECISIONS.md
└── README.md
```

---

# PART 11 — PHASE PLAN

Each phase ends with a working, demoable build. **Stop and report after every phase.**

| Phase | Modules | Deliverable |
|---|---|---|
| **P0** | — | Next.js 15 + TS strict + Tailwind + shadcn. Full folder structure. **Complete Prisma schema for the entire Part 8 model**, with indexes on every FK. All six ports scaffolded with working mocks. `next-intl` with mr/hi/en and a working switcher. Design tokens, base layout, 5-tab bottom nav shell. `.env.example`. Seed skeleton. README + DECISIONS.md |
| **P1** | M1, M2 | OTP login (mock SMS), profile, addresses, serviceability + waitlist, Home, categories, product grid, PDP, search with aliases |
| **P2** | M3 | Cart, checkout quote, idempotent order placement, order history and detail, status machine, COD |
| **P3** | M7 | Wallet ledger, balance, transactions, Razorpay **test** top-up, verified webhook, reconciliation job, wallet payment on orders |
| **P4** | M5 (part 1) | Health profile wizard, consent + disclaimer, AI generation with schema validation and the **full safety layer**, B4 quantity, plan week view, rationale display |
| **P5** | M5 (part 2) | Swap flow, AI alternatives, instant apply, dislike learning, approval screen with cost estimate + wallet prepay |
| **P6** | M6 | Subscription creation, 00:30 cron order generation, wallet auto-debit, My Week, skip/pause/cancel, auto-substitution, cron health alerting |
| **P7** | M4 | Voice → STT → editable transcript → parse → match → review → cart. Photo variant. Alias dictionary with 200+ seeded Marathi terms |
| **P8** | M9 | Admin: dashboard, catalogue CRUD, inventory, orders, **daily picklist**, meal plans + flagged queue, customers, wallet adjust, waitlist, settings, audit log |
| **P9** | M10, M8 | Rider PWA, assignment, delivery OTP, proof photo. Notification templates across WhatsApp / push / in-app |
| **P10** | M11 | PWA manifest + offline shell, performance pass, every empty/error/loading state, accessibility, full mr/hi/en pass, Capacitor Android build, demo reset script |

**Demo order for the client:** P1 → P2 → P4 → P5 → P6. That sequence tells the whole business story — browse, buy, get a plan, tweak it, receive daily deliveries — in about four minutes.

---

# PART 12 — ACCEPTANCE CRITERIA

**Onboarding & Catalog**
- [ ] A new user selects Marathi and sees an entirely Marathi UI, then completes OTP login
- [ ] Profile and address creation succeed; a non-serviceable pincode shows the waitlist screen
- [ ] Home renders 6+ categories, banners and bestsellers per Part 5
- [ ] Search finds कांदा, `kanda` and `onion` as the same product

**Commerce**
- [ ] Add to cart → checkout → wallet payment → correct order in history
- [ ] The same idempotency key submitted twice creates exactly one order
- [ ] Stock decrements correctly; out-of-stock products cannot be ordered
- [ ] Cancelling a PLACED order refunds the wallet exactly once

**Payments**
- [ ] A test-mode top-up credits the wallet **only** after the webhook arrives
- [ ] Replaying the same webhook payload ten times credits the wallet exactly once
- [ ] A tampered webhook signature is rejected with 400 and logged
- [ ] Closing the browser mid-payment still yields a correct balance once the webhook lands
- [ ] A payment stuck PENDING is resolved by the reconciliation job
- [ ] The app refuses to boot in production with an `rzp_test_` key

**Meal Plan**
- [ ] Wizard completes with mandatory consent
- [ ] Plan generates in under 60 seconds with all 7 days × 2 slots filled
- [ ] A peanut-allergy profile **never** produces a plan containing peanuts across 20 consecutive generations
- [ ] A disliked vegetable never appears in a freshly generated plan
- [ ] A pregnancy flag sets `flaggedForReview` and shows the doctor banner
- [ ] Quantity matches B4 exactly for a 4-adult and a 2-adult-1-child household
- [ ] A swap returns 3 valid in-catalogue alternatives and applies instantly
- [ ] Approving a plan prepays the wallet and creates a subscription with the right dates

**Subscription**
- [ ] The cron generates exactly one order per active subscription for the target date
- [ ] Running the cron twice for the same date creates no duplicates
- [ ] Insufficient balance holds the order and notifies, then retries at 08:00
- [ ] Skipping a day prevents generation for that date only
- [ ] An out-of-stock item auto-substitutes and notifies, never silently vanishes

**Smart List**
- [ ] A Marathi voice note yields an editable transcript and ≥80% correct matches on the seeded aliases
- [ ] A photographed handwritten list produces parsed items with a review screen
- [ ] Unmatched items are clearly marked and never silently dropped

**Admin & Delivery**
- [ ] The daily picklist shows correct aggregated quantities for a given date
- [ ] Admin can manually edit a meal plan and the customer sees the change
- [ ] A rider can mark delivered only after OTP verification
- [ ] Every admin mutation appears in the audit log

**Cross-cutting**
- [ ] Zero hard-coded user-facing strings
- [ ] Zero hard-coded business numbers — all from `app_settings`
- [ ] Switching `AI_PROVIDER`, `SMS_PROVIDER`, `STORAGE_PROVIDER` and `PAYMENT_PROVIDER` requires **no code change**
- [ ] The full test suite runs green with every provider set to `mock`
- [ ] The app installs as a PWA and launches from the Android home screen
- [ ] Vercel functions and the TiDB instance are in the same region (`sin1` / Singapore)
- [ ] No endpoint issues more than 6 database round trips; `/api/home` is cached

---

# PART 13 — CLIENT ACTION LIST

Not blockers — development proceeds on mocks — but each takes real calendar time, so start them now.

1. **Razorpay KYC** — PAN, bank proof, business registration (GST / Udyam / Shop Act), address proof. Also needs a live URL with visible Terms, Privacy, **Refund/Cancellation Policy** and Contact pages; a missing refund policy is a common rejection reason. Ask for the UPI rate in writing.
2. **Meta WhatsApp Business API verification** — needed before P9, takes days.
3. **DLT registration** for transactional SMS — required for production OTP, 3–7 working days.
4. **Google Play developer account** — one-time $25, identity verification is slow.
5. **Store latitude/longitude and the pincode list** to seed the service area.
6. **Delivery capacity** — how many riders, how many deliveries per morning is realistic. This sets a soft cap on subscriptions before expanding.
7. **Confirm the ₹99 plan fee and the B10 fee table** — these are revenue decisions the owner should knowingly agree to.
8. **Trademark and domain check** on the name before launch. Alternatives if taken: Poshan, TazaBox, Sattva Fresh.
9. **Legal review of Terms, Privacy Policy and the Medical Disclaimer** before real customers are onboarded. Health data plus automated dietary suggestions is the one area where a template document is not good enough.
10. **Vercel Pro before commercial launch** (~$20/mo). Hobby is non-commercial only and their definition covers paid client work. Cloudflare Workers is the ₹0 commercial-legal alternative if the client refuses the cost — R11 keeps that door open.

---

# BEGIN

Start with **Phase 0**. State your plan, build it completely, verify it typechecks, then stop and report.
