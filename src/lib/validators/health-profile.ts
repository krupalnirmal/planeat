import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  ALLERGEN_CODES,
  DIETARY_PREFERENCES,
  HEALTH_GOALS,
  MEDICAL_CONDITIONS,
} from '@/lib/meal-plan/taxonomy';
import { cuidSchema } from './common';

/**
 * The health profile (M5). Shared by the wizard and the API, so a field the
 * form accepts can never be one the API rejects.
 *
 * S6 — this is sensitive personal data under India's DPDP Act. The schema is
 * deliberately narrow: nothing is accepted that the plan generator does not
 * actually use.
 */

/**
 * Allergies accept both known codes and free text. Free text is matched
 * literally and fails closed (see `allergens.ts`) — a customer who writes
 * "मला शेंगदाणे चालत नाहीत" must be as protected as one who ticked PEANUT.
 */
const allergyEntrySchema = z.string().trim().min(1).max(80);

export const healthProfileSchema = z.object({
  // Step 1 — basics
  age: z.coerce.number().int().min(1).max(120).nullable().optional(),
  heightCm: z.coerce.number().int().min(50).max(250).nullable().optional(),
  weightKg: z.coerce.number().int().min(10).max(300).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).nullable().optional(),
  activityLevel: z.enum(ACTIVITY_LEVELS).nullable().optional(),

  // Step 2 — household. Drives B4, so the bounds are real, not decorative.
  householdAdults: z.coerce.number().int().min(1).max(20),
  householdChildren: z.coerce.number().int().min(0).max(20),

  // Step 3 — health
  medicalConditions: z.array(z.enum(MEDICAL_CONDITIONS)).max(16).default([]),
  medications: z.string().trim().max(500).nullable().optional(),

  // Step 4 — allergies. A hard constraint (S4).
  allergies: z.array(allergyEntrySchema).max(20).default([]),

  // Step 5 — preferences
  dietaryPreference: z.enum(DIETARY_PREFERENCES).default('VEG'),
  likedProductIds: z.array(cuidSchema).max(50).default([]),
  dislikedProductIds: z.array(cuidSchema).max(50).default([]),

  // Step 6 — goal
  goal: z.enum(HEALTH_GOALS).default('GENERAL_HEALTH'),
  notes: z.string().trim().max(1000).nullable().optional(),

  // Step 7 — consent (S2). Mandatory; the API refuses anything else.
  consentGiven: z.literal(true, {
    message: 'Consent is required before a plan can be generated',
  }),
});

export type HealthProfileInput = z.infer<typeof healthProfileSchema>;

/** Used by the wizard's per-step validation; consent is only checked at the end. */
export const healthProfileDraftSchema = healthProfileSchema
  .omit({ consentGiven: true })
  .partial()
  .extend({
    householdAdults: z.coerce.number().int().min(1).max(20).optional(),
    householdChildren: z.coerce.number().int().min(0).max(20).optional(),
  });

export const ALLERGEN_OPTIONS = ALLERGEN_CODES;
