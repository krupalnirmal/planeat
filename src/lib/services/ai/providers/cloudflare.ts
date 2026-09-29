import { env } from '@/lib/env';
import type {
  AIProvider,
  AIUsage,
  ExtractFromImageOptions,
  GenerateJSONOptions,
  TranscribeAudioOptions,
  TranscribeAudioResult,
} from '../types';
import { AIUnavailableError } from '../types';

/**
 * Cloudflare Workers AI over plain REST — no vendor SDK (R1, R11).
 *
 * Speech-to-text only, same STT-only role Groq plays: whisper-large-v3-turbo
 * is noticeably more accurate on Marathi/Hindi than Gemini's STT for the
 * Smart List voice flow (M4) (owner's own comparison, session 2026-09-29),
 * so this exists purely to swap in as `AI_STT_PROVIDER=cloudflare`. There is
 * no chat/vision model wired up here — `generateJSON`/`extractFromImage`
 * fail loudly rather than silently degrading, matching `GroqProvider`.
 */

const WHISPER_TURBO_MODEL = env.ai.cloudflareSttModel;

interface CloudflareRunResponse {
  result?: { text?: string };
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

export class CloudflareProvider implements AIProvider {
  readonly name = 'cloudflare';
  readonly model: string;

  private usage: AIUsage | null = null;

  constructor(
    private readonly accountId: string = env.ai.cloudflareAccountId,
    private readonly apiToken: string = env.ai.cloudflareApiToken,
    model: string = WHISPER_TURBO_MODEL,
  ) {
    this.model = model;
  }

  async generateJSON<T>(_opts: GenerateJSONOptions<T>): Promise<T> {
    void _opts;
    throw new AIUnavailableError(
      'CloudflareProvider has no chat model wired up. Use AI_PROVIDER=gemini/anthropic/groq for text generation.',
    );
  }

  async transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    if (!this.accountId || !this.apiToken) {
      throw new AIUnavailableError('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set.');
    }
    const started = Date.now();

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': opts.mimeType,
      },
      body: new Uint8Array(opts.audio),
    });

    const json = (await res.json()) as CloudflareRunResponse;

    if (!res.ok || !json.success) {
      throw new AIUnavailableError(
        `Cloudflare Workers AI responded ${res.status}: ${json.errors?.[0]?.message ?? 'unknown error'}`,
      );
    }

    this.usage = { inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started };

    return {
      text: (json.result?.text ?? '').trim(),
      // Whisper's run response doesn't report a detected-language code —
      // fall back to whatever hint the caller gave, same convention
      // `GroqProvider` uses when a vendor doesn't report one back.
      detectedLanguage: opts.languageHint ?? 'mr',
    };
  }

  async extractFromImage<T>(_opts: ExtractFromImageOptions<T>): Promise<T> {
    void _opts;
    throw new AIUnavailableError(
      'CloudflareProvider has no vision model wired up. Use AI_PROVIDER=gemini or anthropic for photo lists.',
    );
  }

  lastUsage(): AIUsage | null {
    return this.usage;
  }
}
