import type {
  AIProvider,
  AIUsage,
  ExtractFromImageOptions,
  GenerateJSONOptions,
  TranscribeAudioOptions,
  TranscribeAudioResult,
} from './types';

/**
 * Tries `primary` first; on any failure (network, rate limit, an
 * unavailable free tier, a schema the model couldn't satisfy) retries the
 * SAME call once against `secondary` before giving up.
 *
 * This sits below the per-feature retry loops already in `generate.ts` /
 * `smart-list/pipeline.ts` (which retry the same provider with validation
 * errors fed back) — from their point of view this is just "the provider",
 * and a fallback-then-fail still surfaces as one clean error to log and
 * retry against, not two.
 *
 * `name`/`model`/`lastUsage()` reflect whichever provider actually answered
 * the most recent call, so `logAiCall` audit rows stay accurate about which
 * vendor a plan or transcript actually came from.
 */
export class FallbackAIProvider implements AIProvider {
  private active: AIProvider;

  constructor(
    private readonly primary: AIProvider,
    private readonly secondary: AIProvider,
  ) {
    this.active = primary;
  }

  get name(): string {
    return this.active.name;
  }

  get model(): string {
    return this.active.model;
  }

  async generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T> {
    return this.run((provider) => provider.generateJSON(opts));
  }

  async transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    return this.run((provider) => provider.transcribeAudio(opts));
  }

  async extractFromImage<T>(opts: ExtractFromImageOptions<T>): Promise<T> {
    return this.run((provider) => provider.extractFromImage(opts));
  }

  lastUsage(): AIUsage | null {
    return this.active.lastUsage();
  }

  private async run<T>(call: (provider: AIProvider) => Promise<T>): Promise<T> {
    try {
      const result = await call(this.primary);
      this.active = this.primary;
      return result;
    } catch {
      this.active = this.secondary;
      return call(this.secondary);
    }
  }
}
