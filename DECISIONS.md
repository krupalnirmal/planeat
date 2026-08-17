# DECISIONS.md

Every judgement call the build brief did not cover. One entry each: the decision, why, and what would change it.

Format: `**D-n — Decision.** Why. *Reverse if:* trigger.`

---

## Phase 0

**D-1 — Next.js 16.3, not 15.x.** The brief says "Next.js 15+"; 16 is the current release and `create-next-app` installs it by default. next-intl 4.13 supports it, and staying on the current major avoids a migration in the middle of Phase 8. *Reverse if:* a library we need in a later phase (Capacitor tooling, a PWA plugin) turns out to be 15-only.

**D-2 — Prisma 7 with the `@prisma/adapter-mariadb` driver adapter.** Prisma 7 removed the Rust query engine, so a driver adapter is now mandatory — `new PrismaClient()` with only a URL throws. TiDB Cloud speaks the MySQL wire protocol, and `adapter-mariadb` is Prisma's official MySQL driver. *Reverse if:* we move to Mumbai Postgres per PART 4.2, in which case it becomes `@prisma/adapter-pg`. Note that this adapter is Node-only, so it is the one thing standing between us and the Cloudflare Workers escape hatch (R11); a Workers migration would need a serverless HTTP driver for MySQL.

**D-3 — `onDelete: NoAction, onUpdate: NoAction` on every relation.** The `categories` self-relation created a referential-action cycle that Prisma refuses to compile with the default `Cascade`/`SetNull`. Rather than special-casing one relation, every relation is explicit and non-cascading: this is a financial and audit system, and a cascading delete that quietly removes a wallet ledger row or an order history is a far worse failure than a foreign-key error. Deletion is handled explicitly in application code, and most "deletes" are soft (`isActive = false`). *Reverse if:* a specific composition (cart items when a cart is deleted) proves genuinely tedious — cascade that one relation only.

**D-4 — Ids are prefixed, time-sortable base32 rather than library CUIDs.** PART 8 says "prefixed CUID ids"; `src/lib/ids.ts` generates `usr_<10 char time><16 char random>` using Web Crypto only. Time-ordered primary keys matter on TiDB, where a fully random key spreads writes across regions, and using Web Crypto instead of a CUID package keeps the code runtime-portable (R11) with no dependency. *Reverse if:* we need cross-service id compatibility with something that expects real CUID2.

**D-5 — `localePrefix: 'always'` — `/mr`, `/hi`, `/en`, and `/` redirects to `/mr`.** An unprefixed default locale makes "why is this page suddenly English" bugs hard to reproduce and turns the language switcher into client-side state. An explicit prefix keeps a deep link a deep link. *Reverse if:* the client objects to `/mr` appearing in shared URLs.

**D-6 — Mukta as the single UI font.** PART 5 requires one family with proper Devanagari support and forbids pairing a Latin display face with a Devanagari fallback. Mukta is drawn as one harmonised superfamily across Devanagari and Latin, so Marathi and English share weight and rhythm. *Reverse if:* the client has brand typography, or Mukta's Latin numerals read poorly in the price hierarchy.

**D-7 — The AI mock synthesises values by walking the caller's Zod schema.** It means a new AI feature gets a working mock for free the moment its schema exists, with no fixture to write, and mock output is guaranteed schema-valid. Fixtures (`setFixture`) are available when a test needs an exact answer. *Reverse if:* schema-walking becomes fragile against a future Zod internal change — at which point switch to per-feature fixture files.

**D-8 — Gemini, Anthropic, Groq, Razorpay, Cloudinary, R2, MSG91, WhatsApp, FCM and QStash are all implemented over plain `fetch`, with no vendor SDK anywhere.** R1 forbids SDK imports outside `src/lib/services/**` and R11 requires Workers compatibility; several official SDKs (firebase-admin, @aws-sdk) would not survive a 3 MiB Worker bundle anyway. Signing (HMAC, SigV4, RS256 JWT) uses Web Crypto. *Reverse if:* a provider's API becomes complex enough that hand-rolling it is a liability — then the SDK goes inside its port file and nowhere else.

**D-9 — `AI_STT_PROVIDER` is separate from `AI_PROVIDER`.** Anthropic has no audio input. Without a second switch, choosing Claude for meal-plan quality would silently break the Smart List's voice path. *Reverse if:* the text provider ever handles audio equally well.

**D-10 — `no-restricted-imports` also blocks `next/link`.** R7's locale rules are only as strong as the weakest import; a raw `next/link` silently drops the `/mr` prefix and the bug shows up as a 404 in production. The rule points developers at `@/i18n/navigation`. *Reverse if:* never — add an eslint-disable on the one line if a genuinely locale-free link appears.

**D-11 — `src/lib/db.ts` exports a lazy Proxy, not an eagerly constructed client.** `next build` prerenders pages that need no database, and a missing `DATABASE_URL` should fail where a query is issued rather than at module load. *Reverse if:* the Proxy indirection interferes with Prisma extensions in a later phase.

**D-12 — `app_settings` values are read through a 60-second in-process cache with env bootstrap fallback.** R8 says every business number is runtime-editable, but re-querying the settings table on every price calculation would blow the "no endpoint issues more than 6 database round trips" acceptance criterion immediately. Admin writes call `invalidateSettingsCache()`. *Reverse if:* multi-instance deploys make the 60 s window visibly inconsistent — then move to a shared cache.

**D-13 — API responses serialise BigInt as a decimal string.** R4 keeps money in BigInt, which `JSON.stringify` throws on. `ok()` walks the payload once and emits strings; the client parses back with `paise()`. Numbers would silently lose precision above 2^53 paise. *Reverse if:* never.

**D-14 — The root layout lives at `src/app/[locale]/layout.tsx`; there is no `src/app/layout.tsx`.** Every page is locale-scoped, so a wrapper layout above the locale segment would have nothing to do and could not set `<html lang>`. *Reverse if:* we add a page that must exist outside the locale tree.

**D-15 — TypeScript `target` raised to ES2022, with `noUnusedLocals` and `noFallthroughCasesInSwitch` on.** BigInt literals (`0n`) require ES2020 at minimum, and R4 uses them everywhere. *Reverse if:* an ancient Android WebView shows up in the analytics — but ES2022 is supported by every browser that can run the PWA at all.

**D-16 — Phase 0 pages are honest placeholders behind a translated `PhaseNotice`, not fake data.** A screen that looks finished but is not is worse than one that says which phase builds it, especially in a client demo. Every placeholder string is translated (R7), so English cannot sneak into the Marathi UI later. *Reverse if:* never.

**D-17 — `MockQueueProvider` runs jobs inline, synchronously.** Through Phase 6 there is no external queue, and inline execution makes the whole app work end to end with `QUEUE_PROVIDER=mock` and makes tests synchronous. Dedupe is enforced in the queue rather than in each handler, so R5 holds by construction. *Reverse if:* a job starts taking longer than a request may — then `QUEUE_PROVIDER=qstash`.

**D-18 — `MockPaymentProvider` signs its simulated webhooks with real HMAC-SHA256.** P2 makes the webhook the source of truth, so the mock has to make the signature check exercisable — including the tampered-signature and ten-times-replay cases from PART 12 — without a Razorpay account. *Reverse if:* never.

**D-19 — Cashfree throws a clear "not implemented" from the payment factory rather than being silently absent.** P5 names it as the documented fallback; a developer switching `PAYMENT_PROVIDER=cashfree` under pressure deserves a message telling them exactly which file to write. *Reverse if:* Razorpay activation is refused, at which point it gets implemented.

**D-20 — `STORAGE_PROVIDER=local` refuses to construct in production.** It writes to `public/uploads`, which is ephemeral and read-only on a serverless host; failing at boot is better than uploads vanishing silently a week later. *Reverse if:* we ever deploy to a host with a persistent disk.

**D-21 — Prisma's generated client lives in `src/generated/prisma` and is git-ignored and lint-ignored.** Prisma 7 requires an explicit output path. It is build output, not source. *Reverse if:* a deployment target cannot run `prisma generate` — `npm run build` runs it first, so this should not arise.

**D-22 — The seed is idempotent (upsert on natural keys) and never overwrites an existing `app_settings` value.** Reseeding a demo database must not silently reset a fee the owner tuned in the admin panel. *Reverse if:* a `--force` reset flag is needed for the Phase 10 demo reset script — add it as a separate path.

**D-23 — Product variants ship a 250 g / 500 g / 1 kg ladder.** B4 rounds meal-plan quantities up to the nearest 250 g because that is how vegetables are weighed and packed here; the catalogue ladder matching that step means a meal-plan quantity always maps onto a real sellable variant. *Reverse if:* the store actually packs in different steps — this is a question for the owner.

**D-24 — Seeded prices are plausible Maharashtra market rates, not placeholders.** A demo where onions cost ₹1 is not a demo. These are starting values; the owner sets real ones from the admin panel. *Reverse if:* the client supplies a real price list — replace wholesale.

**D-25 — `vercel.json` pins `regions: ["sin1"]` and declares the five crons in UTC.** PART 4.2 requires compute in the same region as the TiDB instance, and PART 12 makes it an acceptance criterion, so it belongs in version control rather than in a dashboard setting somebody can forget. Vercel cron schedules are **UTC**, and IST is UTC+5:30 — JSON has no comments, so the conversions are recorded here: 00:30 IST order generation = `0 19 * * *`; 08:00 IST payment retry = `30 2 * * *`; 20:00 IST tomorrow-preview = `30 14 * * *`; 01:30 IST subscription expiry = `0 20 * * *`; payment reconciliation every 15 minutes. *Reverse if:* we move to Cloudflare Cron or QStash, whose schedules are configured elsewhere. Note that Vercel Hobby caps crons at daily frequency — the 15-minute reconciliation job needs Pro.

**D-26 — `prisma init` scaffolded `.claude/`, `.windsurf/`, `.agents/` skill folders and `skills-lock.json`.** These are Prisma's editor-assistant docs, not project code. They are harmless but unrequested; they can be deleted at any time without affecting the build. *Reverse if:* the team wants them — nothing depends on them either way.

---

## Phase 1

**D-27 — Access and refresh tokens are signed with different secrets AND different audiences.** The brief only says "JWT access + refresh". Using one secret means leaking the short-lived access secret lets an attacker mint 30-day refresh tokens; using one audience means a refresh token is accepted as an access token. Both cases are covered by tests in `tests/auth.test.ts`. *Reverse if:* never.

