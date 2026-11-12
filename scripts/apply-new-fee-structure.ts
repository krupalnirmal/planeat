import 'dotenv/config';
import { updateSetting } from '../src/lib/admin/settings';
import { SETTING_KEYS } from '../src/lib/settings';
import { db } from '../src/lib/db';

/**
 * Client's new bill-breakdown (session 2026-11-12, Blinkit-style reference
 * screenshot) — below ₹200, every order now pays delivery + a flat ₹3
 * handling fee + a ₹2 "high demand surge charge"; at/above ₹200, delivery
 * and surge both drop to ₹0 (handling still applies). Meal-plan days pay
 * their own, lower ₹15 delivery rate under the same ₹200 threshold instead
 * of being free outright.
 *
 * Run only once — goes through the real `updateSetting()` path (audited,
 * cache-invalidated), same as `remove-min-order-value.ts`.
 * Deletes itself after running — one-off, not app code.
 */

const VALUES: Record<string, number> = {
  [SETTING_KEYS.deliveryFeePaise]: 2500, // ₹25 (instant)
  [SETTING_KEYS.mealPlanDeliveryFeePaise]: 1500, // ₹15 (meal plan)
  [SETTING_KEYS.freeDeliveryThresholdPaise]: 20000, // ₹200
  [SETTING_KEYS.handlingFeePaise]: 300, // ₹3
  [SETTING_KEYS.surgeChargePaise]: 200, // ₹2
};

async function main() {
  const actor = await db.user.findFirst({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new Error('No admin/super-admin user found to attribute this write to');

  for (const [key, value] of Object.entries(VALUES)) {
    const result = await updateSetting(key, value, actor.id, null);
    if (!result.ok) throw new Error(`updateSetting(${key}) failed: ${JSON.stringify(result)}`);
    console.log(`${key} -> ${value}`);
  }

  console.log('\nNew fee structure applied.');
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
