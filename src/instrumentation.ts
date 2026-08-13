/**
 * P2 — the startup assertion.
 *
 *   "Refuse to boot in production if RAZORPAY_KEY_ID starts with rzp_test_."
 *
 * Next.js calls `register()` once per server process, before any request is
 * handled. That is the only place this check is worth anything: a deployment
 * running on test keys takes no money at all, and it looks completely healthy
 * while doing it. Failing to boot is loud; silently taking ₹0 for a week is not.
 *
 * The same hook catches unset JWT and cron secrets, which fail just as quietly.
 */
export async function register(): Promise<void> {
  const { assertProductionSafety } = await import('@/lib/env');
  assertProductionSafety();
}