**D-28 — Refresh tokens are stored hashed, and reuse of a rotated token revokes every session for that user.** A database leak must not hand over 30 days of live sessions, and a token being presented twice after rotation means it was copied — the honest user re-logging in is much cheaper than leaving the thief inside. *Reverse if:* users on flaky networks start getting logged out by racing refresh calls; then narrow the revocation to the single token family.

**D-29 — OTP codes are stored as an HMAC keyed by `JWT_SECRET` and bound to the phone number.** An OTP is a password for five minutes. Binding the hash to the phone stops a hash from one row being replayed against another. *Reverse if:* never.

**D-30 — Issuing a new OTP consumes any earlier live code for that number, and the fifth wrong attempt burns the code.** Two valid codes at once doubles the guessing surface for no benefit, and without burning on the final failure a slow brute force could simply outlast the attempt counter. *Reverse if:* never.

**D-31 — Two separate OTP rate limits: a 60-second resend cooldown and 5 requests per number per hour.** They defend different things — the cooldown stops a user racing two codes, the hourly cap stops someone spending our SMS credit to harass a stranger's phone. *Reverse if:* the hourly cap turns out to lock out real users sharing a number; make it per-IP-and-number instead.

**D-32 — `src/lib/auth/otp-constants.ts` exists solely so the login screen can import the timing constants.** The login flow is a client component; importing them from `otp.ts` would pull Prisma into the browser bundle and blow R10's 200 KB budget. *Reverse if:* never — this is the pattern for any constant shared across the client/server line.

**D-33 — `GET /api/me` returns `{ user: null }` for a guest rather than 401.** B17 makes the whole catalogue public, and the header calls this on every page. A 401 would make every guest page render an error state for a completely normal condition. *Reverse if:* never.

**D-34 — Account deletion deactivates and scrubs rather than hard-deleting.** Orders, the wallet ledger and audit logs are financial records that must survive, and R4's ledger is append-only by design. The phone number is released to a tombstone so the person can sign up again, addresses and the health profile are deleted outright (S6), and every session is revoked. *Reverse if:* a legal review requires true erasure of the order history — that is a different, larger conversation than a DELETE route.

**D-35 — Serviceability with a pincode but no coordinates passes on the allow-list alone and reports `radiusChecked: false`.** B11 requires both gates, but the very first screen runs before any location permission exists. Refusing everyone without GPS would be worse than a partial check that is re-run at address save and again at checkout. *Reverse if:* the owner reports deliveries accepted well outside the radius — then require coordinates at address save.

**D-36 — Addresses are serviceability-checked at write time, and a refusal routes the customer to the waitlist.** Discovering at checkout that the saved address is undeliverable is a much worse moment, and a rejected address is exactly the demand signal B11's waitlist exists to capture. *Reverse if:* never.

**D-37 — Search is two indexed queries plus in-memory ranking, not raw SQL.** TiDB Starter has no full-text index (PART 4.3), so a `UNION ALL` with a computed rank would not be faster — it would just be unexpressible through Prisma. The result set is bounded by `take`, so the sort is over tens of rows. *Reverse if:* the catalogue grows past a few thousand products; then move to a `LIKE`-friendly generated column or an external index.

**D-38 — `transliterationKey` folds e→i and o→u on top of the digraph rules.** Two real bugs were found here by tests: `normaliseSearchText` was destroying every Marathi word (NFKD splits कांदा into a letter plus vowel signs, and `\p{L}` does not match those signs — `\p{M}` does), and without vowel folding `bhendi` and `bhindi` did not collide. e/i and o/u are the two pairs Indian Latin-script typing genuinely swaps. *Reverse if:* the folding starts merging distinct products; the alias table is the precise mechanism and this is only the fuzzy fallback.

**D-39 — Server components read the database directly instead of calling their own `/api/*` routes.** A server component fetching its own HTTP endpoint pays a pointless network hop; the routes exist for the client-side, Capacitor and future-integration cases. *Reverse if:* never.

**D-40 — Home and the category listing render on the server; search renders on the client.** The first two want real content in the first paint on a slow connection. Search is debounced autocomplete against a query that changes per keystroke — server-rendering that would be one Singapore round trip per character. *Reverse if:* never.

**D-41 — Phase 1 ships a localStorage-only cart (`src/stores/cart.ts`), holding quantities and no prices.** M2's product card specifies "ADD → quantity stepper", which needs somewhere to put a quantity, and M3's guest cart is localStorage anyway. Phase 2 adds the server cart and `POST /api/cart/merge`; this store becomes the guest side of that merge unchanged. Prices are deliberately absent so a stale localStorage price can never become the price charged. *Reverse if:* never.

**D-42 — Product images use a plain `<img>`, not `next/image`.** The storage port already returns a correctly sized, format-optimised URL (`f_auto,q_auto,w_300`), so `next/image` would re-optimise an already-optimised asset and add a Vercel-specific dependency that R11 exists to avoid. *Reverse if:* we stop using a transforming CDN.

**D-43 — `LocalStorageProvider` is statically rooted at `public/uploads`.** `path.join(process.cwd(), someVariable)` makes the bundler trace the entire project into the serverless output — every source file and the whole public folder. `LOCAL_UPLOAD_DIR` still controls the public URL prefix; the filesystem root is a literal. The delete path also rejects any key containing `..`. *Reverse if:* never.

**D-44 — Recent searches use `useSyncExternalStore`, not `useEffect` + `setState`.** localStorage *is* an external store; the effect version causes a cascading render on every mount and a hydration mismatch between the empty server render and the populated client one. React's own lint rule flags it. *Reverse if:* never.

**D-45 — Search history stays in localStorage and is never sent to the server.** It is personal, worthless on another device, and storing it would put more behavioural data under the DPDP Act for no product benefit. *Reverse if:* never.

**D-46 — Client components reading `useSearchParams` sit behind a `Suspense` boundary.** Without one, Next refuses to prerender the page at all; with one, the static shell still renders and only the parameter-dependent part streams. *Reverse if:* never.

---

## Phase 2

**D-47 — The wallet ledger ships in Phase 2, not Phase 3.** P3 owns the wallet *product* — top-ups, Razorpay, reconciliation, the transactions UI. But P2's own acceptance criteria include "checkout → wallet payment → correct order in history" and "cancelling a PLACED order refunds the wallet exactly once", and neither is possible without an append-only ledger. `src/lib/wallet/ledger.ts` is that ledger; P3 builds on it rather than replacing it. *Reverse if:* never.

**D-48 — Balance is always derived by summing the ledger; `balance_after_paise` is an audit snapshot, not a source.** A stored balance drifts — one missed update, one partial failure, one concurrent write, and the number on screen stops matching the transactions that produced it, with no way to tell which is wrong. The column is kept because a statement line has to show a running balance. *Reverse if:* the sum becomes a measurable cost at scale; then add a periodically reconciled cache, never a mutable column.

**D-49 — `LEDGER_REF` builders instead of raw `(refType, refId)` strings.** The idempotency guarantee is only as good as the key being spelled the same way in every caller. A typo in one route silently disables it exactly where it matters. *Reverse if:* never.

**D-50 — Stock is checked at add-to-cart but only reserved at order placement, with a conditional `UPDATE`.** Reserving at add-to-cart would let one abandoned cart make a vegetable unbuyable for everyone. The atomic decrement (`where: { stockQty: { gte: n } }`, then check `count === 0`) means two customers racing for the last kilo produce exactly one winner, with no read-then-write window. *Reverse if:* never.

**D-51 — The wallet debit happens inside the same transaction as the order.** An order without its debit is free vegetables; a debit without its order is theft. Both failure modes are silent, which is what makes them dangerous. *Reverse if:* never.

**D-52 — The idempotency key is scoped to the user who first used it.** A key belonging to another account gets a fresh attempt, not somebody else's order. Guessable keys should not be a way to read other people's orders. *Reverse if:* never.

**D-53 — The checkout screen generates its idempotency key once per visit, in a ref, on first use.** Not during render — a random value in render is impure and React may render twice. Not per tap — that would defeat the entire point on the timed-out-then-retried path that R5 exists for. Leaving and returning to checkout is a genuine second attempt and gets a fresh key. *Reverse if:* never.

**D-54 — Guest cart merge takes `max(existing, incoming)` per variant rather than summing.** Summing double-counts the common case of the same person adding the same item on two devices; silently ordering four kilos of onions because of that is a complaint, not a feature. It also makes the merge idempotent, so a retried merge is a no-op. *Reverse if:* customers report losing quantities — but the loss would have to be real, not theoretical.

**D-55 — `useCart()` is a facade over two backends; components never know which.** Logged in → the server cart via TanStack Query. Guest → the Zustand localStorage store. Without the facade, every product card would carry an `isLoggedIn` branch. *Reverse if:* never.

**D-56 — The guest cart holds quantities only, never prices.** Money is recomputed server-side at checkout from live catalogue prices, so a tampered or stale localStorage entry can never become the price charged. It also means the cart screen sends guests to log in rather than trying to render names and prices it does not have. *Reverse if:* never.

**D-57 — The bill is computed on the server and rendered verbatim.** `BillSummary` does no arithmetic. B10's fee rules exist in exactly one place; a second implementation in the browser is a second place for them to disagree, and the one the customer reads would be the wrong one. *Reverse if:* never.

**D-58 — `/api/checkout/quote` is a quote, not a promise.** `POST /api/orders` recomputes every number inside its transaction. A client that replayed a stale quote would otherwise be choosing its own price. *Reverse if:* never.

**D-59 — "Cancel allowed until PACKED" means the customer may cancel while PLACED, CONFIRMED or PAYMENT_PENDING.** By PACKED the vegetables are weighed, bagged and labelled and that cost is spent. Admin can still cancel a PACKED order — the state machine permits the transition; only `isCustomerCancellable()` refuses. *Reverse if:* the owner wants the customer cutoff moved.

**D-60 — Cancellation uses a guarded `updateMany` on the current status.** If a rider marks the order OUT_FOR_DELIVERY between the read and the write, zero rows change and the cancel is refused — rather than cancelling an order already on a bike. *Reverse if:* never.

**D-61 — Order rows snapshot the address, product name, image and unit price.** A customer editing their address next month must not rewrite where last month's order went, and a price change must not rewrite an old invoice. *Reverse if:* never.

**D-62 — A complaint without a photo goes to admin review regardless of value.** B14 specifies "photo-backed" for the auto-credit; without one the claim is unverifiable, and the auto-credit is precisely the mechanism that must not become a way to shop for free. The claim is also capped at the order total, whatever the customer enters. *Reverse if:* the owner finds the photo requirement costs more in support time than it saves.

