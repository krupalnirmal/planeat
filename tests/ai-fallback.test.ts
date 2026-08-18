import { describe, expect, it } from 'vitest';
import { FallbackAIProvider } from '@/lib/services/ai/fallback';
import type { AIProvider, AIUsage } from '@/lib/services/ai/types';

/**
 * `AI_FALLBACK_PROVIDER` — Gemini first, Groq only when Gemini fails
 * (client request, session 2026-08-18). A stub provider per test keeps this
 * independent of any real vendor SDK or network call.
 */

function stubProvider(opts: { name: string; fail?: boolean }): AIProvider {
  const usage: AIUsage = { inputTokens: 1, outputTokens: 1, latencyMs: 1 };
  return {
    name: opts.name,
    model: `${opts.name}-model`,
    async generateJSON() {
      if (opts.fail) throw new Error(`${opts.name} failed`);
      return { from: opts.name } as never;
    },
    async transcribeAudio() {
      if (opts.fail) throw new Error(`${opts.name} failed`);
      return { text: opts.name, detectedLanguage: 'en' };
    },
    async extractFromImage() {
      if (opts.fail) throw new Error(`${opts.name} failed`);
      return { from: opts.name } as never;
    },
    lastUsage: () => usage,
  };
}

describe('FallbackAIProvider', () => {
  it('uses the primary when it succeeds, and reports its identity', async () => {
    const primary = stubProvider({ name: 'gemini' });
    const secondary = stubProvider({ name: 'groq' });
    const provider = new FallbackAIProvider(primary, secondary);

    const result = await provider.generateJSON({ system: '', user: '', schema: {} as never });
    expect(result).toEqual({ from: 'gemini' });
    expect(provider.name).toBe('gemini');
  });

  it('falls back to the secondary when the primary throws', async () => {
    const primary = stubProvider({ name: 'gemini', fail: true });
    const secondary = stubProvider({ name: 'groq' });
    const provider = new FallbackAIProvider(primary, secondary);

    const result = await provider.generateJSON({ system: '', user: '', schema: {} as never });
    expect(result).toEqual({ from: 'groq' });
    expect(provider.name).toBe('groq');
  });

  it('propagates the secondary error when both fail', async () => {
    const primary = stubProvider({ name: 'gemini', fail: true });
    const secondary = stubProvider({ name: 'groq', fail: true });
    const provider = new FallbackAIProvider(primary, secondary);

    await expect(
      provider.generateJSON({ system: '', user: '', schema: {} as never }),
    ).rejects.toThrow('groq failed');
  });

  it('falls back for transcription and image extraction too', async () => {
    const primary = stubProvider({ name: 'gemini', fail: true });
    const secondary = stubProvider({ name: 'groq' });
    const provider = new FallbackAIProvider(primary, secondary);

    const transcript = await provider.transcribeAudio({ audio: Buffer.from(''), mimeType: 'audio/webm' });
    expect(transcript.text).toBe('groq');

    const extracted = await provider.extractFromImage({
      image: Buffer.from(''),
      mimeType: 'image/jpeg',
      prompt: '',
      schema: {} as never,
    });
    expect(extracted).toEqual({ from: 'groq' });
  });
});
