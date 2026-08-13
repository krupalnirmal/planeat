import { env } from '@/lib/env';
import { MockAIProvider } from './mock';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { GroqProvider } from './providers/groq';
import type { AIProvider } from './types';

export * from './types';
export { MockAIProvider } from './mock';

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

export function getAIProvider(): AIProvider {
  if (cached && cachedKey === env.providers.ai) return cached;
  cached = build(env.providers.ai);
  cachedKey = env.providers.ai;
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
