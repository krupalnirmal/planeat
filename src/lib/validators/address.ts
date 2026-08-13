import { z } from 'zod';
import { latitudeSchema, longitudeSchema, phoneSchema, pincodeSchema } from './common';

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  line1: z.string().trim().min(3, 'Please enter the house number and building').max(255),
  line2: z.string().trim().max(255).optional().or(z.literal('')),
  landmark: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80).default('Maharashtra'),
  pincode: pincodeSchema,
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const updateAddressSchema = addressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const serviceabilityQuerySchema = z
  .object({
    pincode: pincodeSchema.optional(),
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
  })
  .refine((value) => value.pincode !== undefined || (value.lat !== undefined && value.lng !== undefined), {
    message: 'Provide either a pincode or both lat and lng',
  });
export type ServiceabilityQueryInput = z.infer<typeof serviceabilityQuerySchema>;

/** B11 — the waitlist is how the owner decides where to expand next. */
export const waitlistSchema = z.object({
  phone: phoneSchema,
  pincode: pincodeSchema,
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
});
export type WaitlistInput = z.infer<typeof waitlistSchema>;
