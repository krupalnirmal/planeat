import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MockAIProvider } from '@/lib/services/ai';
import { MockPaymentProvider } from '@/lib/services/payment';
import { MockPushProvider } from '@/lib/services/push';
import { MockQueueProvider } from '@/lib/services/queue';
import { MockSmsProvider } from '@/lib/services/sms';
import { MockStorageProvider } from '@/lib/services/storage';

/**
 * R2 — every port ships a working mock, and the mock is what the whole suite
 * runs against. These tests are the proof that the six ports are usable before
 * a single real vendor key exists.
 */

describe('AI port (mock)', () => {
  const schema = z.object({
    plan: z.array(
      z.object({
        dayOfWeek: z.enum(['MONDAY', 'TUESDAY']),
        productId: z.string(),
      }),
    ),
    flaggedForReview: z.boolean(),
  });

  it('produces schema-valid JSON', async () => {
    const ai = new MockAIProvider();
    const result = await ai.generateJSON({ system: 's', user: 'u', schema });
    expect(schema.safeParse(result).success).toBe(true);
  });

  it('is deterministic for the same prompt', async () => {
    const ai = new MockAIProvider();
    const a = await ai.generateJSON({ system: 's', user: 'u', schema });
    const b = await ai.generateJSON({ system: 's', user: 'u', schema });
    expect(a).toEqual(b);
  });

  it('lets a test pin an exact answer with a fixture', async () => {
    const ai = new MockAIProvider();
    const fixed = { plan: [{ dayOfWeek: 'MONDAY' as const, productId: 'prd_1' }], flaggedForReview: false };
    ai.setFixture('MEAL_PLAN', fixed);

    const result = await ai.generateJSON({ system: 'MEAL_PLAN', user: 'u', schema });
    expect(result).toEqual(fixed);
  });

  it('returns a Marathi transcript for the Smart List demo', async () => {
    const ai = new MockAIProvider();
    const result = await ai.transcribeAudio({
      audio: Buffer.from('audio'),
      mimeType: 'audio/webm',
      languageHint: 'mr',
    });
    expect(result.detectedLanguage).toBe('mr');
    expect(result.text).toContain('कांदा');
  });

  it('reports token usage for ai_generation_logs', async () => {
    const ai = new MockAIProvider();
    await ai.generateJSON({ system: 's', user: 'u', schema });
    expect(ai.lastUsage()?.inputTokens).toBeGreaterThan(0);
  });
});

describe('SMS port (mock)', () => {
  it('records the OTP so a developer can read it without a real SMS', async () => {
    const sms = new MockSmsProvider();
    const result = await sms.sendOtp({ phone: '9999900002', code: '123456', ttlSeconds: 300 });

    expect(result.accepted).toBe(true);
    expect(sms.lastMessage()?.body).toContain('123456');
  });
});

describe('Storage port (mock)', () => {
  it('returns a renderable url and can delete twice harmlessly', async () => {
    const storage = new MockStorageProvider();
    const file = await storage.upload({
      data: Buffer.from('image-bytes'),
      mimeType: 'image/png',
      folder: 'products',
      fileName: 'kanda',
    });

    expect(file.url).toContain('/api/mock-storage/products/kanda');
    expect(storage.count()).toBe(1);

    await storage.delete(file.key);
    await storage.delete(file.key);
    expect(storage.count()).toBe(0);
  });
});

describe('Payment port (mock)', () => {
  /** P2 — nothing moves until a signature-verified webhook arrives. */
  it('rejects a tampered webhook signature', async () => {
    const payments = new MockPaymentProvider();
    const order = await payments.createOrder({
      amountPaise: 50000n,
      currency: 'INR',
      referenceId: 'wtx_1',
      userId: 'usr_1',
    });

    const { rawBody } = await payments.simulateCapture(order.gatewayOrderId);
    const event = await payments.verifyWebhook({ rawBody, signature: 'deadbeef' });

    expect(event).toBeNull();
  });

  it('verifies a correctly signed webhook and reports the same payment id every replay', async () => {
    const payments = new MockPaymentProvider();
    const order = await payments.createOrder({
      amountPaise: 50000n,
      currency: 'INR',
      referenceId: 'wtx_1',
      userId: 'usr_1',
    });

    const { rawBody, signature } = await payments.simulateCapture(order.gatewayOrderId);

    // PART 12: replaying the same payload ten times must credit exactly once.
    // The provider is the first half of that guarantee — a stable
    // gatewayPaymentId the route can be idempotent on.
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const event = await payments.verifyWebhook({ rawBody, signature });
      expect(event?.type).toBe('payment.captured');
      ids.add(event!.gatewayPaymentId);
    }
    expect(ids.size).toBe(1);
  });

  it('refuses a zero-value order', async () => {
    const payments = new MockPaymentProvider();
    await expect(
      payments.createOrder({ amountPaise: 0n, currency: 'INR', referenceId: 'x', userId: 'u' }),
    ).rejects.toThrow();
  });
});

describe('Push port (mock)', () => {
  it('separates accepted tokens from permanently invalid ones', async () => {
    const push = new MockPushProvider();
    const result = await push.send(
      [{ token: 'good_1' }, { token: 'invalid_2' }],
      { title: 'उद्याची डिलिव्हरी', body: 'कांदा, टोमॅटो' },
    );

    expect(result.accepted).toBe(1);
    expect(result.invalidTokens).toEqual(['invalid_2']);
  });
});

describe('Queue port (mock)', () => {
  /** R5 — running any job twice must be harmless. */
  it('runs a job inline and drops a duplicate dedupe key', async () => {
    const queue = new MockQueueProvider();
    let runs = 0;
    queue.register<{ date: string }>('order.generate-daily', async () => {
      runs += 1;
    });

    const first = await queue.enqueue({
      job: 'order.generate-daily',
      payload: { date: '2026-08-12' },
      dedupeKey: 'sub_1:2026-08-12',
    });
    const second = await queue.enqueue({
      job: 'order.generate-daily',
      payload: { date: '2026-08-12' },
      dedupeKey: 'sub_1:2026-08-12',
    });

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(runs).toBe(1);
  });
});
