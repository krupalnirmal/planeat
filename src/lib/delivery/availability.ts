import { db } from '@/lib/db';

/** M10 — "Phone + OTP login, availability toggle." */
export async function setAvailability(partnerId: string, isAvailable: boolean): Promise<void> {
  await db.deliveryPartner.update({ where: { id: partnerId }, data: { isAvailable } });
}
