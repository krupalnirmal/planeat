import 'dotenv/config';
import { updateSetting } from '../src/lib/admin/settings';
import { SETTING_KEYS } from '../src/lib/settings';
import { db } from '../src/lib/db';

/**
 * Client feedback (session 2026-11-12, WhatsApp screenshot) — "काढून टाका"
 * the ₹149 minimum order requirement: delivery fee is already charged on
 * every order regardless of size, so a small order isn't a loss the minimum
 * was protecting against. Sets `pricing.min_order_value_paise` to 0, which
 * makes `meetsMinimum` (src/lib/orders/pricing.ts) always true. Goes through
 * the real `updateSetting()` (not a raw write) so it's audited and the
 * in-process settings cache is invalidated immediately — the same path an
 * admin's own edit in Admin → Settings → Pricing would take.
 * Deletes itself after running — one-off, not app code.
 */

async function main() {
  const actor = await db.user.findFirst({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  if (!actor) throw new Error('No admin/super-admin user found to attribute this write to');

  const result = await updateSetting(SETTING_KEYS.minOrderValuePaise, 0, actor.id, null);
  if (!result.ok) throw new Error(`updateSetting failed: ${JSON.stringify(result)}`);

  console.log('Minimum order value set to ₹0 (removed).');
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
