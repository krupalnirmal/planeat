import { z } from 'zod';

/**
 * Zod schemas shared between React Hook Form and API validation (PART 4).
 *
 * One definition, two consumers: a field the form accepts can never be a field
 * the API rejects.
 */

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
  })
  .refine((value) => /^[6-9]\d{9}$/.test(value), {
    message: 'Enter a valid 10-digit Indian mobile number',
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'The code is 6 digits');

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

export const localeSchema = z.enum(['mr', 'hi', 'en']);

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

export const cuidSchema = z.string().trim().min(3).max(60);

/** Cursor-free pagination: TiDB handles OFFSET fine at our page depths. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function paginate({ page, perPage }: Pagination) {
  return { skip: (page - 1) * perPage, take: perPage };
}

/** M8 — shared by the customer app and the rider PWA; neither is push-specific. */
export const pushRegisterSchema = z.object({
  token: z.string().trim().min(10).max(255),
  platform: z.enum(['android', 'ios', 'web']).default('web'),
});
