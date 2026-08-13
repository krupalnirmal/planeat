import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type {
  DeliverySlot,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
} from '@/generated/prisma/enums';

/**
 * Order reads (M3): history, detail, and the data the reorder button needs.
 *
 * Everything a customer sees comes from the order's own snapshot columns, not
 * from the live catalogue. A price change or a renamed product must never
 * rewrite what an old invoice says.
 */

export interface AddressSnapshot {
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderItemView {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPricePaise: bigint;
  totalPaise: bigint;
  isSubstituted: boolean;
  originalProductId: string | null;
}

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalPaise: bigint;
  itemCount: number;
  placedAt: Date;
  deliveredAt: Date | null;
  deliverySlot: DeliverySlot | null;
  previewItems: Array<{ name: string; imageUrl: string | null }>;
}

export interface OrderDetailView extends Omit<OrderSummaryView, 'previewItems'> {
  address: AddressSnapshot;
  subtotalPaise: bigint;
  deliveryFeePaise: bigint;
  handlingFeePaise: bigint;
  discountPaise: bigint;
  notes: string | null;
  cancelledAt: Date | null;
  /** Read out to the rider at the door (M10) — null until a rider is assigned. */
  deliveryOtp: string | null;
  riderName: string | null;
  items: OrderItemView[];
  history: Array<{
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    createdAt: Date;
  }>;
  issues: Array<{
    id: string;
    reasonCode: string;
    status: string;
    claimedPaise: bigint;
    creditedPaise: bigint;
    createdAt: Date;
  }>;
}

function parseAddress(snapshot: Prisma.JsonValue): AddressSnapshot {
  const raw = (snapshot ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const nullable = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : null);

  return {
    label: str('label'),
    line1: str('line1'),
    line2: nullable('line2'),
    landmark: nullable('landmark'),
    city: str('city'),
    state: str('state'),
    pincode: str('pincode'),
  };
}

/** One query. The preview thumbnails come from the items already joined. */
export async function listOrders(
  userId: string,
  { skip, take }: { skip: number; take: number },
): Promise<{ orders: OrderSummaryView[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where: { userId },
      orderBy: { placedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        totalPaise: true,
        placedAt: true,
        deliveredAt: true,
        deliverySlot: true,
        items: { select: { nameSnapshot: true, imageSnapshot: true, quantity: true } },
      },
    }),
    db.order.count({ where: { userId } }),
  ]);

  return {
    total,
    orders: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      type: row.type,
      status: row.status,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      totalPaise: row.totalPaise,
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      placedAt: row.placedAt,
      deliveredAt: row.deliveredAt,
      deliverySlot: row.deliverySlot,
      previewItems: row.items.slice(0, 4).map((item) => ({
        name: item.nameSnapshot,
        imageUrl: item.imageSnapshot,
      })),
    })),
  };
}

/** One query. Ownership is the caller's responsibility — see the route (R9). */
export async function getOrderDetail(
  orderId: string,
  userId: string,
): Promise<OrderDetailView | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      orderNumber: true,
      type: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      addressSnapshot: true,
      subtotalPaise: true,
      deliveryFeePaise: true,
      handlingFeePaise: true,
      discountPaise: true,
      totalPaise: true,
      notes: true,
      placedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      deliverySlot: true,
      items: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          nameSnapshot: true,
          imageSnapshot: true,
          quantity: true,
          unitPricePaise: true,
          totalPaise: true,
          isSubstituted: true,
          originalProductId: true,
        },
      },
      assignment: {
        select: {
          deliveryOtp: true,
          status: true,
          partner: { select: { user: { select: { name: true } } } },
        },
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        select: { fromStatus: true, toStatus: true, reason: true, createdAt: true },
      },
      issues: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reasonCode: true,
          status: true,
          claimedPaise: true,
          creditedPaise: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order || order.userId !== userId) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    address: parseAddress(order.addressSnapshot),
    subtotalPaise: order.subtotalPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    handlingFeePaise: order.handlingFeePaise,
    discountPaise: order.discountPaise,
    totalPaise: order.totalPaise,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    notes: order.notes,
    placedAt: order.placedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    deliverySlot: order.deliverySlot,
    // Only useful while a delivery is actually in progress — once it lands
    // or fails, showing a stale code invites reading it to the wrong person.
    deliveryOtp:
      order.assignment && order.assignment.status !== 'DELIVERED' && order.assignment.status !== 'FAILED'
        ? order.assignment.deliveryOtp
        : null,
    riderName: order.assignment?.partner.user.name ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.nameSnapshot,
      imageUrl: item.imageSnapshot,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      totalPaise: item.totalPaise,
      isSubstituted: item.isSubstituted,
      originalProductId: item.originalProductId,
    })),
    history: order.statusHistory,
    issues: order.issues,
  };
}

/**
 * M3 reorder — the variants from a past order that are still sellable.
 *
 * Returns what is missing as well, because silently dropping two of five items
 * and calling it a reorder is how someone ends up cooking without onions.
 */
export async function getReorderLines(
  orderId: string,
  userId: string,
): Promise<{
  available: Array<{ productId: string; variantId: string; quantity: number }>;
  unavailable: Array<{ name: string; reason: 'DELISTED' | 'OUT_OF_STOCK' }>;
} | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      items: {
        select: { productId: true, variantId: true, quantity: true, nameSnapshot: true },
      },
    },
  });

  if (!order || order.userId !== userId) return null;

  const variantIds = order.items.map((item) => item.variantId);
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      productId: true,
      stockQty: true,
      isActive: true,
      product: { select: { isActive: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const available: Array<{ productId: string; variantId: string; quantity: number }> = [];
  const unavailable: Array<{ name: string; reason: 'DELISTED' | 'OUT_OF_STOCK' }> = [];

  for (const item of order.items) {
    const variant = byId.get(item.variantId);

    if (!variant || !variant.isActive || !variant.product.isActive) {
      unavailable.push({ name: item.nameSnapshot, reason: 'DELISTED' });
      continue;
    }
    if (variant.stockQty <= 0) {
      unavailable.push({ name: item.nameSnapshot, reason: 'OUT_OF_STOCK' });
      continue;
    }

    available.push({
      productId: variant.productId,
      variantId: variant.id,
      quantity: Math.min(item.quantity, variant.stockQty),
    });
  }

  return { available, unavailable };
}
