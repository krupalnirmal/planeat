import { z } from 'zod';
import { COMPLAINT_CATEGORIES } from '@/lib/complaints/complaints';

export const submitComplaintSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  description: z.string().trim().min(10).max(1000),
  photoUrls: z.array(z.url().max(500)).max(5).default([]),
});
export type SubmitComplaintRequest = z.infer<typeof submitComplaintSchema>;

export const replyComplaintSchema = z.object({
  reply: z.string().trim().min(5).max(1000),
});
export type ReplyComplaintRequest = z.infer<typeof replyComplaintSchema>;
