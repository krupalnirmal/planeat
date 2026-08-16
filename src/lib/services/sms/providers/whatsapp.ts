import type {
  SendOtpOptions,
  SendTemplateOptions,
  SendTextOptions,
  SmsProvider,
  SmsResult,
} from '../types';
import { SmsProviderError } from '../types';

/**
 * Meta WhatsApp Cloud API over plain REST — no vendor SDK (R1, R11).
 *
 * B16 makes WhatsApp the primary notification channel; it also serves as the
 * OTP fallback offered 30 s after the SMS (M1). Templates must be approved by
 * Meta first — PART 13 item 2, started in Phase 0 because approval takes days.
 */

const GRAPH_VERSION = 'v21.0';

interface WhatsAppResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

const LOCALE_TO_WA: Record<string, string> = {
  mr: 'mr_IN',
  hi: 'hi_IN',
  en: 'en',
};

export class WhatsAppProvider implements SmsProvider {
  readonly name = 'whatsapp';
  readonly supportsTemplates = true;

  constructor(
    private readonly accessToken: string = process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    private readonly phoneNumberId: string = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    private readonly otpTemplateName: string = process.env.WHATSAPP_OTP_TEMPLATE ?? 'getfresh_otp',
  ) {}

  private async post(payload: Record<string, unknown>): Promise<SmsResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new SmsProviderError(
        'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set.',
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      },
    );

    const json = (await res.json()) as WhatsAppResponse;

    if (!res.ok) {
      return {
        providerMessageId: '',
        accepted: false,
        error: json.error?.message ?? `WhatsApp responded ${res.status}`,
      };
    }

    return { providerMessageId: json.messages?.[0]?.id ?? '', accepted: true };
  }

  async sendOtp(opts: SendOtpOptions): Promise<SmsResult> {
    return this.post({
      to: normalise(opts.phone),
      type: 'template',
      template: {
        name: this.otpTemplateName,
        language: { code: LOCALE_TO_WA[opts.locale ?? 'mr'] ?? 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: opts.code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: opts.code }],
          },
        ],
      },
    });
  }

  /** Only valid inside a 24-hour customer service window. */
  async sendText(opts: SendTextOptions): Promise<SmsResult> {
    return this.post({
      to: normalise(opts.phone),
      type: 'text',
      text: { body: opts.body, preview_url: false },
    });
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<SmsResult> {
    const parameters = Object.values(opts.variables).map((text) => ({ type: 'text', text }));
    return this.post({
      to: normalise(opts.phone),
      type: 'template',
      template: {
        name: opts.templateKey,
        language: { code: LOCALE_TO_WA[opts.locale ?? 'mr'] ?? 'en' },
        components: parameters.length > 0 ? [{ type: 'body', parameters }] : [],
      },
    });
  }
}

function normalise(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
