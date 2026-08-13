import { z } from 'zod';
import { cuidSchema, localeSchema, paginationSchema, phoneSchema } from './common';

const vehicleTypeSchema = z.enum(['BICYCLE', 'BIKE', 'SCOOTER', 'EV', 'WALK']);

/** M9 — admin inputs. R9: every one of these is validated server-side. */

export const adminListQuerySchema = paginationSchema.extend({
  query: z.string().trim().max(80).optional(),
  locale: localeSchema.default('mr'),
});

export const picklistQuerySchema = z.object({
  date: z.iso.date().optional(),
  locale: localeSchema.default('mr'),
});

export const ordersQuerySchema = adminListQuerySchema.extend({
  status: z
    .enum([
      'PLACED',
      'CONFIRMED',
      'PACKED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'FAILED_DELIVERY',
      'REFUNDED',
      'PAYMENT_PENDING',
    ])
    .optional(),
  type: z.enum(['INSTANT', 'MEAL_PLAN_DAILY']).optional(),
  date: z.iso.date().optional(),
  unassignedOnly: z.coerce.boolean().optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum([
    'PLACED',
    'CONFIRMED',
    'PACKED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'FAILED_DELIVERY',
    'REFUNDED',
  ]),
  reason: z.string().trim().max(255).optional(),
});

/** B12 — one at a time, or the whole suggested set in one tap. */
export const assignRiderSchema = z.object({
  assignments: z
    .array(z.object({ orderId: cuidSchema, partnerId: cuidSchema }))
    .min(1)
    .max(200),
});

export const inventoryQuerySchema = adminListQuerySchema.extend({
  categorySlug: z.string().trim().max(120).optional(),
  onlyLow: z.coerce.boolean().optional(),
  onlyOut: z.coerce.boolean().optional(),
});

export const bulkStockSchema = z.object({
  updates: z
    .array(
      z.object({
        variantId: cuidSchema,
        stockQty: z.coerce.number().int().min(0).max(1_000_000).optional(),
        lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
        pricePaise: z.coerce.number().int().min(0).max(100_000_000).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});

const unitTypeSchema = z.enum(['G', 'KG', 'ML', 'L', 'PIECE', 'BUNCH', 'PACK']);

export const productSchema = z.object({
  sku: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(1).max(160),
  nameMr: z.string().trim().min(1).max(160),
  nameHi: z.string().trim().min(1).max(160),
  categoryId: cuidSchema,
  unitType: unitTypeSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  isMealPlanEligible: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

export const productPatchSchema = productSchema.partial();

export const variantSchema = z.object({
  variantId: cuidSchema.nullable().optional(),
  label: z.string().trim().min(1).max(60),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unit: unitTypeSchema,
  mrpPaise: z.coerce.number().int().min(0).max(100_000_000),
  pricePaise: z.coerce.number().int().min(0).max(100_000_000),
  stockQty: z.coerce.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).default(5),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const categorySchema = z.object({
  categoryId: cuidSchema.nullable().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  nameEn: z.string().trim().min(1).max(120),
  nameMr: z.string().trim().min(1).max(120),
  nameHi: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  iconUrl: z.url().max(500).nullable().optional(),
});

/** M4 — the alias dictionary is managed from here. */
export const aliasSchema = z.object({
  productId: cuidSchema,
  alias: z.string().trim().min(2).max(120),
  locale: localeSchema.default('mr'),
});

export const mealPlansQuerySchema = adminListQuerySchema.extend({
  flaggedOnly: z.coerce.boolean().optional(),
  unreviewedOnly: z.coerce.boolean().optional(),
});

export const reviewPlanSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

/** S7 — the manual override. Still passes the S4 allergen check. */
export const manualEditSchema = z.object({
  mealPlanItemId: cuidSchema,
  productId: cuidSchema,
});

export const settingUpdateSchema = z.object({
  key: z.string().trim().min(3).max(80),
  value: z.unknown(),
});

export const auditQuerySchema = paginationSchema.extend({
  actorId: cuidSchema.optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
});

/** S6 — reading somebody's health profile needs a stated reason. */
export const healthProfileAccessSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason an auditor could follow').max(255),
});

/** M9/M10 — the owner adding a new rider. */
export const createDeliveryPartnerSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(120),
  vehicleType: vehicleTypeSchema.default('BIKE'),
  serviceAreaId: cuidSchema.nullable().optional(),
});

export const updateDeliveryPartnerSchema = z.object({
  vehicleType: vehicleTypeSchema.optional(),
  serviceAreaId: cuidSchema.nullable().optional(),
  isAvailable: z.boolean().optional(),
});
