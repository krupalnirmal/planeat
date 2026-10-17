import { generateDailyOrders } from '../src/lib/subscription/generate-orders';

/**
 * One-off test (session 2026-10-17): forces the daily-order-generation job
 * for a specific date, so a subscription that starts tomorrow can be
 * verified today without waiting for the real 00:30 IST cron. Safe to run
 * more than once, including after the real cron fires tonight — the
 * function is idempotent on (subscriptionId, scheduledDate), so a repeat
 * run just reports DUPLICATE instead of creating a second order.
 *
 * Usage: npx tsx scripts/test-generate-orders.ts 2026-10-18
 */
const targetDate = process.argv[2];
if (!targetDate) {
  console.error('Usage: npx tsx scripts/test-generate-orders.ts YYYY-MM-DD');
  process.exit(1);
}

generateDailyOrders({ targetDate })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
