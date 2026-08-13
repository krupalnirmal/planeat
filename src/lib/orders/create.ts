import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId, newOrderNumber } from '@/lib/ids';
import { pickName } from '@/lib/catalog/text';
import { checkServiceability } from '@/lib/serviceability';
import { InsufficientBalanceError, LEDGER_REF, debit } from '@/lib/wallet/ledger';
import { computeBill, isPaymentMethodAllowed, loadFeeConfig } from './pricing';
import type { Locale, DeliverySlot, PaymentMethod } from '@/generated/prisma/enums';

/**
 * Order placement (M3).
 *
 * Three guarantees, all of them load-bearing:
 *
 *   R5 — IDEMPOTENT. The client sends an idempotency key. Submitting the same
 *        key twice returns the same order; it never creates a second one. On
 *        rural 4G a request that times out has very often succeeded, and the
 *        customer's instinct is to tap again.
 *
 *   M3 — ATOMIC STOCK. Stock is decremented with a conditional UPDATE inside
 *        the transaction. Two customers racing for the last kilo of onions:
 *        exactly one wins, and the loser is told, rather than both being told
 *        yes and one being disappointed at 07:00 tomorrow.
 *
 *   R4 — the wallet debit happens in the SAME transaction as the order. An
 *        order that exists without its debit is free vegetables; a debit
 *        without its order is theft.
 */

export interface PlaceOrderInput {
  userId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  deliverySlot: DeliverySlot;
  idempotencyKey: string;
  notes?: string;
  locale: Locale;
}

export type PlaceOrderFailure =
  | { reason: 'EMPTY_CART' }
  | { reason: 'ADDRESS_NOT_FOUND' }
  | { reason: 'NOT_SERVICEABLE'; detail: string }
  | { reason: 'BELOW_MINIMUM'; minOrderValuePaise: bigint; itemTotalPaise: bigint }
  | { reason: 'PAYMENT_METHOD_UNAVAILABLE'; detail: string | null }
  | { reason: 'OUT_OF_STOCK'; items: Array<{ variantId: string; name: string; availableQty: number }> }
  | { reason: 'INSUFFICIENT_BALANCE'; requiredPaise: bigint; availablePaise: bigint };

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; duplicate: boolean }
  | ({ ok: false } & PlaceOrderFailure);

