import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';
import type { AIUsage } from '@/lib/services/ai';
import type { AiCallStatus, AiFeature } from '@/generated/prisma/enums';

/**
 * R6 — "Log every call to `ai_generation_logs`."
 *
 * Free AI tiers are measured in tokens and requests per minute, and the first
 * question when a plan comes out wrong is always "which provider, which model,
 * which prompt version, and did it fall back?". None of that is recoverable
 * after the fact unless it was written down at the time.
 *
 * Logging never throws. A failed log line must not fail a plan the customer is
 * waiting for.
 */

export interface AiLogEntry {
  userId: string | null;
  feature: AiFeature;
  provider: string;
  model: string;
  promptVersion: string;
  usage: AIUsage | null;
  status: AiCallStatus;
  error?: string | null;
}

export async function logAiCall(entry: AiLogEntry): Promise<void> {
  try {
    await db.aiGenerationLog.create({
      data: {
        id: newId(ID_PREFIX.aiLog),
        userId: entry.userId,
        feature: entry.feature,
        provider: entry.provider,
        model: entry.model,
        promptVersion: entry.promptVersion,
        inputTokens: entry.usage?.inputTokens ?? 0,
        outputTokens: entry.usage?.outputTokens ?? 0,
        latencyMs: entry.usage?.latencyMs ?? 0,
        status: entry.status,
        // Truncated: a stack trace from a provider SDK can be enormous, and
        // what matters is the first line.
        error: entry.error ? entry.error.slice(0, 2000) : null,
      },
    });
  } catch (error) {
    console.error('[ai] could not write generation log', error);
  }
}