**D-63 — Photo *upload* for complaints lands in Phase 8 with the admin media pipeline; Phase 2's field accepts a URL.** The storage port exists, but an upload endpoint with size limits, MIME validation and moderation is P8 work. Until then a complaint without a photo goes to review — which is exactly B14's specified behaviour for an unverifiable claim, so nothing is broken in the meantime. *Reverse if:* the client demos complaint credits before P8.

**D-64 — Razorpay is shown at checkout as an explicitly disabled option.** Hiding it entirely would make the checkout look finished and surprise the client in P3. A visible, labelled "arrives in the next phase" is more honest. *Reverse if:* never — it becomes enabled in P3.

**D-65 — The reorder endpoint reports what it skipped.** Silently dropping two of five items and calling it a reorder is how somebody ends up cooking without onions. *Reverse if:* never.

**D-66 — `src/lib/db-errors.ts` duck-types Prisma error codes instead of using `instanceof`.** The generated client lives outside `node_modules`, and the error crosses a transaction boundary; an `instanceof` check is one bundling quirk away from silently returning false. A false negative there turns an idempotent retry into a duplicate order. *Reverse if:* never.

---

## Phase 3

**D-67 — `fetchPaymentsForOrder` added to the payment port.** The interface had `fetchPayment(gatewayPaymentId)`, but the exact case reconciliation exists for is the one where the webhook never arrived — so we know the order id and *not* the payment id. Without this method the job cannot resolve its own reason for existing. Implemented for Razorpay via `GET /v1/orders/{id}/payments`; P5's "keep the interface generic" still holds, since every gateway has an equivalent. *Reverse if:* never.

**D-68 — Webhook idempotency has two independent layers.** `payments.gateway_payment_id` is unique, and the ledger entry is unique on `(TOPUP, payment, gatewayPaymentId)`. Either alone would be enough for the happy path; both together mean a crash *between* the payment update and the ledger write is still safe. Razorpay retries aggressively, and a double-credit is money we cannot get back. *Reverse if:* never.

**D-69 — The webhook credits the amount the GATEWAY reports, not the amount we asked for.** If they disagree, the gateway is the one holding the money. *Reverse if:* never.

**D-70 — An unrecognised webhook is acknowledged with 200, not rejected.** A non-2xx makes the gateway retry for hours. Test events fired from the Razorpay dashboard, and events for payments belonging to another environment, are normal — turning them into a retry storm is not. Only a *signature* failure gets a 400. *Reverse if:* never.

**D-71 — The webhook route reads `request.text()`, never `request.json()`.** The HMAC is over the exact bytes sent; parsing and re-serialising round-trips key order and whitespace and the signature stops matching. This is the single most common way a webhook integration silently breaks. *Reverse if:* never.

**D-72 — A rejected signature is written to `audit_logs`, not just to the server log.** A pattern of rejected webhooks is someone probing the endpoint. Server logs get rotated and are not queryable from the admin panel; the audit log is both. *Reverse if:* the volume becomes noise — then rate-limit the logging, not the check.

**D-73 — Reconciliation marks a payment `signatureVerified: false` when it resolves one.** That fact came from an authenticated API call *we* made, not from a signed payload *they* sent. The distinction is exactly what matters in a dispute, so it is recorded rather than flattened. *Reverse if:* never.

**D-74 — Payments still PENDING after 24 hours are marked FAILED.** Without an expiry the reconciliation job re-queries abandoned checkouts forever, and the "pending top-up" banner never clears for the customer. A day is long enough that no real payment is still in flight. *Reverse if:* a gateway's settlement genuinely takes longer; then raise `EXPIRE_AFTER_HOURS`, do not remove it.

**D-75 — Reconciliation catches per-payment errors and continues.** One unreachable payment must not stop the other ninety-nine, and the job runs every 15 minutes so a transient failure resolves itself. Errors are returned in the response for the P8 admin dashboard. *Reverse if:* never.

**D-76 — The browser polls `/api/wallet/topup/status`; it never credits.** The gateway's success callback only tells the UI to *start watching*. Polling is a pure read, so a customer refreshing it repeatedly changes nothing. PART 12's "closing the browser mid-payment still yields a correct balance" falls out of this for free — nothing about the credit depends on anyone being on the page. *Reverse if:* never.

**D-77 — After the poll window expires the UI says "not confirmed yet", never "failed".** The webhook may well land a minute later. Telling someone their payment failed when it did not is the worst answer available, and it causes the double-payment it was trying to prevent. *Reverse if:* never.

**D-78 — A pending top-up is shown on the wallet screen.** Otherwise a customer whose webhook is a minute late sees an unchanged balance and pays again. *Reverse if:* never.

**D-79 — `src/components/wallet/gateway-checkout.ts` is the only file in the browser bundle that knows a gateway's name.** R1 governs server-side SDK imports; the checkout widget is a script the browser loads at runtime, so the same discipline is applied by confining it to one file. The API response it consumes is already provider-neutral (`gatewayOrderId`, `publicKey`), so swapping to Cashfree means rewriting this file and nothing else. *Reverse if:* never.

**D-80 — `POST /api/dev/simulate-payment` exists, double-guarded.** R2 requires the whole app to run end to end on mocks, and a top-up is the one flow with no gateway to pay at. This route builds a correctly HMAC-signed payload with the mock provider and feeds it through the *real* webhook handler — signature check included. It is a stand-in for the gateway, not a shortcut around the webhook. It refuses outside development **and** unless `PAYMENT_PROVIDER=mock`: either check alone is one misconfigured env var away from being a free-money endpoint. *Reverse if:* never — remove both guards and it becomes exactly the vulnerability P2 exists to prevent.

**D-81 — `src/instrumentation.ts` runs the production boot assertion.** P2 requires refusing to boot in production on `rzp_test_` keys. Next calls `register()` once per server process before any request, which is the only place the check is worth anything: a deployment on test keys takes no money at all and looks completely healthy doing it. The same hook catches unset JWT and cron secrets, which fail just as quietly. *Reverse if:* never.

**D-82 — Cron routes accept both POST and GET.** PART 9 specifies POST, but Vercel Cron issues GET. Both are the same handler behind the same `Bearer CRON_SECRET` guard, compared in constant time. *Reverse if:* we move to a scheduler that only issues POST.

**D-83 — The statement shows the stored `balance_after_paise`, not a recomputed running balance.** On a filtered or paginated view a recomputed column would look like a running balance while silently skipping the rows filtered out — a statement that does not add up is worse than no statement. The authoritative balance is still the sum of the table (D-48). *Reverse if:* never.

**D-84 — `POST /api/admin/wallet/adjust` ships in Phase 3, without its UI.** M7 lists admin adjustment as part of the wallet; the admin *panel* is P8. The endpoint, the mandatory reason and the audit trail belong to the ledger, so they land with it. The audit row is written before the ledger entry and its id becomes the ledger reference, which makes the adjustment idempotent and gives every entry a traceable who-and-why. *Reverse if:* never.

**D-85 — The adjustment reason has a 5-character minimum, enforced in Zod.** "ok" is not a reason. An unexplained credit in a financial ledger is indistinguishable from theft six months later, and the person who has to explain it will not remember. *Reverse if:* never.

---

## Phase 4

**D-90 — `taxonomy.ts` is import-free and shared by the wizard and the safety layer.** A second copy of the condition list in the UI is exactly how a condition ends up selectable but never checked for a red flag. Every code in it is stored in the database, so renaming one is a migration, not an edit. *Reverse if:* never.

**D-91 — The condition list is longer than M5's.** M5 step 3 lists the everyday conditions; S3 additionally requires pregnancy, breastfeeding, kidney disease, cancer treatment, type 1 diabetes, recent surgery and eating-disorder indicators to be *detectable*. A red flag that cannot be selected can never be raised, so they are part of the same multi-select. *Reverse if:* never.

**D-92 — Allergen matching has two layers and fails closed.** Structured tags depend on whoever added the product remembering to tag it; text matching over names, aliases and keywords depends on spelling. Neither is reliable alone. And an allergy that resolves to no known allergen is still matched as literal free text — dropping a safe vegetable costs one boring day, serving an allergen can put someone in hospital. *Reverse if:* never.

**D-93 — Peanut's Latin spellings are enumerated, not inferred.** `transliterationKey` (D-38) is good enough for search but not for an allergen: `shengdane` and `singdana` do not fold together, and a missed spelling here is not a search-quality problem. Found by a test that used the seed's own alias. *Reverse if:* never — add spellings, don't switch to inference.

**D-94 — Jain and vegan exclusions are filtered in code alongside allergens.** Not allergies, but just as absolute to the person who holds them, and equally not something to leave to a prompt to remember. *Reverse if:* never.

**D-95 — S3 runs deterministically BEFORE the model is called, and the model can only raise the flag, never lower it.** `flaggedForReview` is the OR of our assessment and the model's. A safety flag that depends on a model noticing something is not a safety flag. *Reverse if:* never.

**D-96 — The red-flag keyword list is deliberately broad, and multilingual.** A false positive costs one banner and one entry in a review queue the owner reads anyway. A false negative means a dialysis patient gets a potassium-heavy plan with no warning. Medications and free-text notes are searched with the same list, because "I take insulin" belongs in either field and people use both. *Reverse if:* the review queue becomes unusably noisy — then tighten individual terms, not the principle.

**D-97 — `AI_ALLOW_REAL_HEALTH_DATA=false` redacts the prompt rather than disabling AI.** With the gate off, conditions, medications and free-text notes never reach the model; it gets an age *band*, household size, diet and goal. It loses almost nothing, because allergies and dislikes were already removed from the catalogue in code (PART 6.3 rule 3) — so the only cost is a less specific rationale. Turning AI off entirely would have contradicted the product; sending real health data to a training-enabled free tier would have contradicted R3. *Reverse if:* never.

**D-98 — Exact age never reaches a model; only a band ("31-45").** A date of birth is an identifier. The plan does not need one. *Reverse if:* never.

**D-99 — The prompt payload is `{id, name, tags}` with allergen tags stripped.** PART 6.3 rule 5 asks for compression; removing `allergen:*` also stops the model reasoning about allergens at all, which is correct — that decision was already made in code before it was called. *Reverse if:* never.

**D-100 — Validation errors are specific sentences, fed back verbatim on the single retry.** "Invalid response" produces the same invalid response again; "THURSDAY has a product id that is not in the catalogue you were given" does not. *Reverse if:* never.

**D-101 — An unknown product id is treated as a SAFETY failure, not a formatting nit.** The candidate list had allergens and dislikes removed, so an id from outside it is exactly what an allergen violation looks like from the validator's side. *Reverse if:* never.

