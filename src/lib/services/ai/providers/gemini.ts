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
 * Gemini over plain REST — no vendor SDK.
 *
 * R11: `fetch` only, so this runs unchanged on Node, Edge and Cloudflare
 * Workers. R1: nothing Gemini-shaped escapes this file.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

function toBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/** Models occasionally wrap JSON in a ```json fence despite the mime type. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;

  private usage: AIUsage | null = null;

  constructor(
    private readonly apiKey: string = env.ai.geminiApiKey,
    model: string = env.ai.geminiModel,
  ) {
    this.model = model;
  }

  private async call(
    model: string,
    body: Record<string, unknown>,
  ): Promise<{ text: string; usage: AIUsage }> {
    if (!this.apiKey) {
      throw new AIUnavailableError('GEMINI_API_KEY is not set.');
    }
    const started = Date.now();

    const res = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as GeminiResponse;

    if (!res.ok) {
      throw new AIUnavailableError(
        `Gemini responded ${res.status}: ${json.error?.message ?? 'unknown error'}`,
      );
    }

    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    return {
      text,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T> {
    const { text, usage } = await this.call(this.model, {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens ?? 4096,
      },
    });
    this.usage = usage;

    let candidate: unknown;
    try {
      candidate = JSON.parse(stripFence(text));
    } catch {
      throw new AISchemaError('Gemini returned text that is not valid JSON.', text);
    }

    const parsed = opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new AISchemaError(parsed.error.message, text);
    }
    return parsed.data;
  }

  async transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    const hint = opts.languageHint ?? 'mr';
    const languageName = { mr: 'Marathi', hi: 'Hindi', en: 'English' }[hint];

    const { text, usage } = await this.call(this.model, {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `Transcribe this audio verbatim. It is most likely ${languageName}. ` +
                `Return only the transcript text, in the script the speaker used. No commentary.`,
            },
            { inlineData: { mimeType: opts.mimeType, data: toBase64(opts.audio) } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    });
    this.usage = usage;

    return { text: text.trim(), detectedLanguage: hint };
  }

  async extractFromImage<T>(opts: ExtractFromImageOptions<T>): Promise<T> {
    const { text, usage } = await this.call(this.model, {
      contents: [
        {
          role: 'user',
          parts: [
            { text: opts.prompt },
            { inlineData: { mimeType: opts.mimeType, data: toBase64(opts.image) } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    this.usage = usage;

    let candidate: unknown;
    try {
      candidate = JSON.parse(stripFence(text));
    } catch {
      throw new AISchemaError('Gemini vision returned text that is not valid JSON.', text);
    }

    const parsed = opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new AISchemaError(parsed.error.message, text);
    }
    return parsed.data;
  }

  lastUsage(): AIUsage | null {
    return this.usage;
  }
}
