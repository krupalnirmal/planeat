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
 * Groq over plain REST — no vendor SDK (R1, R11).
 *
 * Groq's value here is Whisper: fast, cheap Marathi/Hindi speech-to-text for
 * the Smart List (M4). Text generation is available too, but vision is not,
 * so `extractFromImage` fails loudly rather than silently degrading.
 */

const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface GroqTranscriptionResponse {
  text?: string;
  language?: string;
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

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  readonly model: string;

  private usage: AIUsage | null = null;

  constructor(
    private readonly apiKey: string = env.ai.groqApiKey,
    model: string = env.ai.groqModel,
  ) {
    this.model = model;
  }

  async generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T> {
    if (!this.apiKey) {
      throw new AIUnavailableError('GROQ_API_KEY is not set.');
    }
    const started = Date.now();

    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    });

    const json = (await res.json()) as GroqChatResponse;

    if (!res.ok) {
      throw new AIUnavailableError(
        `Groq responded ${res.status}: ${json.error?.message ?? 'unknown error'}`,
      );
    }

    const text = json.choices?.[0]?.message?.content ?? '';
    this.usage = {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
    };

    let candidate: unknown;
    try {
      candidate = JSON.parse(stripFence(text));
    } catch {
      throw new AISchemaError('Groq returned text that is not valid JSON.', text);
    }

    const parsed = opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new AISchemaError(parsed.error.message, text);
    }
    return parsed.data;
  }

  async transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    if (!this.apiKey) {
      throw new AIUnavailableError('GROQ_API_KEY is not set.');
    }
    const started = Date.now();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(opts.audio)], { type: opts.mimeType }), 'audio');
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'verbose_json');
    if (opts.languageHint) form.append('language', opts.languageHint);

    const res = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    const json = (await res.json()) as GroqTranscriptionResponse;

    if (!res.ok) {
      throw new AIUnavailableError(
        `Groq transcription responded ${res.status}: ${json.error?.message ?? 'unknown error'}`,
      );
    }

    this.usage = { inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started };

    return {
      text: (json.text ?? '').trim(),
      detectedLanguage: json.language ?? opts.languageHint ?? 'mr',
    };
  }

  async extractFromImage<T>(_opts: ExtractFromImageOptions<T>): Promise<T> {
    void _opts;
    throw new AIUnavailableError(
      'GroqProvider has no vision model wired up. Use AI_PROVIDER=gemini or anthropic for photo lists.',
    );
  }

  lastUsage(): AIUsage | null {
    return this.usage;
  }
}
