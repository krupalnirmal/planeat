import { z } from 'zod';
import { cuidSchema } from './common';

export const WALLET_SOURCES = [
  'TOPUP',
  'ORDER',
  'PLAN_FEE',
  'REFUND',
  'ADJUSTMENT',
  'COMPLAINT_CREDIT',
  'CANCELLATION',
] as const;

export const initiateTopupSchema = z.object({
  /** Paise, integer. The chips send 20000 / 50000 / 100000; custom is free-form. */
  amountPaise: z.coerce.number().int().min(100).max(100_000_000),
});
export type InitiateTopupRequest = z.infer<typeof initiateTopupSchema>;

export const walletTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  direction: z.enum(['CREDIT', 'DEBIT']).optional(),
  source: z.enum(WALLET_SOURCES).optional(),
});
export type WalletTransactionsQuery = z.infer<typeof walletTransactionsQuerySchema>;

export const topupStatusQuerySchema = z.object({
  paymentId: cuidSchema,
});

/** M7 — an admin adjustment without a reason is indistinguishable from theft. */
export const adjustWalletSchema = z.object({
  userId: cuidSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountPaise: z.coerce.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(5, 'Give a reason an auditor could follow').max(255),
});
export type AdjustWalletRequest = z.infer<typeof adjustWalletSchema>;
