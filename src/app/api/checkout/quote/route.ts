import { z } from 'zod';
import { parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { getCart } from '@/lib/cart/queries';
import { db } from '@/lib/db';
import { computeBill, loadFeeConfig } from '@/lib/orders/pricing';
import { checkServiceability } from '@/lib/serviceability';
import { getBalance } from '@/lib/wallet/ledger';
import { localeSchema } from '@/lib/validators/common';
import { checkoutQuoteSchema } from '@/lib/validators/order';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

/**
 * POST /api/checkout/quote
 *
 * The bill the customer is shown before they commit: item total, delivery fee,
 * the free-delivery nudge, which payment methods are available and whether the
 * wallet covers it.
 *
 * This is a quote, not a promise. `POST /api/orders` recomputes every number
 * from live data inside its transaction — a client that replayed a stale quote
 * would otherwise choose its own price.
 */
export const POST = route(async (request: Request) => {
  const session = await requireUser();
  const { locale } = parseQuery(request, querySchema);
  const input = await parseJson(request, checkoutQuoteSchema);

  const [cart, feeConfig, walletBalancePaise] = await Promise.all([
    getCart(session.userId, locale),
    loadFeeConfig(),
    getBalance(session.userId),
  ]);

  // M3 — serviceability is re-validated at checkout, not just at address save.
  // A service area can be switched off between the two.
  let serviceable = true;
  let serviceabilityReason: string | null = null;
  let areaDeliveryFeePaise: bigint | null = null;
  let areaFreeDeliveryThresholdPaise: bigint | null = null;

  if (input.addressId) {
    const address = await db.address.findUnique({
      where: { id: input.addressId },
      select: { userId: true, pincode: true, latitude: true, longitude: true },
    });

    if (!address || address.userId !== session.userId) {
      serviceable = false;
      serviceabilityReason = 'ADDRESS_NOT_FOUND';
    } else {
      const result = await checkServiceability({
        pincode: address.pincode,
        latitude: address.latitude ?? undefined,
        longitude: address.longitude ?? undefined,
      });
      serviceable = result.serviceable;
      serviceabilityReason = result.serviceable ? null : result.reason;
      areaDeliveryFeePaise = result.deliveryFeePaise;
      areaFreeDeliveryThresholdPaise = result.freeDeliveryThresholdPaise;
    }
  }

  const bill = computeBill(
    {
      itemTotalPaise: cart.itemTotalPaise,
      orderType: 'INSTANT',
      areaDeliveryFeePaise,
      areaFreeDeliveryThresholdPaise,
    },
    feeConfig,
  );

  const unavailableLines = cart.lines.filter((line) => !line.isActive || !line.inStock);

  return ok({
    cart,
    bill,
    serviceable,
    serviceabilityReason,
    walletBalancePaise,
    walletCovers: walletBalancePaise >= bill.totalPaise,
    /** Lines that would block placement, so the UI can point at them. */
    unavailableLines: unavailableLines.map((line) => ({
      id: line.id,
      name: line.name,
      reason: !line.isActive ? 'DELISTED' : 'OUT_OF_STOCK',
      availableQty: line.availableQty,
    })),
    canPlaceOrder:
      serviceable &&
      bill.meetsMinimum &&
      cart.lines.length > 0 &&
      unavailableLines.length === 0,
  });
});
