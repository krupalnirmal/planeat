import { env } from '@/lib/env';
import type {
  SendOtpOptions,
  SendTemplateOptions,
  SendTextOptions,
  SmsProvider,
  SmsResult,
} from '../types';
import { SmsProviderError } from '../types';

/**
 * MSG91 over plain REST — no vendor SDK (R1, R11).
 *
 * Production sending needs a DLT-registered template id; until the client's
 * DLT registration clears (PART 13 item 3), keep SMS_PROVIDER=mock.
 */

const FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

interface Msg91Response {
  type?: string;
  message?: string;
  request_id?: string;
}

export class Msg91Provider implements SmsProvider {
  readonly name = 'msg91';
  readonly supportsTemplates = true;

  constructor(
    private readonly authKey: string = env.sms.msg91AuthKey,
    private readonly senderId: string = env.sms.msg91SenderId,
    private readonly otpTemplateId: string = env.sms.msg91OtpTemplateId,
  ) {}

  private async post(body: Record<string, unknown>): Promise<SmsResult> {
    if (!this.authKey) {
      throw new SmsProviderError('MSG91_AUTH_KEY is not set.');
    }

    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authkey: this.authKey },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as Msg91Response;

    if (!res.ok || json.type === 'error') {
      return {
        providerMessageId: '',
        accepted: false,
        error: json.message ?? `MSG91 responded ${res.status}`,
      };
    }

    return { providerMessageId: json.request_id ?? '', accepted: true };
  }

  async sendOtp(opts: SendOtpOptions): Promise<SmsResult> {
    if (!this.otpTemplateId) {
      throw new SmsProviderError('MSG91_OTP_TEMPLATE_ID is not set (DLT registration required).');
    }
    return this.post({
      template_id: this.otpTemplateId,
      sender: this.senderId,
      short_url: '0',
      recipients: [{ mobiles: normalise(opts.phone), OTP: opts.code }],
    });
  }

  async sendText(opts: SendTextOptions): Promise<SmsResult> {
    void opts;
    // DLT rules forbid free-text transactional SMS in India: every message must
    // map to a registered template. Fail loudly instead of silently dropping it.
    throw new SmsProviderError(
      'MSG91 cannot send free-text SMS under Indian DLT rules. Use sendTemplate().',
    );
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<SmsResult> {
    return this.post({
      template_id: opts.templateKey,
      sender: this.senderId,
      short_url: '0',
      recipients: [{ mobiles: normalise(opts.phone), ...opts.variables }],
    });
  }
}

/** MSG91 wants 91XXXXXXXXXX with no + and no spaces. */
function normalise(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