**D-102 — `assertNoForbiddenProducts` runs again immediately before persisting.** The validator already covers it. S4 says a plan containing a declared allergen must *never* be persisted or displayed, and "never" is worth two checks on opposite sides of the code that assembles the rows — including on the path where the rule-based fallback produced the plan. *Reverse if:* never.

**D-103 — Rationale text is regex-checked for medical wording (S1), not just forbidden in the prompt.** A model that ignores the instruction must not be able to put "this will cure your diabetes" on a customer's screen. *Reverse if:* never.

**D-104 — The rule-based fallback is deterministic, seeded by profile id.** Same profile and catalogue always produce the same plan, so regenerating is not a lottery and the behaviour is testable. Different customers get different rotations, or every household in Pathardi cooks the same thing on Tuesday. Leafy vegetables are placed early because they wilt. *Reverse if:* never.

**D-105 — Fewer than 7 candidates is an explicit failure, not a short plan.** 14 slots at a maximum of 2 uses each needs 7 distinct vegetables. Generating a three-day plan and calling it a week would be worse than saying "your filters left too little in stock". *Reverse if:* never.

**D-106 — Regeneration creates a new version and supersedes the old one; it never overwrites.** B5 requires a running subscription to switch at the next Monday, which is impossible if the previous template is gone. Phase 6 reads that history. *Reverse if:* never.

**D-107 — The plan snapshots the profile that produced it.** A plan must remain explainable after the customer edits their profile. *Reverse if:* never.

**D-108 — The customer never sees `flagReason`.** B8 gives them a plain "please consult a doctor" banner; the clinical detail goes to the admin review queue. "KIDNEY_DISEASE: condition KIDNEY_DISEASE" on a customer's screen is alarming without being useful. *Reverse if:* never.

**D-109 — The wizard warns about a red flag at step 7, before the customer waits a minute for a plan.** A client-side preview of S3, purely for timing; the authoritative check is server-side and this one being wrong changes nothing about whether the plan is flagged. *Reverse if:* never.

**D-110 — `getHealthProfileAsAdmin` writes the access log BEFORE returning the profile.** If the log write fails, the read fails. An unlogged access is not an acceptable outcome for the one category of data the DPDP Act treats as sensitive (S6). *Reverse if:* never.

**D-111 — The plan screen says so when the rule-based fallback produced the plan.** Implying an AI wrote something a deterministic rotation produced is a small lie that gets expensive when the client asks why two customers got similar plans. *Reverse if:* never.

**D-112 — Fresh groundnuts (ओले शेंगदाणे) added to the seed as a meal-plan-eligible product tagged `allergen:peanut`.** A genuine Maharashtra vegetable-market item in season — and without an allergen-bearing item in the eligible catalogue, PART 12's "a peanut-allergy profile never produces peanuts" could only be tested against a synthetic fixture, never against the real catalogue. *Reverse if:* the owner does not stock them; then tag another item instead, but keep one.

**D-113 — `MockAIProvider` now reads array length constraints from the Zod schema.** It produced one or two elements for every array, so AI-1's `.length(7)` and `.length(2)` failed before a test could reach the code under test. Found by the pipeline tests. *Reverse if:* never.

**D-114 — The S1 message-catalogue test exempts `intake.condition*` as well as `safety.*`.** S1 bans those words as claims *about the plan*. "In cancer treatment" is a label for the customer's own circumstances, and S3 cannot flag a condition that cannot be selected. Rewording it to dodge a regex would make the wizard worse for no safety gain. The exemption is narrow and commented; every rationale, note, button and heading stays covered. *Reverse if:* the exemption is ever widened casually — it is the one place a safety test was loosened, and it should stay the only one.

**D-115 — `MedicalDisclaimer` converted from a server to a client component.** It is needed inside the client-side wizard, and an async server component cannot be rendered there. A client component works from both sides. *Reverse if:* never.

---

## Phase 5

**D-116 — The plan fee is prorated below 30 days.** B2 prices it "₹99/month" and B5 offers 7/15/30-day durations, but the brief only says the *first 7-day trial* is free. Charging a full ₹99 for a subsequent one-week plan would be four times the monthly rate the customer was quoted. Prorated and rounded to a whole rupee: 7 days → ₹23, 15 days → ₹50, 30 days → ₹99. **This is a revenue decision the owner should knowingly confirm** — it is on the client action list. *Reverse if:* the owner wants a flat ₹99 regardless of duration.

**D-117 — Period cost is summed per calendar weekday, not `daily average × days`.** The plan is a weekly template that repeats (B5), so a 15-day period starting on a Wednesday contains three Wednesdays and two Mondays. If Wednesday is the expensive day, an average is wrong by real money. *Reverse if:* never.

**D-118 — Date arithmetic runs on UTC-anchored date keys, never on a local `Date`.** The whole business is on IST calendar days — the 00:30 generation window, the 06:30–09:00 slot, the 20:00 skip cutoff. Doing this on a local `Date` shifts every plan by a day for anyone whose server is not in IST, and Vercel's functions are in Singapore. *Reverse if:* never.

**D-119 — B3's prepayment is a REQUIRED BALANCE, not a charge.** Only the plan fee is debited at approval; `(period cost × 1.15)` stays in the wallet as the float the daily orders draw down. That is the reading that matches "daily deliveries debit that balance" and the `PLAN_FEE` wallet source already in the schema. *Reverse if:* never.

**D-120 — The plan-fee debit is idempotent on the subscription id.** A retried approval cannot charge ₹99 twice. Approving a plan that already has a live subscription returns that subscription instead of creating a second one. *Reverse if:* never.

**D-121 — A short balance returns 402 with the exact shortfall, and the UI opens the top-up sheet for that amount.** B3 says "route to top-up for the difference, then return to approval". Nothing is charged and no subscription is created on the short path — the customer can walk away with no side effects. *Reverse if:* never.

**D-122 — The rejected vegetable is added to dislikes only for `DONT_LIKE` and `ALLERGIC`.** B6 says the rejected vegetable is auto-added, but a swap because something was out of stock or expensive *this week* should not blacklist a vegetable the customer likes. The swap sheet says which reasons will be remembered, before the customer picks one. *Reverse if:* the owner wants every swap to teach — but then say so in the UI.

**D-123 — Swap suggestions exclude anything already used twice this week.** Otherwise the customer picks a suggestion and the confirm silently breaks the "no vegetable more than twice" rule that generation enforced. *Reverse if:* never.

**D-124 — The confirmed product must be one of the three we offered, and safety is re-validated at confirm time.** Without the first check the endpoint would let a client put *any* product into the plan, bypassing every filter that produced the suggestions. Without the second, stock that ran out or an allergy added since the suggestions were generated would slip through. *Reverse if:* never.

**D-125 — The weekly swap limit counts APPLIED swaps only.** Asking what else is available is not the thing being rate-limited; changing the plan is. *Reverse if:* suggestion calls become an AI cost problem — then rate-limit them separately, not by conflating the two.

**D-126 — Swapping replaces the rationale with null rather than keeping it.** The old sentence described the old vegetable. Keeping it would be worse than having none. A fresh rationale would need another AI call for one line of text. *Reverse if:* the empty line looks wrong in the week view — then generate rationales in a batch, not per swap.

**D-127 — Swapping is offered only while the plan is `PENDING_CUSTOMER`.** Once it is ACTIVE a subscription is running against it, and changing tomorrow's vegetables is Phase 6's My Week screen, which has to deal with an order that may already be generated. *Reverse if:* never.

**D-128 — Quantity is recomputed by B4 on every swap, never inherited.** A bunch of coriander and a kilo of potatoes are not the same amount. *Reverse if:* never.

**D-129 — AI-2 gets the same privacy gate as AI-1.** With `AI_ALLOW_REAL_HEALTH_DATA` off, the swap prompt carries no conditions and not even the customer's free-text reason — which can itself be health data ("it gives me acidity"). *Reverse if:* never.

**D-130 — The swap fallback prefers candidates sharing tags with the vegetable being replaced.** A leafy green is offered leafy greens. Deterministic, so a customer who swaps twice does not see a random shuffle. *Reverse if:* never.

**D-131 — The approval screen shows the 15% buffer as its own line.** B3 requires the customer to hold it, and an unexplained gap between "period cost" and "needed in your wallet" reads as a hidden charge. Naming it as money held back for price rises is the difference between a buffer and a surprise. *Reverse if:* never.

---

## Phase 6

**D-132 — The 00:30 job generates for the IST date it fires on, not "tomorrow".** It runs just after midnight IST and produces that morning's 06:30–09:00 delivery, six hours later. The brief calls it tomorrow's order from the customer's *evening* perspective; from the job's perspective at 00:30 it is today. Getting this backwards would generate every order a day early. *Reverse if:* never.

**D-133 — The job's idempotency key is `sub:<id>:<date>`, alongside the unique constraint on `(subscription_id, scheduled_date)`.** Two mechanisms for the same guarantee, the same shape as the webhook (D-68): a natural key the job can compute, and a database constraint that catches a race the pre-check cannot. *Reverse if:* never.

**D-134 — Each subscription is generated in its own transaction, and one failure never stops the rest.** With two hundred subscribers, an exception on one must not leave a hundred and ninety-nine households without vegetables. Failures are collected and returned so the admin dashboard can alert on them. *Reverse if:* never.

**D-135 — An insufficient balance does NOT roll back the order.** B3 requires the order to exist as `PAYMENT_PENDING` so the 08:00 retry has something to retry. The debit failure is caught *inside* the transaction and turned into a status change, so order, stock hold and status stay atomic. *Reverse if:* never.

**D-136 — Stock stays held while an order is `PAYMENT_PENDING`.** The order is real and will be retried in eight hours. Releasing the stock would mean a customer who tops up at 07:00 finds their vegetables sold to someone else. The 08:00 job returns it if the payment still fails. *Reverse if:* holding becomes a real availability problem on a thin morning.

**D-137 — A failed 08:00 retry cancels the day but NOT the subscription.** B3 says the subscription continues. One short morning must not end a month the customer already committed to; they top up and tomorrow works. The day is recorded as a `SKIPPED_UNPAID` exception so My Week can explain the gap and the 00:30 job does not try again. *Reverse if:* never.

**D-138 — A pause is a run of per-date exceptions plus a status change, not a new concept.** The generation job already refuses any date carrying an exception, so pausing adds nothing to the code that must not break. *Reverse if:* never.

**D-139 — Resuming clears only FUTURE pause days.** A pause that has already passed is history; removing it would make My Week lie about last Tuesday. *Reverse if:* never.

**D-140 — An existing order outranks an exception in My Week.** If the cron generated the order before the customer skipped, the order is the truth on the ground. Showing "skipped" for a delivery that is on a bike is a lie the customer would act on. *Reverse if:* never.

