import { env } from '@/lib/env';
import type {
  SendOtpOptions,
  SendTemplateOptions,
  SendTextOptions,
  SmsProvider,
  SmsResult,
} from './types';

/**
 * R2 — deterministic mock, written before any real provider.
 *
 * Every message is kept in memory so tests can assert on what was "sent", and
 * logged to the server console so a developer can read the OTP without a real
 * SMS. `DEV_FIXED_OTP` (default 123456) is what the auth flow issues while
 * SMS_PROVIDER=mock.
 */

export interface SentMessage {
  kind: 'otp' | 'text' | 'template';
  phone: string;
  body: string;
  templateKey?: string;
  variables?: Record<string, string>;
  at: Date;
}

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  readonly supportsTemplates = true;

  private sent: SentMessage[] = [];
  private counter = 0;

  private record(message: SentMessage): SmsResult {
    this.sent.push(message);
    this.counter += 1;
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[MockSms] → ${message.phone}: ${message.body}`);
    }
    return { providerMessageId: `mock_sms_${this.counter}`, accepted: true };
  }

  async sendOtp(opts: SendOtpOptions): Promise<SmsResult> {
    return this.record({
      kind: 'otp',
      phone: opts.phone,
      body: `Get Fresh OTP: ${opts.code} (valid ${Math.round(opts.ttlSeconds / 60)} min)`,
      at: new Date(),
    });
  }

  async sendText(opts: SendTextOptions): Promise<SmsResult> {
    return this.record({ kind: 'text', phone: opts.phone, body: opts.body, at: new Date() });
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<SmsResult> {
    return this.record({
      kind: 'template',
      phone: opts.phone,
      body: `[${opts.templateKey}] ${JSON.stringify(opts.variables)}`,
      templateKey: opts.templateKey,
      variables: opts.variables,
      at: new Date(),
    });
  }

  /** Test helpers. */
  outbox(): readonly SentMessage[] {
    return this.sent;
  }

  lastMessage(): SentMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  clear(): void {
    this.sent = [];
    this.counter = 0;
  }

  /** The OTP the auth flow should issue while this provider is active. */
  static fixedOtp(): string {
    return env.sms.devFixedOtp;
  }
}
