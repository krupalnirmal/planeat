import { env } from '@/lib/env';
import type {
  AIProvider,
  AIUsage,
  ExtractFromImageOptions,
  GenerateJSONOptions,
  TranscribeAudioOptions,
  TranscribeAudioResult,
} from '../types';
import { AISchemaError, AIUnavailableError } from '../types';

/**
 * Anthropic over plain REST — no vendor SDK (R1, R11).
 *
 * This is the paid-tier destination once the free Gemini quota stops being
 * enough. Claude has no audio input, so `transcribeAudio` deliberately fails
 * loudly: STT stays on `AI_STT_PROVIDER` (Gemini or Groq).
 */

const BASE_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private usage: AIUsage | null = null;

  constructor(
    private readonly apiKey: string = env.ai.anthropicApiKey,
    model: string = env.ai.anthropicModel,
  ) {
    this.model = model;
  }

  private async call(
    system: string,
    content: unknown[],
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<{ text: string; usage: AIUsage }> {
    if (!this.apiKey) {
      throw new AIUnavailableError('ANTHROPIC_API_KEY is not set.');
    }
    const started = Date.now();

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        system,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
        messages: [{ role: 'user', content }],
      }),
    });

    const json = (await res.json()) as AnthropicResponse;

    if (!res.ok) {
      throw new AIUnavailableError(
        `Anthropic responded ${res.status}: ${json.error?.message ?? 'unknown error'}`,
      );
    }

    const text = (json.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    return {
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  private parse<T>(text: string, schema: GenerateJSONOptions<T>['schema']): T {
    let candidate: unknown;
    try {
      candidate = JSON.parse(stripFence(text));
    } catch {
      throw new AISchemaError('Anthropic returned text that is not valid JSON.', text);
    }
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new AISchemaError(parsed.error.message, text);
    }
    return parsed.data;
  }

  async generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T> {
    const { text, usage } = await this.call(
      `${opts.system}\n\nRespond with a single JSON object and nothing else.`,
      [{ type: 'text', text: opts.user }],
      { maxTokens: opts.maxTokens, temperature: opts.temperature },
    );
    this.usage = usage;
    return this.parse(text, opts.schema);
  }

  async transcribeAudio(_opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    void _opts;
    throw new AIUnavailableError(
      'AnthropicProvider does not accept audio. Point AI_STT_PROVIDER at gemini or groq.',
    );
  }

  async extractFromImage<T>(opts: ExtractFromImageOptions<T>): Promise<T> {
    const { text, usage } = await this.call(
      'You extract structured data from images. Respond with a single JSON object and nothing else.',
      [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: opts.mimeType,
            data: opts.image.toString('base64'),
          },
        },
        { type: 'text', text: opts.prompt },
      ],
      { temperature: 0 },
    );
    this.usage = usage;
    return this.parse(text, opts.schema);
  }

  lastUsage(): AIUsage | null {
    return this.usage;
  }
}