/** Thrown inside the transaction to roll it back with a typed reason. */
class OrderRejection extends Error {
  constructor(readonly failure: PlaceOrderFailure) {
    super(failure.reason);
    this.name = 'OrderRejection';
  }
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // R5 — before doing any work, check whether this key has already produced an
  // order. The unique constraint is the real guarantee; this is the fast path.
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, orderNumber: true, userId: true },
  });

  if (existing) {
    // A key is scoped to the user who used it. Another account presenting the
    // same key gets a fresh attempt, not somebody else's order.
    if (existing.userId === input.userId) {
      return {
        ok: true,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        duplicate: true,
      };
    }
    return { ok: false, reason: 'PAYMENT_METHOD_UNAVAILABLE', detail: 'idempotency key in use' };
  }

  const feeConfig = await loadFeeConfig();

  try {
    const result = await db.$transaction(async (tx) => {
      // ── Address and serviceability (re-validated at checkout, per M3).
      const address = await tx.address.findUnique({
        where: { id: input.addressId },
        select: {
          id: true,
          userId: true,
          label: true,
          line1: true,
          line2: true,
          landmark: true,
          city: true,
          state: true,
          pincode: true,
          latitude: true,
          longitude: true,
        },
      });

      if (!address || address.userId !== input.userId) {
        throw new OrderRejection({ reason: 'ADDRESS_NOT_FOUND' });
      }

      const serviceability = await checkServiceability({
        pincode: address.pincode,
        latitude: address.latitude ?? undefined,
        longitude: address.longitude ?? undefined,
      });

      if (!serviceability.serviceable) {
        throw new OrderRejection({
          reason: 'NOT_SERVICEABLE',
          detail: serviceability.reason,
        });
      }

      // ── Cart, read inside the transaction so nothing shifts underneath us.
      const cart = await tx.cart.findUnique({
        where: { userId: input.userId },
        select: {
          id: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              variant: {
                select: {
                  id: true,
                  label: true,
                  pricePaise: true,
                  stockQty: true,
                  isActive: true,
                  product: {
                    select: {
                      id: true,
                      nameEn: true,
                      nameMr: true,
                      nameHi: true,
                      imageUrls: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const sellable = (cart?.items ?? []).filter(
        (item) => item.variant.isActive && item.variant.product.isActive,
      );

      if (sellable.length === 0) throw new OrderRejection({ reason: 'EMPTY_CART' });

      // ── Bill, computed from live catalogue prices, never from the client.
      const itemTotalPaise = sellable.reduce(
        (sum, item) => sum + item.variant.pricePaise * BigInt(item.quantity),
        0n,
      );

      const bill = computeBill(
        {
          itemTotalPaise,
          orderType: 'INSTANT',
          areaDeliveryFeePaise: serviceability.deliveryFeePaise,
          areaFreeDeliveryThresholdPaise: serviceability.freeDeliveryThresholdPaise,
        },
        feeConfig,
      );

      if (!bill.meetsMinimum) {
        throw new OrderRejection({
          reason: 'BELOW_MINIMUM',
          minOrderValuePaise: bill.minOrderValuePaise,
          itemTotalPaise,
        });
      }

      if (!isPaymentMethodAllowed(bill, input.paymentMethod)) {
        throw new OrderRejection({
          reason: 'PAYMENT_METHOD_UNAVAILABLE',
          detail: bill.codUnavailableReason,
        });
      }

      // ── Atomic stock decrement.
      //
      // `updateMany` with `stockQty: { gte: n }` compiles to a single
      // conditional UPDATE. If it reports zero rows changed, somebody else got
      // there first — no read-then-write race is possible.
      const outOfStock: Array<{ variantId: string; name: string; availableQty: number }> = [];

      for (const item of sellable) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, stockQty: { gte: item.quantity } },
          data: { stockQty: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          const current = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            select: { stockQty: true },
          });
          outOfStock.push({
            variantId: item.variantId,
            name: pickName(item.variant.product, input.locale),
            availableQty: current?.stockQty ?? 0,
          });
        }
      }

      // Any shortfall rolls the whole transaction back, including the
      // decrements that did succeed.
      if (outOfStock.length > 0) {
        throw new OrderRejection({ reason: 'OUT_OF_STOCK', items: outOfStock });
      }

      // ── The order itself.
      const orderId = newId(ID_PREFIX.order);
      const now = new Date();

      const order = await tx.order.create({
        data: {
          id: orderId,
          orderNumber: newOrderNumber(now),
          userId: input.userId,
          // A snapshot, not a reference: the customer editing this address next
          // month must not rewrite where last month's order went.
          addressSnapshot: {
            id: address.id,
            label: address.label,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          type: 'INSTANT',
          status: 'PLACED',
          subtotalPaise: bill.itemTotalPaise,
          deliveryFeePaise: bill.deliveryFeePaise,
          handlingFeePaise: bill.handlingFeePaise,
          discountPaise: bill.discountPaise,
          totalPaise: bill.totalPaise,
          paymentMethod: input.paymentMethod,
          paymentStatus: 'PENDING',
          deliverySlot: input.deliverySlot,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes ?? null,
          placedAt: now,
          items: {
            create: sellable.map((item) => ({
              id: newId(ID_PREFIX.orderItem),
              productId: item.productId,
              variantId: item.variantId,
              nameSnapshot: pickName(item.variant.product, input.locale),
              imageSnapshot: Array.isArray(item.variant.product.imageUrls)
                ? ((item.variant.product.imageUrls[0] as string | undefined) ?? null)
                : null,
              quantity: item.quantity,
              unitPricePaise: item.variant.pricePaise,
              totalPaise: item.variant.pricePaise * BigInt(item.quantity),
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      await tx.orderStatusHistory.create({
        data: {
          id: newId(ID_PREFIX.orderStatus),
          orderId: order.id,
          fromStatus: null,
          toStatus: 'PLACED',
          changedBy: input.userId,
          reason: 'Order placed',
        },
      });

      // ── Payment.
      if (input.paymentMethod === 'WALLET') {
        try {
          await debit(
            {
              userId: input.userId,
              amountPaise: bill.totalPaise,
              source: 'ORDER',
              ...LEDGER_REF.order(order.id),
              note: `Order ${order.orderNumber}`,
            },
            tx,
          );
        } catch (error) {
          if (error instanceof InsufficientBalanceError) {
            throw new OrderRejection({
              reason: 'INSUFFICIENT_BALANCE',
              requiredPaise: error.requiredPaise,
              availablePaise: error.availablePaise,
            });
          }
          throw error;
        }

        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'PAID' },
        });
      }
      // COD stays PENDING until the rider collects. RAZORPAY stays PENDING
      // until the webhook lands (P2 — the browser callback proves nothing).

      // ── The cart is emptied only once everything above has succeeded.
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return { orderId: order.id, orderNumber: order.orderNumber };
    });

    return { ok: true, ...result, duplicate: false };
  } catch (error) {
    if (error instanceof OrderRejection) {
      return { ok: false, ...error.failure };
    }

    // R5 — two identical submissions racing each other. The unique constraint
    // on `idempotency_key` caught the loser; return the winner's order.
    if (isUniqueViolation(error)) {
      const winner = await db.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, orderNumber: true },
      });
      if (winner) {
        return {
          ok: true,
          orderId: winner.id,
          orderNumber: winner.orderNumber,
          duplicate: true,
        };
      }
    }

    throw error;
  }
}
