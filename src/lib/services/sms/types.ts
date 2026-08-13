/**
 * The SMS port.
 *
 * B16 — SMS is used for OTP only. Everything else goes over WhatsApp or push.
 * India requires DLT registration before a real transactional SMS can be sent,
 * which is why `MockSmsProvider` is the default and unblocks all development.
 */

export interface SendOtpOptions {
  phone: string;
  code: string;
  ttlSeconds: number;
  locale?: 'mr' | 'hi' | 'en';
}

export interface SendTextOptions {
  phone: string;
  body: string;
}

/** WhatsApp sends approved templates, not free text. */
export interface SendTemplateOptions {
  phone: string;
  templateKey: string;
  variables: Record<string, string>;
  locale?: 'mr' | 'hi' | 'en';
}

export interface SmsResult {
  providerMessageId: string;
  accepted: boolean;
  /** Present when the provider rejected the message. */
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  readonly supportsTemplates: boolean;

  sendOtp(opts: SendOtpOptions): Promise<SmsResult>;
  sendText(opts: SendTextOptions): Promise<SmsResult>;
  sendTemplate(opts: SendTemplateOptions): Promise<SmsResult>;
}

export class SmsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsProviderError';
  }
}
