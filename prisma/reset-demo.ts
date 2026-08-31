/**
 * Demo reset (P10 — M11).
 *
 * Wipes every row a demo session can accumulate — orders, wallet history,
 * meal plans, subscriptions, notifications, audit logs, smart lists, sessions
 * — and removes any user beyond the four seeded demo accounts (a rider added
 * from the admin panel mid-demo, a customer who signed up to try OTP login).
 * Catalogue, service areas and `app_settings` are untouched: those are real
 * configuration, not demo activity, and D-22 already makes the seed refuse to
 * clobber a tuned setting.
 *
 * Deliberately total rather than selective — a script that keeps "the
 * customer's saved address" or "last week's orders" needs a rule for what
 * counts as demo noise versus what to preserve, and every such rule is one
 * more way the reset can silently leave stale data in a client demo. Nothing
 * survives except identity and catalogue; the cost is re-adding an address
 * and completing the health-profile wizard again next time, which is a small
 * price for a reset script that can actually be trusted.
 *
 * Run with: npm run db:reset-demo
 */

import 'dotenv/config';
import { db } from '../src/lib/db';
import { env } from '../src/lib/env';

const SEED_PHONES = ['9999900001', '9999900002', '9999900010', '9999900011'];

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to run db:reset-demo in production — this deletes every order, wallet ' +
        'transaction and meal plan in the database. If this really is a demo environment ' +
        'running with NODE_ENV=production, run the deletes by hand instead of trusting a ' +
        'script that assumes it is safe to be destructive.',
    );
  }

  console.info('Resetting Planeat to a clean demo state…');

  // Children before parents throughout — relationMode = "prisma" (D-3) means
  // Prisma enforces this itself and throws rather than cascading.
  const steps: Array<[string, () => Promise<{ count: number }>]> = [
    ['order_status_history', () => db.orderStatusHistory.deleteMany({})],
    ['order_issues', () => db.orderIssue.deleteMany({})],
    ['order_items', () => db.orderItem.deleteMany({})],
    ['delivery_assignments', () => db.deliveryAssignment.deleteMany({})],
    ['orders', () => db.order.deleteMany({})],
    ['subscription_exceptions', () => db.subscriptionException.deleteMany({})],
    ['subscriptions', () => db.subscription.deleteMany({})],
    ['meal_plan_items', () => db.mealPlanItem.deleteMany({})],
    ['meal_plan_days', () => db.mealPlanDay.deleteMany({})],
    ['meal_plans', () => db.mealPlan.deleteMany({})],
    ['wallet_transactions', () => db.walletTransaction.deleteMany({})],
    ['payments', () => db.payment.deleteMany({})],
    ['smart_list_items', () => db.smartListItem.deleteMany({})],
    ['smart_lists', () => db.smartList.deleteMany({})],
    ['notifications', () => db.notification.deleteMany({})],
    ['push_tokens', () => db.pushToken.deleteMany({})],
    ['ai_generation_logs', () => db.aiGenerationLog.deleteMany({})],
    ['audit_logs', () => db.auditLog.deleteMany({})],
    ['otp_requests', () => db.otpRequest.deleteMany({})],
    ['refresh_tokens', () => db.refreshToken.deleteMany({})],
    ['health_profile_access_logs', () => db.healthProfileAccessLog.deleteMany({})],
    ['health_profiles', () => db.healthProfile.deleteMany({})],
    ['cart_items', () => db.cartItem.deleteMany({})],
    ['carts', () => db.cart.deleteMany({})],
    ['waitlist', () => db.waitlist.deleteMany({})],
    ['addresses', () => db.address.deleteMany({})],
    [
      'delivery partners created during the demo',
      () => db.deliveryPartner.deleteMany({ where: { user: { phone: { notIn: SEED_PHONES } } } }),
    ],
    [
      'users created during the demo',
      () => db.user.deleteMany({ where: { phone: { notIn: SEED_PHONES } } }),
    ],
  ];

  for (const [label, run] of steps) {
    const { count } = await run();
    if (count > 0) console.info(`  ${label}: ${count} removed`);
  }

  console.info(
    'Done. Catalogue, service areas, app_settings and the four seeded accounts are untouched.',
  );
  console.info('Run `npm run db:seed` if you also want the seeded accounts re-verified.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
