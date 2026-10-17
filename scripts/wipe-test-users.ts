import { db } from '../src/lib/db';

/**
 * One-off cleanup (session 2026-10-17): delete every user EXCEPT the two
 * phone numbers below, and everything that depends on them — orders, meal
 * plans, addresses, wallet, complaints, smart lists, vendor/delivery-partner
 * profiles, etc. Deliberately NOT a general-purpose tool: the keep-list is
 * hardcoded, read it before running.
 *
 * SAFE BY DEFAULT: runs as a dry run (counts only, no deletes) unless you
 * pass DRY_RUN=false. Everything that does delete runs in one transaction —
 * if anything fails partway, nothing is removed.
 *
 * Run on the SERVER (production DATABASE_URL), not from a dev machine:
 *   npx tsx scripts/wipe-test-users.ts                 # dry run, just counts
 *   DRY_RUN=false npx tsx scripts/wipe-test-users.ts    # actually deletes
 */

const KEEP_PHONES = ['9529770921', '9762415808'];
const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
  const keepUsers = await db.user.findMany({
    where: { phone: { in: KEEP_PHONES } },
    select: { id: true, phone: true, name: true, role: true },
  });
  console.log('Keeping these accounts:');
  for (const u of keepUsers) console.log(`  ${u.phone}  ${u.name ?? '(no name)'}  ${u.role}`);
  if (keepUsers.length !== KEEP_PHONES.length) {
    console.warn(
      `WARNING: expected ${KEEP_PHONES.length} keep-phones, found ${keepUsers.length} matching accounts.`,
    );
  }

  const keepIds = keepUsers.map((u) => u.id);
  const toDelete = await db.user.findMany({
    where: { id: { notIn: keepIds } },
    select: { id: true, phone: true, role: true },
  });
  const deleteIds = toDelete.map((u) => u.id);

  console.log(`\nAbout to remove ${deleteIds.length} accounts and all their data:`);
  const byRole = toDelete.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  console.log(' ', byRole);

  if (deleteIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with DRY_RUN=false to actually delete.');
    return;
  }

  await db.$transaction(async (tx) => {
    const vendors = await tx.vendor.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const vendorIds = vendors.map((v) => v.id);
    const partners = await tx.deliveryPartner.findMany({
      where: { userId: { in: deleteIds } },
      select: { id: true },
    });
    const partnerIds = partners.map((p) => p.id);

    // Free orders (even a KEPT user's order) from a vendor/rider being
    // removed, before the vendor/rider rows themselves go. vendorId is
    // nullable — null it out. partnerId is NOT nullable on an assignment,
    // so that assignment row has to go instead (the removed rider's
    // delivery history, not the kept user's order itself).
    if (vendorIds.length) {
      await tx.order.updateMany({ where: { vendorId: { in: vendorIds } }, data: { vendorId: null } });
    }
    if (partnerIds.length) {
      await tx.deliveryAssignment.deleteMany({ where: { partnerId: { in: partnerIds } } });
      await tx.subscription.updateMany({
        where: { assignedPartnerId: { in: partnerIds } },
        data: { assignedPartnerId: null },
      });
    }

    const orders = await tx.order.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.deliveryAssignment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderIssue.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    const subs = await tx.subscription.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const subIds = subs.map((s) => s.id);
    if (subIds.length) {
      await tx.subscriptionException.deleteMany({ where: { subscriptionId: { in: subIds } } });
      await tx.subscription.deleteMany({ where: { id: { in: subIds } } });
    }

    const plans = await tx.mealPlan.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const planIds = plans.map((p) => p.id);
    if (planIds.length) {
      const days = await tx.mealPlanDay.findMany({
        where: { mealPlanId: { in: planIds } },
        select: { id: true },
      });
      const dayIds = days.map((d) => d.id);
      if (dayIds.length) await tx.mealPlanItem.deleteMany({ where: { mealPlanDayId: { in: dayIds } } });
      await tx.mealPlanDay.deleteMany({ where: { mealPlanId: { in: planIds } } });
      await tx.mealPlan.deleteMany({ where: { id: { in: planIds } } });
    }

    const profiles = await tx.healthProfile.findMany({
      where: { userId: { in: deleteIds } },
      select: { id: true },
    });
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length) {
      await tx.familyMember.deleteMany({ where: { healthProfileId: { in: profileIds } } });
      await tx.healthProfileAccessLog.deleteMany({ where: { healthProfileId: { in: profileIds } } });
      await tx.healthProfile.deleteMany({ where: { id: { in: profileIds } } });
    }
    // A removed admin's view-log of someone else's (possibly kept) profile —
    // actorId is required, so the log row has to go, not just the actor ref.
    await tx.healthProfileAccessLog.deleteMany({ where: { actorId: { in: deleteIds } } });

    const carts = await tx.cart.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const cartIds = carts.map((c) => c.id);
    if (cartIds.length) {
      await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    }

    const lists = await tx.smartList.findMany({ where: { userId: { in: deleteIds } }, select: { id: true } });
    const listIds = lists.map((l) => l.id);
    if (listIds.length) {
      await tx.smartListItem.deleteMany({ where: { smartListId: { in: listIds } } });
      await tx.smartList.deleteMany({ where: { id: { in: listIds } } });
    }

    if (vendorIds.length) {
      await tx.vendorSupply.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await tx.vendorLedgerEntry.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    }
    if (partnerIds.length) {
      await tx.deliveryPartner.deleteMany({ where: { id: { in: partnerIds } } });
    }

    await tx.address.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.walletTransaction.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.complaint.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.pushToken.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.aiGenerationLog.deleteMany({ where: { userId: { in: deleteIds } } });
    await tx.otpRequest.deleteMany({ where: { userId: { in: deleteIds } } });
    const deletePhones = toDelete.map((u) => u.phone);
    await tx.otpRequest.deleteMany({ where: { phone: { in: deletePhones } } });
    await tx.refreshToken.deleteMany({ where: { userId: { in: deleteIds } } });
    // AuditLog is a compliance trail — keep the row, just drop the dangling
    // actor reference (actorId is nullable, unlike HealthProfileAccessLog's).
    await tx.auditLog.updateMany({ where: { actorId: { in: deleteIds } }, data: { actorId: null } });
    await tx.payment.deleteMany({ where: { userId: { in: deleteIds } } });

    await tx.user.deleteMany({ where: { id: { in: deleteIds } } });
  });

  console.log(`\nDone — removed ${deleteIds.length} accounts and their data.`);
  console.log('Kept:', keepUsers.map((u) => u.phone).join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
