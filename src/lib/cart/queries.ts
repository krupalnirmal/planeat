import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { ID_PREFIX, newId } from '@/lib/ids';
import { pickName } from '@/lib/catalog/text';
import { getStorageProvider } from '@/lib/services/storage';
import type { Prisma } from '@/generated/prisma/client';
import type { Locale, UnitType } from '@/generated/prisma/enums';

/**
 * Server-side cart (M3).
 *
 * Logged-in users get a database cart so it survives a reinstall and follows
 * them between devices; guests keep theirs in localStorage and merge it in at
 * login. The merge is additive — a guest who spent ten minutes filling a cart
 * before logging in must not lose it, and neither must the cart they left on
 * their phone last week.
 */

const MAX_QTY_PER_LINE = 20;

export interface CartLineView {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  /** English name, shown together with `localName` as "English (Marathi)"
      (session 2026-09-01), same bilingual format as the product cards. */
  nameEn: string;
  localName: string | null;
  imageUrl: string | null;
  variantLabel: string;
  quantity: number;
  unitQuantity: number;
  unit: UnitType;
  unitPricePaise: bigint;
  mrpPaise: bigint;
  linePaise: bigint;
  /** Stock available right now, for the stepper's ceiling. */
  availableQty: number;
  inStock: boolean;
  isActive: boolean;
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  itemCount: number;
  itemTotalPaise: bigint;
}

const cartLineSelect = {
  id: true,
  productId: true,
  variantId: true,
  quantity: true,
  variant: {
    select: {
      id: true,
      label: true,
      quantity: true,
      unit: true,
      pricePaise: true,
      mrpPaise: true,
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
} satisfies Prisma.CartItemSelect;

type CartLineRow = Prisma.CartItemGetPayload<{ select: typeof cartLineSelect }>;

function firstImage(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  const first = imageUrls[0];
  if (typeof first !== 'string' || first === '') return null;
  if (first.startsWith('http') || first.startsWith('/')) return first;
  return getStorageProvider().urlFor(first, { width: 300, auto: true });
}

function toLine(row: CartLineRow, locale: Locale): CartLineView {
  const { variant } = row;
  const unitPrice = variant.pricePaise;

  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    name: pickName(variant.product, locale),
    nameEn: variant.product.nameEn,
    localName: variant.product.nameMr,
    imageUrl: firstImage(variant.product.imageUrls),
    variantLabel: variant.label,
    quantity: row.quantity,
    unitQuantity: variant.quantity,
    unit: variant.unit,
    unitPricePaise: unitPrice,
    mrpPaise: variant.mrpPaise,
    linePaise: unitPrice * BigInt(row.quantity),
    availableQty: variant.stockQty,
    inStock: variant.stockQty >= row.quantity,
    isActive: variant.isActive && variant.product.isActive,
  };
}

function summarise(id: string | null, rows: CartLineRow[], locale: Locale): CartView {
  const lines = rows.map((row) => toLine(row, locale));
  return {
    id,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    // Only sellable lines count towards the total — a delisted product must
    // not quietly inflate the bill the customer is about to approve.
    itemTotalPaise: lines
      .filter((line) => line.isActive)
      .reduce((sum, line) => sum + line.linePaise, 0n),
  };
}

/** One query. Creating the cart row is deferred until something is added. */
export async function getCart(userId: string, locale: Locale): Promise<CartView> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: { orderBy: { addedAt: 'asc' }, select: cartLineSelect },
    },
  });

  if (!cart) return { id: null, lines: [], itemCount: 0, itemTotalPaise: 0n };
  return summarise(cart.id, cart.items, locale);
}

