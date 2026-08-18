import { env } from '@/lib/env';
import { FallbackAIProvider } from './fallback';
import { MockAIProvider } from './mock';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { GroqProvider } from './providers/groq';
import type { AIProvider } from './types';

export * from './types';
export { MockAIProvider } from './mock';
export { FallbackAIProvider } from './fallback';

/**
 * The env-var factory. `AI_PROVIDER` is the only thing that decides which
 * implementation the whole application talks to (R1).
 *
 * `AI_STT_PROVIDER` is separate on purpose: Anthropic has no audio input, so
 * the text provider and the speech provider can differ.
 */

let cached: AIProvider | null = null;
let cachedKey = '';

function build(name: string): AIProvider {
  switch (name) {
    case 'gemini':
      return new GeminiProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'groq':
      return new GroqProvider();
    case 'mock':
      return new MockAIProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${name}". Expected one of: mock, gemini, anthropic, groq.`,
      );
  }
}

/**
 * `AI_FALLBACK_PROVIDER` applies to every caller of `getAIProvider()` — Smart
 * List's text/photo parsing, swap suggestions, product rationale, and meal
 * plan generation all get the same "try the primary, fall back on failure"
 * behaviour with no call-site changes, since they only ever hold an
 * `AIProvider` and never know whether it's a single vendor or a pair.
 */
export function getAIProvider(): AIProvider {
  const key = `${env.providers.ai}::${env.ai.fallbackProvider}`;
  if (cached && cachedKey === key) return cached;

  const primary = build(env.providers.ai);
  cached =
    env.ai.fallbackProvider && env.ai.fallbackProvider !== env.providers.ai
      ? new FallbackAIProvider(primary, build(env.ai.fallbackProvider))
      : primary;
  cachedKey = key;
  return cached;
}

/** Speech-to-text may run on a different vendor than text generation. */
export function getSTTProvider(): AIProvider {
  if (env.providers.ai === 'mock') return getAIProvider();
  return build(env.ai.sttProvider);
}

/** Test seam — lets a test inject a MockAIProvider with fixtures. */
export function setAIProviderForTesting(provider: AIProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}
