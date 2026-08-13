import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { VehicleType } from '@/generated/prisma/enums';
import { audit } from './audit';

/**
 * M9 — "Delivery Partners: CRUD, availability, load."
 *
 * This is the admin half of M10: a rider cannot sign in to the delivery PWA
 * (`requireDeliveryPartner()`, `src/lib/delivery/guard.ts`) until a row here
 * links their phone number to a `DeliveryPartner`. Availability itself is
 * normally toggled by the rider from their own dashboard — this screen is for
 * the owner adding a new rider, moving one between service areas, or turning
 * one off when they are unreachable.
 */

export interface DeliveryPartnerRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  vehicleType: VehicleType;
  isAvailable: boolean;
  serviceAreaId: string | null;
  serviceAreaName: string | null;
  /** Deliveries assigned today — the same load figure B12's suggestion uses. */
  todayLoad: number;
}

export async function listDeliveryPartners(): Promise<DeliveryPartnerRow[]> {
  const dayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const dayEnd = new Date(new Date().toISOString().slice(0, 10) + 'T23:59:59.999Z');

  const [partners, load] = await Promise.all([
    db.deliveryPartner.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        vehicleType: true,
        isAvailable: true,
        serviceAreaId: true,
        user: { select: { name: true, phone: true } },
        serviceArea: { select: { name: true } },
      },
    }),
    db.deliveryAssignment.groupBy({
      by: ['partnerId'],
      where: { assignedAt: { gte: dayStart, lte: dayEnd } },
      _count: { partnerId: true },
    }),
  ]);

  const loadByPartner = new Map(load.map((entry) => [entry.partnerId, entry._count.partnerId]));

  return partners.map((partner) => ({
    id: partner.id,
    userId: partner.userId,
    name: partner.user.name ?? partner.user.phone,
    phone: partner.user.phone,
    vehicleType: partner.vehicleType,
    isAvailable: partner.isAvailable,
    serviceAreaId: partner.serviceAreaId,
    serviceAreaName: partner.serviceArea?.name ?? null,
    todayLoad: loadByPartner.get(partner.id) ?? 0,
  }));
}

export interface CreatePartnerInput {
  phone: string;
  name: string;
  vehicleType: VehicleType;
  serviceAreaId: string | null;
}

export type CreatePartnerResult =
  | { ok: true; partnerId: string }
  | { ok: false; reason: 'PHONE_IN_USE' };

/**
 * A rider is a `User` with role `DELIVERY_PARTNER` plus the partner row. If
 * the phone number already belongs to a customer or admin, this refuses
 * rather than silently promoting their role out from under them.
 */
export async function createDeliveryPartner(
  input: CreatePartnerInput,
  actorId: string,
  ip: string | null,
): Promise<CreatePartnerResult> {
  const existing = await db.user.findUnique({ where: { phone: input.phone } });
  if (existing) return { ok: false, reason: 'PHONE_IN_USE' };

  const partnerId = newId(ID_PREFIX.deliveryPartner);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: newId(ID_PREFIX.user),
        phone: input.phone,
        name: input.name,
        role: 'DELIVERY_PARTNER',
      },
    });

    await tx.deliveryPartner.create({
      data: {
        id: partnerId,
        userId: user.id,
        vehicleType: input.vehicleType,
        serviceAreaId: input.serviceAreaId,
        isAvailable: false,
      },
    });
  });

  await audit({
    actorId,
    action: 'delivery_partner.create',
    entityType: 'DeliveryPartner',
    entityId: partnerId,
    before: {},
    after: { phone: input.phone, name: input.name, vehicleType: input.vehicleType },
    ip,
  });

  return { ok: true, partnerId };
}

export interface UpdatePartnerInput {
  vehicleType?: VehicleType;
  serviceAreaId?: string | null;
  isAvailable?: boolean;
}

export type UpdatePartnerResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

export async function updateDeliveryPartner(
  partnerId: string,
  input: UpdatePartnerInput,
  actorId: string,
  ip: string | null,
): Promise<UpdatePartnerResult> {
  const before = await db.deliveryPartner.findUnique({
    where: { id: partnerId },
    select: { vehicleType: true, serviceAreaId: true, isAvailable: true },
  });
  if (!before) return { ok: false, reason: 'NOT_FOUND' };

  await db.deliveryPartner.update({ where: { id: partnerId }, data: input });

  await audit({
    actorId,
    action: 'delivery_partner.update',
    entityType: 'DeliveryPartner',
    entityId: partnerId,
    before,
    after: input,
    ip,
  });

  return { ok: true };
}
