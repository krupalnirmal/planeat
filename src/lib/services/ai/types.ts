import type { ZodType } from 'zod';

/**
 * PART 6.2 — the AI port.
 *
 * R1: application code must never import a vendor SDK. Everything AI-shaped
 * goes through this interface, so moving Gemini free → Anthropic paid is an
 * `.env` change and nothing else.
 */

export type LanguageHint = 'mr' | 'hi' | 'en';

export interface GenerateJSONOptions<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  /** Low for structured extraction (PART 6.3 rule 4). */
  temperature?: number;
}

export interface TranscribeAudioOptions {
  audio: Buffer;
  mimeType: string;
  languageHint?: LanguageHint;
}

export interface TranscribeAudioResult {
  text: string;
  detectedLanguage: string;
}

export interface ExtractFromImageOptions<T> {
  image: Buffer;
  mimeType: string;
  prompt: string;
  schema: ZodType<T>;
}

/** Reported back to `ai_generation_logs` (R6). */
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T>;
  transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult>;
  extractFromImage<T>(opts: ExtractFromImageOptions<T>): Promise<T>;

  /** Usage from the most recent call on this instance, for logging. */
  lastUsage(): AIUsage | null;
}

/** Thrown when the model returns something the Zod schema rejects (R6). */
export class AISchemaError extends Error {
  constructor(
    message: string,
    readonly rawOutput: string,
  ) {
    super(message);
    this.name = 'AISchemaError';
  }
}

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}