**D-141 — Skipping is refused once the order exists, separately from the 20:00 cutoff.** The cutoff is the rule; the existing order is the fact. Both are checked, because a manual admin rerun can create an order outside the normal window. *Reverse if:* never.

**D-142 — Cancellation prorates the PLAN FEE, not the prepaid float.** The float never left the wallet (D-119), so it is already the customer's and there is nothing to give back — B3's "never forfeit it" is satisfied by construction. The plan fee is the only thing actually charged, so the unused fraction of it is credited back. Idempotent on the subscription id. *Reverse if:* the owner reads B3's "prorated wallet refund" differently — but then D-119 has to change too, and the two must stay consistent.

**D-143 — Substitution is deterministic and prefers the same category over tag similarity.** B7 says "same category where possible"; a gourd for a gourd beats a fruit that happens to share three tags. Deterministic because two cron runs for the same date must pick the same substitute, or a retry would change what the customer is charged for. *Reverse if:* never.

**D-144 — When nothing can substitute, the item is dropped and the customer is told; when nothing at all is in stock, no empty order is created.** B7's "drop the item, do not charge, and notify". A rider carrying an empty bag is worse than a notification. *Reverse if:* never.

**D-145 — Notifications are RECORDED in Phase 6 and SENT in Phase 9.** B3 and B7 both require the customer to be told, and "never silently vanishes" has to be true before any channel exists. A row in `notifications` makes it true for anyone who opens the app; P9's WhatsApp and push are how they find out without opening it. Payloads hold data, never rendered sentences — a stored English string could never be shown to a Marathi customer (R7). *Reverse if:* never.

**D-146 — Notification writes happen outside the order transaction.** A failed notification must never roll back the order it was describing. `notify()` swallows its own errors for the same reason. *Reverse if:* never.

**D-147 — The 20:00 job sends the preview and the low-balance warning in one pass.** Both need the same computation — what tomorrow costs. Telling somebody their bill and separately telling them they cannot pay it would be two notifications where one will do, on the channel B16 says is already noisy. *Reverse if:* never.

**D-148 — `/api/admin/cron-health` GET is M6's alert and POST is its "regenerate today" button.** The button runs exactly the same `generateDailyOrders` as the cron, authorised by an admin session instead of the cron secret — so there is no second code path that could behave differently on the morning it matters. The dashboard that renders it is P8; the mechanism belongs with the job it watches. *Reverse if:* never.

**D-149 — Four catalogue routes moved from `export const revalidate` to `force-dynamic` + `cache-control`.** They all read a `locale` query parameter, which makes them dynamic by definition, so `revalidate` never applied — it only made Next attempt a static prerender at build time and log an error through the API handler. The `s-maxage` / `stale-while-revalidate` header is what actually caches them at the CDN, and that was already there. Found by reading the Phase 6 build output. *Reverse if:* never.

---

## Phase 7

**D-150 — The model splits the sentence; it never picks the product.** AI-4 and AI-5 return `{item, quantity, unit}` with no catalogue in the prompt. Matching is done by the alias table and `match.ts`. M4 says the alias dictionary does more work than the model, and this is what that means in code: a model that silently maps मिरची to capsicum is a bug nobody can find, whereas a wrong alias is one row the owner can edit in the admin panel. *Reverse if:* never.

**D-151 — Marathi fraction words are a lookup table, not arithmetic.** पाव, अर्धा, पाऊण, सव्वा, दीड, अडीच, साडेतीन are the amounts a vegetable market actually uses, and none of them are digits. Note that साडेदोन is not a word — 2.5 is अडीच — which is exactly the kind of thing a general-purpose model gets wrong and a table does not. Getting the item right and the amount wrong is worse than not parsing at all: the customer sees a plausible number and does not check it. *Reverse if:* never.

**D-152 — A bare number on a weighed product means kilograms.** "दोन कांदे" in a vegetable market means two kilos, not two onions. Counted products (bunch, piece, pack) take the number as a count. *Reverse if:* the owner says customers mean pieces — this is a judgement about how people talk, and they would know.

**D-153 — Three regional words for "bunch" are all seeded.** जुडी, गड्डी and पेंडी are all current in Ahmednagar district. Supporting only the one in a dictionary would fail for a third of customers for no reason. *Reverse if:* never.

**D-154 — Quantity words are stripped word-by-word, never by substring replacement.** A naive `replace` of "एक" corrupts "एकदम", and of "g" corrupts half the Latin transliterations. Pinned by a test. *Reverse if:* never.

**D-155 — The deterministic parser is the AI fallback, and it is genuinely good.** M4 says "fall back to manual list entry"; `parseListText` does better than that — it reads "दोन किलो कांदा, एक किलो टोमॅटो, अर्धा किलो बटाटा आणि एक जुडी कोथिंबीर" correctly with no model at all. It is also the typed-entry path, so it is exercised constantly rather than rotting as an untested branch. *Reverse if:* never.

**D-156 — The matcher marks AMBIGUOUS rather than guessing when two candidates are within 0.12.** "मिरची" is green chilli and capsicum in everyday speech; guessing produces a cart the customer did not ask for. A wrong item added silently is worse than an amber row they tap once. *Reverse if:* the amber rows become the majority — then the fix is more aliases, not a lower threshold.

**D-157 — `CONFIDENT` is 0.8 and `MINIMUM` is 0.35.** High to auto-accept, low to still show. M4 requires unmatched items to be visible, not dropped — a weak guess the customer can reject beats "not available" for something we do sell. *Reverse if:* measured against real voice notes and found wrong.

**D-158 — Match rate measured at 100% on a 20-item Marathi voice note** (M4 requires ≥80%). The test asserts the floor rather than the measurement, so improving the aliases cannot break it and regressing them will. *Reverse if:* never.

**D-159 — A customer's choice on an ambiguous row is recorded as `USER_CONFIRMED`, not `MATCHED`.** It is a different fact: the person told us, we did not work it out. That distinction is what makes the alias table improvable — a row the customer had to correct is precisely the alias the owner should add. *Reverse if:* never.

**D-160 — The top-3 alternatives are recomputed at read time, not stored.** They depend on live stock. Offering a "choose from these three" list where one sold out an hour ago is worse than the extra work. *Reverse if:* never.

**D-161 — A re-parse creates a NEW list rather than mutating the old one.** The original transcript and audio are the only evidence of which alias was missing. Overwriting them destroys exactly what the owner needs to improve the dictionary. *Reverse if:* saved lists start piling up — then expire the superseded ones, do not overwrite them.

**D-162 — The audio is kept in storage.** A customer disputing what the app heard, and the owner improving the alias table, both need the original recording. *Reverse if:* the Cloudinary quota becomes the binding constraint — then move to R2, which the storage port already supports.

**D-163 — Voice and photo uploads take a raw body, not multipart.** The browser sends one blob from `MediaRecorder` or one file from the camera input. A form wrapper around a single file buys nothing but parsing. Size and MIME type are still validated server-side — a client that lies about a 60-second cap is exactly what the cap exists for. *Reverse if:* a request needs to carry a second field alongside the file.

**D-164 — A vision failure produces an EMPTY list, not an error page.** There is no rule-based fallback for reading handwriting, so the review screen offers manual entry — which is M4's stated fallback. An error page would send the customer back to a camera that is not the problem. *Reverse if:* never.

**D-165 — `to-cart` reports what it skipped.** M4's "unmatched items are clearly marked and never silently dropped" has to survive this step too, not just the screen before it. A customer who finds three of five items in their cart must be told, not left to notice. *Reverse if:* never.

**D-166 — The review screen never uses colour as the only signal.** Every row carries an icon and a word alongside the tint. Red-green colour blindness affects roughly one man in twelve, and a cheap phone screen in sunlight affects everybody. *Reverse if:* never.

**D-167 — The recorder's waveform is a requirement, not decoration.** On a cheap Android phone in a noisy market a customer cannot tell whether the mic is working, and a recording that turns out to be silence after sixty seconds of talking is the fastest way to lose them. The component also stops every track and closes the `AudioContext` on unmount — a mic left on after navigation is a real privacy problem, and visible as a permanent recording indicator. *Reverse if:* never.

---

## Phase 8

**D-168 — The admin shell is its own route group, and nothing under `src/components/admin/**` is imported by a customer-facing component.** R10 excludes the admin panel from the customer bundle; a single stray import would silently pull a dense-table dashboard into a ₹200 phone's home-page download. Enforced by directory convention, checked by reading the build output rather than a lint rule. *Reverse if:* a shared primitive (the table wrapper, say) turns out to be genuinely useful on the customer side — then it moves to a neutral `components/ui` location, not the other way around.

**D-169 — `diffOf` compares `String(before[key]) === String(next)`.** A `pricePaise` coming back from a form as `"4000"` against a stored `4000` is not a change, and recording it as one buries the real edits in an audit trail full of noise. The comparison is intentionally loose for this reason — it is a diff for a human reading history, not a strict-equality guard. *Reverse if:* a type pair is found where the loose comparison hides a genuine change (e.g. `0` vs `"0.0"` for a decimal-bearing field) — then compare that field's typed value explicitly rather than widening the rule.

**D-170 — The picklist CSV opens with a UTF-8 BOM and uses CRLF line endings.** Without the BOM, Excel on Windows — what the owner actually opens — renders every Marathi vegetable name as mojibake, which makes the one export that exists for a person standing in a market useless to them. CRLF is what Excel expects regardless of platform. *Reverse if:* the owner switches to a tool that mishandles the BOM — vanishingly unlikely for CSV.

**D-171 — `suggestRiders()` ranks candidates but never assigns.** B12 requires a human decision for delivery assignment; a function named "suggest" that silently writes the assignment is a trap for the next person who calls it. Assignment is a separate, explicit admin action. *Reverse if:* never — this is the same shape as D-80's "stand-in, not a shortcut" principle applied to a different rule.

**D-172 — The i18n test's `SHARED_LATIN_KEYS` exemption gained one entry: `admin.catalogue.sku`.** "SKU" is a technical acronym written identically in a Marathi conversation and on an Indian invoice; translating it would make the admin table harder to read, not easier. Same shape as D-114 — the exemption stays narrow and commented, and this is now the second and only other place a translation test was loosened. *Reverse if:* the exemption starts collecting entries that are not genuinely untranslatable acronyms — then it has drifted and needs re-tightening, not another addition.

**D-173 — Settings are entered in rupees and stored in paise; the input never shows paise.** R4 keeps money as integer paise everywhere in code, but nobody — including the owner setting their own delivery fee — thinks in units of 2500. The admin settings screen is the one deliberate exception to "show the stored representation": it converts with `rupeesToPaise`/`formatPaise` at the boundary and nowhere else. *Reverse if:* never.

