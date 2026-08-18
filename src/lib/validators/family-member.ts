import { z } from 'zod';
import { MEDICAL_CONDITIONS } from '@/lib/meal-plan/taxonomy';
import { cuidSchema } from './common';

/**
 * A single family member (doc §8 — "Enter Each Member One by One"). Mirrors
 * `healthProfileSchema`'s shape for the same fields, since both feed the same
 * candidate-filtering and safety pipeline.
 */
export const familyMemberSchema = z.object({
  name: z.string().trim().min(1).max(80),
  age: z.coerce.number().int().min(0).max(120).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).nullable().optional(),
  likedProductIds: z.array(cuidSchema).max(50).default([]),
  dislikedProductIds: z.array(cuidSchema).max(50).default([]),
  allergies: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  medicalConditions: z.array(z.enum(MEDICAL_CONDITIONS)).max(16).default([]),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type FamilyMemberInput = z.infer<typeof familyMemberSchema>;

export const updateFamilyMemberSchema = familyMemberSchema.partial();
