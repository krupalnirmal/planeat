import type {
  AIProvider,
  AIUsage,
  ExtractFromImageOptions,
  GenerateJSONOptions,
  TranscribeAudioOptions,
  TranscribeAudioResult,
} from './types';
import { AISchemaError } from './types';

/**
 * R2 — the mock ships first and the whole app runs end to end against it.
 *
 * Deterministic by construction: the same prompt always produces the same
 * output, so tests are stable and CI is free. It does NOT call a model; it
 * synthesises a value that satisfies the caller's Zod schema by walking the
 * schema definition, seeded by a hash of the prompt.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tiny seeded PRNG so mock output is reproducible across runs. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface ZodCheck {
  _zod?: { def?: { check?: string; length?: number; minimum?: number; maximum?: number } };
}

interface ZodInternals {
  def?: {
    type?: string;
    shape?: Record<string, unknown> | (() => Record<string, unknown>);
    element?: unknown;
    innerType?: unknown;
    options?: unknown[];
    entries?: Record<string, unknown>;
    values?: unknown[];
    value?: unknown;
    checks?: ZodCheck[];
  };
}

function internals(schema: unknown): ZodInternals['def'] | undefined {
  return (schema as ZodInternals)?.def;
}

/**
 * How many elements an array schema actually wants.
 *
 * Without this the mock produces one or two items for every array, and any
 * schema with a fixed length — AI-1 needs exactly 7 days and exactly 2 meals a
 * day — fails validation before a test can reach the code it is testing.
 */
function arrayLength(checks: ZodCheck[] | undefined, fallback: number): number {
  if (!checks) return fallback;

  let min: number | null = null;
  let max: number | null = null;

  for (const check of checks) {
    const def = check?._zod?.def;
    if (!def) continue;
    if (def.check === 'length_equals' && typeof def.length === 'number') return def.length;
    if (def.check === 'min_length' && typeof def.minimum === 'number') min = def.minimum;
    if (def.check === 'max_length' && typeof def.maximum === 'number') max = def.maximum;
  }

  if (min !== null) return max !== null ? Math.min(min, max) : min;
  if (max !== null) return Math.min(fallback, max);
  return fallback;
}

/**
 * Walks a Zod v4 schema and produces a value that satisfies it. Covers the
 * shapes our prompts actually use: object, array, string, number, boolean,
 * enum, literal, union, optional, nullable, default.
 */
function synthesise(schema: unknown, next: () => number, path: string): unknown {
  const def = internals(schema);
  const type = def?.type;

  switch (type) {
    case 'object': {
      const rawShape = def?.shape;
      const shape = typeof rawShape === 'function' ? rawShape() : (rawShape ?? {});
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(shape)) {
        out[key] = synthesise(child, next, `${path}.${key}`);
      }
      return out;
    }
    case 'array': {
      const element = def?.element;
      const count = arrayLength(def?.checks, 1 + Math.floor(next() * 2));
      return Array.from({ length: count }, (_, i) =>
        synthesise(element, next, `${path}[${i}]`),
      );
    }
    case 'string':
      return `mock-${path.replace(/^\./, '') || 'value'}-${Math.floor(next() * 1000)}`;
    case 'number':
    case 'int':
      return Math.floor(next() * 100);
    case 'bigint':
      return BigInt(Math.floor(next() * 100));
    case 'boolean':
      return false;
    case 'date':
      return new Date(0);
    case 'null':
      return null;
    case 'enum': {
      const entries = def?.entries;
      const values = entries ? Object.values(entries) : (def?.values ?? []);
      return values.length > 0 ? values[Math.floor(next() * values.length)] : null;
    }
    case 'literal': {
      const values = def?.values;
      if (Array.isArray(values) && values.length > 0) return values[0];
      return def?.value ?? null;
    }
    case 'union': {
      const options = def?.options ?? [];
      return options.length > 0 ? synthesise(options[0], next, path) : null;
    }
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return synthesise(def?.innerType, next, path);
    default:
      return null;
  }
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';

  private usage: AIUsage | null = null;

  /**
   * Fixtures let a test or a demo pin an exact answer for a given prompt
   * fragment, instead of relying on the synthesiser.
   *   provider.setFixture('MEAL_PLAN', myPlanObject)
   */
  private fixtures = new Map<string, unknown>();

  setFixture(promptContains: string, value: unknown): void {
    this.fixtures.set(promptContains, value);
  }

  clearFixtures(): void {
    this.fixtures.clear();
  }

  async generateJSON<T>(opts: GenerateJSONOptions<T>): Promise<T> {
    const started = Date.now();
    const prompt = `${opts.system}\n${opts.user}`;

    let candidate: unknown;
    const fixture = [...this.fixtures.entries()].find(([needle]) => prompt.includes(needle));
    if (fixture) {
      candidate = fixture[1];
    } else {
      candidate = synthesise(opts.schema, rng(hash(prompt)), '');
    }

    this.usage = {
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(JSON.stringify(candidate ?? {}).length / 4),
      latencyMs: Date.now() - started,
    };

    const parsed = opts.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new AISchemaError(
        `MockAIProvider could not synthesise a value for this schema: ${parsed.error.message}`,
        JSON.stringify(candidate),
      );
    }
    return parsed.data;
  }

  async transcribeAudio(opts: TranscribeAudioOptions): Promise<TranscribeAudioResult> {
    const started = Date.now();
    const seeded = rng(hash(`${opts.mimeType}:${opts.audio.byteLength}`));

    // Deterministic Marathi grocery list — this is what the Smart List demo
    // (M4) needs to look real without a network call.
    const samples: Record<string, string> = {
      mr: 'दोन किलो कांदा, एक किलो टोमॅटो, अर्धा किलो बटाटा आणि एक जुडी कोथिंबीर',
      hi: 'दो किलो प्याज, एक किलो टमाटर, आधा किलो आलू और एक गड्डी धनिया',
      en: 'two kilos onion, one kilo tomato, half kilo potato and one bunch coriander',
    };
    const lang = opts.languageHint ?? 'mr';

    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
    };
    void seeded;

    return { text: samples[lang] ?? samples.mr, detectedLanguage: lang };
  }

  async extractFromImage<T>(opts: ExtractFromImageOptions<T>): Promise<T> {
    return this.generateJSON({
      system: 'mock-vision',
      user: `${opts.prompt}:${opts.mimeType}:${opts.image.byteLength}`,
      schema: opts.schema,
    });
  }

  lastUsage(): AIUsage | null {
    return this.usage;
  }
}