---

## Phase 9

**D-174 — The delivery OTP is rendered on the CUSTOMER's own order screen, and nowhere in the rider's app.** M10 asks for "delivery OTP verification (4-digit, read out by customer)" — the security property only holds if the rider has to ask for it. Phase 8's `assignRider` generated the code with a comment claiming it would be "on the packing slip the rider carries," which would have handed the rider the answer to their own question; the comment was wrong and is fixed. `GET /api/orders/:id` now includes `deliveryOtp`, but only while an assignment is live (not `DELIVERED`/`FAILED`), so a stale code is never read out to the wrong person. *Reverse if:* never — this is the one property that makes the check worth having.

**D-175 — The assignment status machine and the order status machine move together but are not the same machine.** The rider sees four states (implicit ASSIGNED, then PICKED_UP, OUT_FOR_DELIVERY, DELIVERED/FAILED); the order the customer and admin see has five. `PICKED_UP` is the one step that advances the order to `OUT_FOR_DELIVERY` — the finer PICKED_UP/OUT_FOR_DELIVERY distinction is a rider-side detail nobody else needs a status for. Both machines are still guarded by a conditional `updateMany` (D-60's pattern), so a race between two taps — or a customer's own cancel racing a rider's pickup — cannot silently apply both. *Reverse if:* the customer app ever wants to show "picked up from the shop" as its own step.

**D-176 — Delivered-with-photo and delivered-with-OTP are independent proofs, checked in that order.** A rider who attaches a proof photo is not blocked by an OTP field they never meant to fill in — the photo is accepted on its own, and only an *attempted* OTP with no photo gets checked against the stored code. Getting this branching backwards (checking OTP first even when a photo was attached) was the first draft and would have rejected a valid photo-only delivery whenever the OTP field happened to be non-empty from a previous keystroke. *Reverse if:* never.

**D-177 — `notify()` fans out per-channel via `notifyEvent()`, and an IN_APP row is marked `SENT` at creation.** Phase 6 recorded everything as a single `IN_APP` row and deferred "the senders" to Phase 9; without this change, every event built in Phase 6 (substitution, low balance, tomorrow's preview…) would still only ever produce an in-app row, regardless of what PART 7's M8 table actually specifies per event. There is nothing further to send for IN_APP — the row itself is the delivery — so it skips the `QUEUED` state entirely rather than waiting for a sender that will never touch it. *Reverse if:* never.

**D-178 — `getWhatsAppProvider()` is a switch separate from `getSmsProvider()`.** Same reasoning as D-9's split STT provider: `SMS_PROVIDER` picks the OTP transport, but B16 wants WhatsApp for notifications and SMS reserved for OTP *at the same time* in production — one switch cannot mean two different providers simultaneously. Under `SMS_PROVIDER=mock` it returns the same mock instance, so nothing in development or the test suite needs WhatsApp credentials. *Reverse if:* never.

**D-179 — WhatsApp and push notifications are dispatched from a separate cron (`/api/cron/send-notifications`), not inline with the event that queued them.** Same shape as reconciliation (D-75): one customer's unreachable phone number must not stall the order or subscription action that queued the notification, and a batch job can retry what a single inline call could not. Runs every 5 minutes, which — like the 15-minute reconciliation job — needs Vercel Pro; Hobby's crons are daily-only (D-25). *Reverse if:* never.

**D-180 — Notification message ids are flat camelCase (`orderSubstituted`), not the dotted `TEMPLATE` value (`order.substituted`) stored on the row.** next-intl reads a dot in a lookup key as a nesting path, not a literal character, so `t('order.substituted')` would search for `messages.notifications.order.substituted` — a collision with how the rest of this file works. `render.ts` keeps a small map from one to the other. *Reverse if:* never.

**D-181 — `POST /api/uploads/photo` is a new, generic, authenticated upload endpoint, scoped to delivery partners for now.** D-63 said complaint-photo upload would land in Phase 8's admin media pipeline; it did not — the complaint form still takes a pasted URL. M10's proof-of-delivery photo is the first caller that actually needs an upload path, so this is that path, built against the storage port's `delivery-proof` folder that was already reserved for it back in Phase 0. It stays scoped to `requireDeliveryPartner()` rather than opened to every signed-in user, because a second caller (the complaint form) does not exist yet to justify a wider guard. *Reverse if:* the complaint form's photo field is finally wired up — then this endpoint gains a second folder and a broader guard, rather than a second endpoint being written.

**D-182 — Delivery-partner CRUD shipped in Phase 9, not Phase 8.** M9 lists it as an admin section, but nothing in M10 works without it: a rider needs a `DeliveryPartner` row before `requireDeliveryPartner()` will let them past the rider PWA's login screen at all, so this is infrastructure M10 depends on rather than a standalone admin nicety. A rider is a `User` (role `DELIVERY_PARTNER`) and a `DeliveryPartner` row created together in one transaction; creation refuses outright on a phone number already in use rather than silently promoting an existing customer's or admin's role. *Reverse if:* never.

**D-183 — Push tokens live in their own table, keyed on `(userId, token)`.** A user owns several devices over the life of a phone — the household's shared phone today, a personal one next year — and a single "current token" column would silently stop notifying whichever device was overwritten. A token a provider reports as permanently invalid is deleted outright, not just skipped, so the table does not accumulate phones that were factory-reset two years ago. *Reverse if:* never.

**D-184 — The notification sender does not get R5's idempotency treatment.** Payments and orders are guarded against being applied twice because a duplicate is money or a vegetable bag; a duplicate WhatsApp ping from a crash between "sent" and "marked sent" is a minor annoyance, not a financial bug, and building the same guarantee here would be effort spent on the wrong failure mode. Delivery is deliberately "at least once," the same posture as the ordinary retry semantics WhatsApp and FCM already have. *Reverse if:* a channel's provider starts charging per-send in a way that makes a duplicate expensive — then it needs the same treatment as a webhook.

**D-185 — "Swap suggestions ready" from PART 7's M8 table was not wired to an event.** B6 makes swap suggestions synchronous — the customer asks and gets three alternatives in the same request — so there is no asynchronous moment for a notification to announce. The table entry describes a product that does not exist in this build; wiring a notification to it would mean firing it on every suggestion call, which is not what "ready" means. *Reverse if:* swap suggestions ever move to an async AI call — then this is the one to build.

---

## Phase 10

**D-186 — The PWA icons are a hand-drawn sprout SVG, rasterised with `sharp` (already a transitive dependency — nothing new installed for it).** `public/manifest.json` referenced `/icons/*.png` since Phase 0, but the files never existed, so the app was never actually installable — a broken icon reference fails Chrome's installability check outright. A leaf/sprout was chosen over the wordmark specifically to avoid depending on a Devanagari font being present wherever the icon is rasterised; text in the brand mark is a real designer's job before this ships to a store listing. *Reverse if:* the client supplies a real brand mark — swap the SVG in `scripts/generate-icons.mjs` and rerun `npm run icons:generate`.

**D-187 — The service worker registers only in production (`NODE_ENV=production`).** A service worker caching `/_next/static/*` fights Turbopack's HMR directly, and this machine already has one documented stale-cache failure mode (D-89b) without adding a second cache layer on top of it. Registering unconditionally would mean every `npm run dev` session risks serving yesterday's JS from the cache instead of today's rebuild. *Reverse if:* never — this is a standard, deliberate practice for service workers, not a workaround for a bug.

**D-188 — The offline shell is app-shell-only, not full offline data.** `sw.js` is network-first with a cache fallback for pages and cache-first for hashed static assets, ending at `offline.html` when nothing cached applies — enough for "the app installs and opens to something" on a dropped connection, which is what M11 actually asks for. It deliberately does not attempt to serve a cached catalogue, cart, or order history offline: that needs a sync strategy (conflict resolution for a cart edited while offline, a queue for a checkout that cannot actually complete without a network) this project does not have, and a half-built one would be worse than an honest "you're offline" page. *Reverse if:* the product ever commits to true offline ordering — that is a separate, larger feature.

**D-189 — `sw.js` also handles `push` and `notificationclick`.** Phase 9 built the server side of M8's push channel (`getPushProvider().send()`, the FCM provider, the sender cron) with nothing on the browser end to actually show a notification when one arrives — the two halves are genuinely separate APIs. This is the missing half; a tap opens (or focuses) the deep link carried in the payload's `url` field. *Reverse if:* never.

**D-190 — `LocalStorageProvider.upload()`'s folder path is a literal `switch`, not `path.join(...root, opts.folder)`.** Turbopack's build flagged this as "dynamic filesystem access [that] causes tracing of the whole project" — `opts.folder` is a runtime value even though its type is the five-member `StorageFolder` union, so the bundler could not prove the access was bounded and traced the entire repo (including `public/`) into the server output. A literal switch is provably bounded; the same problem in `delete()` cannot be fixed the same way (a delete key is `<folder>/<filename>`, not one of five literals) and uses Next's documented `/* turbopackIgnore: true */` escape hatch instead, safe because the `..`-traversal guard immediately above it already constrains what a key can be. *Reverse if:* never — this was a real warning, not a false positive, and left alone it would have shipped every source file into the Vercel function bundle.

**D-191 — Five icon-only touch targets were widened from 32–36px to 44px.** R10 sets 44px as the floor; an accessibility pass this phase found the delivery header's logout button, the delivery order screen's back button, search's clear button, and the storefront header's cart and profile icons all sitting below it — the last two dating back to Phase 1. `size-9`/`size-8` glyphs that sit *inside* an already-44px+ button (the Smart List mic button, wallet transaction row icons) were left alone; those are icon size, not hit-area size, and the distinction matters. *Reverse if:* never.

**D-192 — Three silent-no-op gaps were found and fixed by an explicit empty/error/loading audit.** `approval-screen.tsx` and `wallet-screen.tsx` both open `<TopupSheet>` conditionally on `wallet.data`, which is a *second*, independently-loading query — a customer tapping "top up" before that query resolves saw the button do nothing at all, with no spinner, no error, nothing. Both "top up" buttons (and, on the approval screen, the Approve button itself, since its own error path can open the same sheet) are now disabled until `wallet.data` exists. `address-manager.tsx` had a narrower gap: the address list showed neither items, a loading string, nor an empty message during its own fetch, because only `isLoading` from `useSession()` gated the screen's top-level loading return. *Reverse if:* never.

**D-193 — Capacitor is scaffolded (`capacitor.config.ts`, `@capacitor/core` + `@capacitor/cli` installed, `cap:*` npm scripts) but `npx cap add android` was deliberately not run.** B18 states the sequencing itself: "PWA first, Play Store second… Capacitor wrap only after the PWA is stable in real use." Nobody has used this PWA in real use yet — there is no deployed instance and no database connected in this environment (see "Running it locally" below) — so generating and committing a full native Gradle project now would be premature by the brief's own logic, and it could not be built or verified here anyway (no Android SDK). `capacitor.config.ts` points at `NEXT_PUBLIC_APP_URL` rather than bundling a static copy of the build, so "same codebase produces both" holds: a deploy fixes both surfaces at once, with no separate native release for a text change. *Reverse if:* the PWA reaches real users and Play Store distribution is greenlit — then the four commands documented in `capacitor.config.ts`'s header comment are the entire remaining step. `@capacitor/cli`'s `xcode` dependency carries a moderate, iOS-only, dev-tool-only `uuid` advisory with no non-breaking fix available yet; accepted because it never ships to the app and this project has no iOS target.

**D-194 — The demo reset script (`prisma/reset-demo.ts`) is total, not selective.** It deletes every order, subscription, meal plan, wallet transaction, notification, audit log, smart list, session token and health profile in the database, for every user, and then deletes every user except the four seeded demo phone numbers. A version that tried to preserve "the demo customer's saved address" or "last week's orders for the walkthrough" needs a rule for what counts as demo noise versus what to keep, and every such rule is a way the script can silently leave stale data in front of a client. The cost — re-adding an address and redoing the health-profile wizard after every reset — is small next to a reset script whose behaviour needs no explaining. It refuses to run when `NODE_ENV=production`, the same posture as `assertProductionSafety()` (D-81) and the local storage provider's production guard (D-20): a script whose only job is being destructive must be the one place that is paranoid about where it runs. *Reverse if:* never.

**D-195 — Client-side push token registration (requesting `Notification.requestPermission()`, subscribing, calling `POST /api/push/register`) was not built this phase.** It needs a real Firebase project's VAPID key to test against anything beyond a mock, PART 12's acceptance criteria never exercises it, and the endpoint and sender it would call were already built and tested in Phase 9 (`send.ts`, `push-tokens.ts`). This is the one remaining piece of M8 with no code behind it yet — flagged here rather than silently skipped, so it is not mistaken for finished. *Reverse if:* real FCM credentials arrive — then this is a small, self-contained addition, not a redesign.

---

## Post-launch rebrand: AaharCart → Planeat

**D-196 — The product is called Planeat, not AaharCart.** The client's own marketing material (banner creatives, a logo sheet) settled this after the build had already shipped nine phases under the working name. Every user-facing string, the manifest, the JWT issuer/audience, localStorage keys (`cart`, `recent-searches`), the Cloudinary folder prefix, the WhatsApp OTP template default, and the OTP SMS body were renamed in one pass. The brand wordmark stays in Latin script even inside Marathi and Hindi copy ("Planeat डिलिव्हरी", not a transliteration) — the client's own creatives never spell it in Devanagari, the same way "Swiggy" and "Zomato" do not get one; `tests/i18n.test.ts`'s `SHARED_LATIN_KEYS` exemption (D-114, D-172) gained `app.name` for exactly this reason. *Reverse if:* never — this is a correction, not a style choice.

**D-197 — Renaming the JWT issuer/audience and the two localStorage keys (cart, recent searches) was done without a migration path.** A `jose` token signed with the old `aaharcart:access` audience stops verifying the instant this deploys, logging out anyone with a live session, and a cart saved under the old localStorage key becomes invisible under the new one. Both are accepted with no fallback because there are no real users yet — no production deployment, no connected database beyond this developer's own TiDB Cloud trial cluster (see "Running it locally" below). *Reverse if:* this rename ever has to ship after real users exist — then the old JWT audience needs a grace-period fallback in `verifyAccessToken`, and the cart store needs a one-time read of the old key before it is retired.

**D-198 — The header stopped being a coloured band.** Phase 10's redesign put a solid yellow field behind the whole top of the page, matching an early Blinkit-style reference. The client's actual Planeat reference has no coloured header at all — the logo, location row and search bar all sit directly on the same soft cream as the rest of the page, and colour is spent on the welcome banner and the buttons instead. Yellow survives only as a small accent (a badge, the Fruits card's tint) exactly the way the reference uses it — never as a field big enough to compete with what "green means tap this" is trying to say. *Reverse if:* the client's own designs return to a coloured header — this was a direct, deliberate copy of their second reference, not an aesthetic preference of mine.

**D-199 — A new `(intro)` route group (`/splash`, `/onboarding`, `/select-language`, and `/login` moved out of `(shop)`) implements the client's 5-screen pre-login reference exactly, with one deliberate content change.** The reference's OTP screen offers a fallback box captioned "We can call you with the code" / "Get OTP on call" — a voice-call channel. This app has never had a voice-call OTP channel; B16 locked WhatsApp as the SMS fallback specifically ("SMS delivery in this segment is unreliable, so WhatsApp is offered"), and `/api/auth/otp/send` only accepts `channel: 'sms' | 'whatsapp'`. Rather than build a working phone-call OTP path (a real backend feature, not a design pass) or ship a button that calls nobody, the fallback box keeps its reference position and shape but says "We can resend it on WhatsApp" / "Get OTP on WhatsApp" — the channel that is actually wired end to end. Also: first-time visitors are sent through the sequence exactly once via a `planeat_intro_seen` localStorage flag set the moment the splash screen mounts (not at the end), so dropping off partway never traps a returning guest in a loop; anyone deep-linking straight to a product/category/order still lands there directly, since the gate only intercepts the bare `/` landing. *Reverse if:* the client actually wants a voice-call OTP channel built — that is a new backend feature (a calling provider, a new `channel` value, new rate-limit rules) and should be scoped as one, not smuggled into a screen redesign.

**D-202 — The home header's "Deliver to" row now falls back to a client-only "remembered area" (new `useDeliveryArea` store, localStorage) when there is no saved `defaultAddress`.** Root cause of the client-reported bug: the serviceability-check screen (`/serviceability`, what a guest's "Select address" tap opens) only ever checked whether a pincode/GPS point was deliverable — it never saved anything, so confirming "yes, we deliver to your current location" was immediately followed by the header still saying "Select address". A guest cannot have a real `Address` row (that table belongs to `User`), so the honest fix is not to fake a saved address but to remember the checked area/pincode client-side the same way the guest cart remembers quantities (D-56's sibling: client-only, never sent to the server, and a real `defaultAddress` from `useSession` always wins once one exists). *Reverse if:* guest checkout gains a real anonymous-session address concept — then this should be replaced by that, not layered under it.

**D-209 — Refined the multi-variant category row per the client's follow-up reference: added a "Fresh & Quality" subtitle under every product name, switched the variant chips from bordered fixed-width boxes in a horizontal scroll to borderless flex columns filling the row width, and gave each sub-type section a 2-item preview with a "See all" toggle to expand in place.** "Fresh & Quality" is generic brand copy applied uniformly, not a per-product claim — different in kind from a fabricated rating or price, so it doesn't trip the same R8-adjacent concern D-201/D-205 raised. "See all" expands the section in place rather than navigating to a new route — the client's reference always shows it even for a 2-item group, but this only renders it once a group actually has more than the 2-item preview, so there's never a tap that reveals nothing. *Reverse if:* the client wants "See all" to open a dedicated per-sub-type page instead of expanding inline — a bigger change (a new route or query-param view), not a styling tweak.

**D-210 — Corrects D-208/D-209: sibling weight-variant chips of the same product in the category row are now mutually exclusive (`ProductRow`'s `activeVariantId` — the one variant with a cart line, if any — is passed to every `VariantChip` as `otherActiveVariantId`; tapping a different weight's "+" first calls `cart.remove()` on the previously-active variant before adding the new one), and the chip strip went back to a horizontally-scrolling row (`overflow-x-auto`, fixed `w-16` chips, hidden scrollbar) rather than D-209's flex-wrap fill, while keeping D-209's borderless chip styling.** D-208 reasoned "500 g and 1 kg of the same vegetable are genuinely separate lines already" — the client explicitly rejected that for this screen: seeing two weights of the same product both marked "added" here reads as a mistake, not a deliberate double purchase, because this list is "how much carrot am I getting", not a multi-line builder. The product detail page's own variant picker is untouched and still allows a genuine multi-line add if a customer opens it directly. Reverting to horizontal scroll (rather than wrap) keeps every weight (250 g/500 g/1 kg/1.5 kg/2 kg) reachable by swipe without the row growing taller per product — wrapping put more vertical space between products the more variants each one had. *Reverse if:* the client asks for independent multi-weight adds on this screen after all — then re-decouple the `otherActiveVariantId` logic; the scroll-vs-wrap choice is independent of that and can stay either way.

**D-208 — Category listing rows now show every weight variant as its own priced chip (`ProductRow` + `ProductRowVariant`), not just the default variant behind a single ADD.** `ProductCardView` gained an additive `variants: ProductCardVariantView[]` field (the full, already-fetched list — `toProductCard` previously only exposed `product.variants[0]`) alongside the existing single `variant`, so every other consumer of `toProductCard`/`ProductCardView` (home rails, search results, similar-products) is unaffected; only the category page's mapping and `ProductRow` were touched. Each chip is its own cart line with its own ADD/qty-stepper, since 500 g and 1 kg of the same vegetable are genuinely separate lines already (see the variant-picker's own comment on this). One deliberate deviation from the client's reference: its round "+" buttons render visually smaller than R10's 44px floor — sized to 44px here instead, same reasoning as every other touch-target fix in this project. *Reverse if:* never — R10 is a locked rule, not a style preference to trade off against a screenshot.

**D-207 — The Vegetables category page's sub-type groups (Leafy/Root/Fruit/Pod/etc.) are now a sticky left rail + scrolling right list, synced in both directions.** Tapping a rail item scrolls the matching section into view (`scrollIntoView` + `scroll-margin-top` so it doesn't land under the sticky headers); scrolling the list the other way updates which rail item is highlighted via an `IntersectionObserver` biased toward the top of the visible area (`rootMargin: "-Npx 0px -65% 0px"`), not just whichever section is merely on screen. The rail uses `position: sticky` against the page's own scroll rather than a second inner-scrolling pane — simpler, and consistent with how the rest of the app already scrolls as one page. Scoped to categories that actually have sub-type groups (vegetables only, same as D-198-era grouping) — a category with no groups keeps the plain single-column list. *Reverse if:* another category gains its own sub-type grouping and needs the same rail.

**D-206 — Smart List's entry screen changed from one dominant recorder card + two smaller rows to three equal-weight tiles (Record / Photo / Type).** The client's reference showed the three methods as identical square tiles alongside a "What we heard" transcript example; read as two things, not one screen: the tile row is a real layout instruction (built as `mode === 'record'` now being its own step behind a "Record" tile, rather than the `Recorder` component always sitting inline above the other two), while the transcript box was read as an illustration of what the feature produces, not a fourth persistent element — its copy is near-identical to the existing `recordHint` text, and M4 already treats the transcript-editing step as its own screen further into the flow. *Reverse if:* the client actually wants a persistent input-format example visible on the chooser screen itself — that's a one-line addition once confirmed.

**D-205 — "Make My Meal Plan" now defaults to a static, day-by-day, tap-to-select base plan (`base-plan-builder.tsx` / `base-plan-final.tsx` / `base-plan-template.ts`) instead of the AI-personalised intake-wizard flow — confirmed with the developer, not assumed.** The client's brief describes something structurally different from what existed (see D-204's sibling note): a free, common, non-personalised weekly template built from seasonal produce, with daily multiple-choice options, versus the existing single AI/rule-generated plan from a 7-step health intake. Rather than guess, this was checked directly: the new flow replaces the AI wizard as the default entry point from the Meal Plan tab; `intake-wizard.tsx` and `src/lib/meal-plan/generate.ts` are untouched and still fully wired to their own API route, just not linked from any button today — reactivating them later (for the T&C's mentioned paid nutritionist tier) is a routing change, not a rebuild. **Content gap, resolved by the client's own call rather than papered over:** the client supplied exactly one item per day/category cell; the brief separately asks for 2-3 selectable alternatives per cell. Rather than inventing specific vegetable/fruit names not given (which would be fabricating business content, the same concern R8 raises for numbers), the client's answer was that the *customer* adds their own substitute if they don't want the default — so each cell now has an "Add your own" chip that searches the real catalogue (`/api/products/search`, the same endpoint the main Search tab uses) rather than accepting free text — a plan for getting real vegetables delivered can't honour a substitute that isn't actually sold, so the picker only offers real, in-catalogue products. Whatever gets picked becomes a new, immediately-selectable option for that cell, scoped to that person's session only (never written back to the shared template, since it's a stand-in preference, not a new catalogue item). `base-plan-template.ts` still holds one curated default option per cell, structured as an array so real alternatives are a data-only addition whenever supplied. The picker's tap/highlight interaction and the final-plan/congratulations screen are otherwise built and working exactly as specified. Selected items are plain trilingual text, not linked to real product IDs — turning "OK, Get Started" into an actual subscription/delivery schedule needs the plan content matched to real catalogue products first, which is separate follow-up work. *Reverse if:* the client wants both flows live side by side after all, or supplies the missing per-cell alternatives and wants real product-backed ordering wired in.