async function ensureCart(userId: string, client: Prisma.TransactionClient | typeof db = db) {
  const existing = await client.cart.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return existing.id;

  try {
    const created = await client.cart.create({
      data: { id: newId(ID_PREFIX.cart), userId },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    // Two tabs adding to an empty cart at the same time both try to create it.
    if (!isUniqueViolation(error)) throw error;
    const raced = await client.cart.findUniqueOrThrow({
      where: { userId },
      select: { id: true },
    });
    return raced.id;
  }
}

export interface AddToCartInput {
  variantId: string;
  quantity: number;
}

export type AddToCartResult =
  | { ok: true; cart: CartView }
  | { ok: false; reason: 'VARIANT_NOT_FOUND' | 'UNAVAILABLE' | 'INSUFFICIENT_STOCK'; availableQty?: number };

/**
 * Adds to the cart, or increases the line already there.
 *
 * Stock is checked but NOT reserved: holding stock at add-to-cart would let
 * one abandoned cart make a vegetable unbuyable for everyone else. The
 * authoritative check is the atomic decrement at order placement.
 */
export async function addToCart(
  userId: string,
  input: AddToCartInput,
  locale: Locale,
): Promise<AddToCartResult> {
  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    select: {
      id: true,
      productId: true,
      stockQty: true,
      isActive: true,
      product: { select: { isActive: true } },
    },
  });

  if (!variant) return { ok: false, reason: 'VARIANT_NOT_FOUND' };
  if (!variant.isActive || !variant.product.isActive) return { ok: false, reason: 'UNAVAILABLE' };

  const cartId = await ensureCart(userId);

  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId: variant.id } },
    select: { id: true, quantity: true },
  });

  const desired = Math.min(MAX_QTY_PER_LINE, (existing?.quantity ?? 0) + input.quantity);

  if (variant.stockQty < desired) {
    return { ok: false, reason: 'INSUFFICIENT_STOCK', availableQty: variant.stockQty };
  }

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
  } else {
    await db.cartItem.create({
      data: {
        id: newId(ID_PREFIX.cartItem),
        cartId,
        productId: variant.productId,
        variantId: variant.id,
        quantity: desired,
      },
    });
  }

  await db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });

  return { ok: true, cart: await getCart(userId, locale) };
}

/** Setting a quantity of zero removes the line — that is what the stepper does. */
export async function setCartLineQuantity(
  userId: string,
  lineId: string,
  quantity: number,
  locale: Locale,
): Promise<CartView | null> {
  const line = await db.cartItem.findUnique({
    where: { id: lineId },
    select: { id: true, cart: { select: { id: true, userId: true } } },
  });

  if (!line || line.cart.userId !== userId) return null;

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: line.id } });
  } else {
    await db.cartItem.update({
      where: { id: line.id },
      data: { quantity: Math.min(MAX_QTY_PER_LINE, quantity) },
    });
  }

  return getCart(userId, locale);
}

export async function removeCartLine(
  userId: string,
  lineId: string,
  locale: Locale,
): Promise<CartView | null> {
  return setCartLineQuantity(userId, lineId, 0, locale);
}

export async function clearCart(
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<void> {
  const cart = await client.cart.findUnique({ where: { userId }, select: { id: true } });
  if (!cart) return;
  await client.cartItem.deleteMany({ where: { cartId: cart.id } });
}

export interface GuestCartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

/**
 * M3 — merges the guest's localStorage cart into their server cart at login.
 *
 * Additive, taking the larger quantity per variant rather than summing:
 * summing double-counts the common case where the same person added the same
 * item on two devices, and silently ordering four kilos of onions because of
 * that is a complaint, not a feature.
 */
export async function mergeGuestCart(
  userId: string,
  guestLines: GuestCartLine[],
  locale: Locale,
): Promise<CartView> {
  if (guestLines.length === 0) return getCart(userId, locale);

  const variantIds = [...new Set(guestLines.map((line) => line.variantId))];

  // One query for every variant, rather than one per line.
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds }, isActive: true, product: { isActive: true } },
    select: { id: true, productId: true, stockQty: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const cartId = await ensureCart(userId);
  const existing = await db.cartItem.findMany({
    where: { cartId },
    select: { id: true, variantId: true, quantity: true },
  });
  const existingByVariant = new Map(existing.map((item) => [item.variantId, item]));

  for (const line of guestLines) {
    const variant = byId.get(line.variantId);
    // A variant that has been delisted since the guest added it is dropped
    // rather than failing the whole merge.
    if (!variant) continue;

    const current = existingByVariant.get(line.variantId);
    const target = Math.min(
      MAX_QTY_PER_LINE,
      variant.stockQty,
      Math.max(current?.quantity ?? 0, line.quantity),
    );
    if (target <= 0) continue;

    if (current) {
      if (target !== current.quantity) {
        await db.cartItem.update({ where: { id: current.id }, data: { quantity: target } });
      }
    } else {
      await db.cartItem.create({
        data: {
          id: newId(ID_PREFIX.cartItem),
          cartId,
          productId: variant.productId,
          variantId: variant.id,
          quantity: target,
        },
      });
    }
  }

  return getCart(userId, locale);
}
