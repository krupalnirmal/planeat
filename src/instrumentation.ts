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
  // The Contabo VPS's outbound connections resolve to a rotating IPv6
  // address (Linux's RFC 4941 privacy extensions) rather than the server's
  // stable IPv4 — so every IP-whitelisted integration (MSG91's AuthKey,
  // first; Razorpay or anything else later) sees a different source IP on
  // every request no matter how many IPv6 addresses get added to an
  // allowlist. Found live, session 2026-10-03, debugging MSG91's
  // verifyAccessToken rejecting an AuthKey whose IPv4 genuinely was
  // whitelisted. `dns` is Node-only — this hook also runs on the edge
  // runtime, which has no such module.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    dns.setDefaultResultOrder('ipv4first');
  }

  const { assertProductionSafety } = await import('@/lib/env');
  assertProductionSafety();
}
