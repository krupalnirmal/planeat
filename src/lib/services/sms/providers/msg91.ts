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
 * OTP goes through the SendOTP API (v5/otp), not the Flow API — MSG91_OTP_TEMPLATE_ID
 * here is the OTP Widget's own default template id (Applications > OTP > Widgets in
 * the MSG91 dashboard), which ships pre-approved on MSG91's own DLT entity. That's
 * what lets OTP go live before the client's own DLT/PE ID registration clears
 * (PART 13 item 3) — only a *branded* sender/template needs that. We still pass our
 * own `otp` value rather than letting MSG91 generate one, since OTP issuance and
 * verification stay local (src/lib/auth/otp.ts) — MSG91 is purely the SMS pipe here.
 *
 * sendTemplate (Flow API) is unused today but kept for whenever branded/DLT-backed
 * templates are ready — that path does need a DLT-registered template id + sender.
 */

const OTP_URL = 'https://control.msg91.com/api/v5/otp';
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

  async sendOtp(opts: SendOtpOptions): Promise<SmsResult> {
    if (!this.authKey) {
      throw new SmsProviderError('MSG91_AUTH_KEY is not set.');
    }
    if (!this.otpTemplateId) {
      throw new SmsProviderError(
        'MSG91_OTP_TEMPLATE_ID is not set — use the OTP Widget default template id from the MSG91 dashboard (Applications > OTP > Widgets).',
      );
    }

    const params = new URLSearchParams({
      template_id: this.otpTemplateId,
      mobile: normalise(opts.phone),
      otp: opts.code,
      otp_expiry: String(Math.max(1, Math.round(opts.ttlSeconds / 60))),
    });

    const res = await fetch(`${OTP_URL}?${params.toString()}`, {
      method: 'POST',
      headers: { authkey: this.authKey, 'content-type': 'application/json' },
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

  async sendText(opts: SendTextOptions): Promise<SmsResult> {
    void opts;
    // DLT rules forbid free-text transactional SMS in India: every message must
    // map to a registered template. Fail loudly instead of silently dropping it.
    throw new SmsProviderError(
      'MSG91 cannot send free-text SMS under Indian DLT rules. Use sendTemplate().',
    );
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<SmsResult> {
    if (!this.authKey) {
      throw new SmsProviderError('MSG91_AUTH_KEY is not set.');
    }

    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authkey: this.authKey },
      body: JSON.stringify({
        template_id: opts.templateKey,
        sender: this.senderId,
        short_url: '0',
        recipients: [{ mobiles: normalise(opts.phone), ...opts.variables }],
      }),
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
}

/** MSG91 wants 91XXXXXXXXXX with no + and no spaces. */
function normalise(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