**D-204 — The new "Make My Meal Plan" terms screen (`meal-plan-terms.tsx`) is a one-time-per-visit gate in front of the intake wizard, not a persisted, per-user consent record.** It is a different consent from the wizard's existing medical-safety disclaimer (S1/S2, further into the flow) — this one explains what kind of product the plan is (a free, common seasonal base plan, not AI/dietitian-personalised; paid nutritionist customisation is a separate, not-yet-built offering) before any health questions are asked. Kept as plain component state rather than a DB field or localStorage flag: the client's own spec only asks that the checkbox gate the next page, and the existing medical disclaimer isn't persisted server-side either, so this matches the app's existing bar rather than inventing a stronger one. *Reverse if:* this needs to hold up as a real legal consent record — then it needs a timestamped field on the user (or on `HealthProfile`), not client state.

**D-203 — Renamed the app from Planeat to Get Fresh; the JWT issuer/audience, every localStorage key prefix, and the Razorpay/WhatsApp/export identifiers were changed with no migration, same as D-197's precedent.** Same reasoning as that rename: no real users or production deployment exist yet, so a `jose` token signed under the old `planeat:access` audience simply stops verifying (nobody is logged in to notice), and a guest cart under the old `planeat.cart.v1` key is invisible under the new `getfresh.cart.v1` one (nothing is in it that matters). Left untouched on purpose: already-uploaded Cloudinary asset URLs (re-uploading everything just to rename an internal folder path nobody sees is pure cost for zero visible benefit — new uploads go to `getfresh/...` going forward), the DECISIONS.md history itself (an append-only log, not a place to scrub old names out of), and the GitHub repo name (a dev artifact, not customer-facing branding). **`NEXT_PUBLIC_APP_NAME` and `WHATSAPP_OTP_TEMPLATE` in `.env` still say "Planeat"/`planeat_otp`** — `.env` is the developer's own file and out of scope for me to edit; both need updating by hand, and the WhatsApp template name specifically needs re-registering with Meta if `planeat_otp` was ever actually approved there. *Reverse if:* the client renames again — repeat this same sweep, don't half-revert it.

**D-201 — 9 of the 24 client-supplied stock photos in the "sample_images" drop were excluded from the category tile selection.** Three had visible stock-site watermarks baked into the pixels (Shutterstock text, a repeating Vecteezy diagonal, a repeating Pngtree diagonal) — unusable on a real product regardless of how good the photo looked. One (`images.jfif`) was a cartoon/vector-style render, not a photograph, and would have clashed with every other photographic image in the app. The rest were dropped for weaker fit (near-duplicate composition, off-brand mood) rather than a hard defect, leaving 4 photos each for Vegetables/Fruits/Dairy & Bread and 3 for Staples (Staples only had 3 clean, non-duplicate candidates — `CategoryCollageTile`'s `spanClass` already handles fewer than 4 images without a visible gap). The home page's category collage now sources these curated photos instead of deriving preview images from live product data (`CATEGORY_TILE_IMAGES` in `src/lib/catalog/category-tile-images.ts`, checked before falling back to the old per-product-photo behaviour) — the "+N more" badge still counts real catalogue depth, only the four small preview photos are fixed. *Reverse if:* the client wants the tiles to reflect live inventory again, or supplies cleaner photos for Staples to bring it to 4.

**D-200 — The reference's screens 6–12 (categories, category listing, product detail, cart, checkout, payment, order confirmed) were matched with three deliberate departures, all in the direction of "real" over "matches the mockup exactly."** (1) The reference's category listing is a flat single-column list with a "Filter" button; this app groups Vegetables by type on client request from earlier work (see `getCategoryProducts`), so that grouping stays for the default view and only collapses to a flat list once someone actually searches, and "Filter" is a real client-side sort (price/name) rather than a decorative button with no facets behind it. (2) The reference's product detail page shows a star rating ("★4.5 (250)"); the `Product` model has no rating field and nothing in the app collects one, so no rating was added — inventing "4.5 (250 reviews)" would be a fabricated number on a customer-facing screen, the same category of thing R8 exists to prevent for prices. (3) The reference's Checkout/Payment are two screens with a live 1→2→3 stepper; this app's checkout is deliberately one screen (one `/api/checkout/quote` fetch, one R5 idempotency key generated once per visit) — splitting it into real separate routes would mean carrying that idempotency key and the picked address across a navigation, for a correctness risk with no user benefit. The numbered circles stayed as a purely typographic echo (labelling section 1 and section 2 in reading order), not a live progress tracker. Payment options stayed Wallet / Razorpay ("arrives in the next phase") / COD — the reference's UPI/Card/NetBanking rows were not added because none of them are wired to anything; a payment button that does not charge the customer is worse than an honest "not yet." *Reverse if:* the client explicitly asks for a flat category list, a real review/rating system, or a true multi-screen checkout — each is a real feature to scope, not a styling change.

---

## Running it locally (found by actually running it)

**D-86 — The MySQL adapter gets `connectTimeout: 4s` and `acquireTimeout: 6s`.** The defaults wait ten seconds per connection attempt, so a page issuing three parallel queries against an unreachable database sat blank for thirty seconds with no clue why. A real TiDB connection from the same region takes ~200 ms, so these are generous even when everything works — and in a serverless function, hanging is worse than failing. *Reverse if:* a slow network genuinely needs longer; raise it, do not remove it.

**D-87 — `DATABASE_URL` is empty in `.env`, not a plausible-looking placeholder.** An unreachable placeholder is strictly worse than nothing: every page that touches the database waits for the connection to time out. Empty makes `createClient()` throw immediately, the home page's catch fires, and the empty state renders instantly (354 ms warm, versus 6 s with a placeholder). *Reverse if:* never.

**D-88 — `src/middleware.ts` renamed to `src/proxy.ts`.** Next 16 renamed the convention and warns on every dev start about the old name. Same API, same `config.matcher`; verified that locale routing and the `/` → `/mr` redirect still work. *Reverse if:* never.

**D-89b — Running `next build` and then `next dev` on this machine leaves a stale `.next` that 404s newly added routes.** Seen twice: after a build, `next dev` serves the home page but 404s every route added since the last dev session, including `/api/health`. `rm -rf .next` and restart fixes it every time. Next itself flags the drive as slow (`⚠ Slow filesystem detected` on `E:\`), which is the likely cause. **If a route you just added 404s in dev, clear `.next` before debugging anything else.** *Reverse if:* the project moves to a local SSD path and it stops happening.

**D-89 — `agentRules: false` in `next.config.ts`.** Next 16 writes `AGENTS.md` and `CLAUDE.md` into the repo root on every dev start. This project documents itself in `README.md` and `DECISIONS.md`; two more generated files at the root are churn, not guidance. *Reverse if:* the team wants them.

---

## Open questions for the client

Carried from PART 13; these are not blockers but they have calendar time attached.

1. **Meta WhatsApp Business API verification** — must start now; it gates Phase 9 and takes days.
2. **DLT registration** for transactional SMS — 3–7 working days, gates production OTP.
3. **Razorpay KYC** — needs a live URL with visible Terms, Privacy and Refund/Cancellation pages. A missing refund policy is a common rejection reason.
4. **Store latitude/longitude and the real pincode list** — the seeded Pathardi coordinates (19.1739, 75.1817) and pincodes (414102, 414103, 414105, 414502) are best-effort placeholders and must be confirmed before any real delivery.
5. **Confirm the ₹99 plan fee and the B10 fee table** — seeded as specified, but the owner should knowingly agree. **Also confirm D-116:** the fee is prorated below 30 days (7 days → ₹23, 15 days → ₹50). The brief only specifies the free first trial, so this is a revenue decision that needs a yes.
6. **Delivery capacity** — how many riders, how many deliveries per morning. This sets a soft cap on subscriptions.
