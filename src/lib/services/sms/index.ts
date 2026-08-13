import { env } from '@/lib/env';
import { MockSmsProvider } from './mock';
import { Msg91Provider } from './providers/msg91';
import { WhatsAppProvider } from './providers/whatsapp';
import type { SmsProvider } from './types';

export * from './types';
export { MockSmsProvider } from './mock';

let cached: SmsProvider | null = null;
let cachedKey = '';

function build(name: string): SmsProvider {
  switch (name) {
    case 'msg91':
      return new Msg91Provider();
    case 'whatsapp':
      return new WhatsAppProvider();
    case 'mock':
      return new MockSmsProvider();
    default:
      throw new Error(`Unknown SMS_PROVIDER "${name}". Expected one of: mock, msg91, whatsapp.`);
  }
}

export function getSmsProvider(): SmsProvider {
  if (cached && cachedKey === env.providers.sms) return cached;
  cached = build(env.providers.sms);
  cachedKey = env.providers.sms;
  return cached;
}

export function setSmsProviderForTesting(provider: SmsProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}

let cachedWhatsApp: SmsProvider | null = null;

/**
 * B16's primary notification channel, on its own switch — same reasoning as
 * `AI_STT_PROVIDER` (D-9): `SMS_PROVIDER` picks the transport for OTP, but a
 * production deployment sends OTP over MSG91 while notifications go over
 * WhatsApp at the same time, not one or the other. Under `SMS_PROVIDER=mock`
 * this returns the same mock instance as `getSmsProvider()`, so local
 * development and tests need no WhatsApp credentials at all.
 */
export function getWhatsAppProvider(): SmsProvider {
  if (env.providers.sms === 'mock') return getSmsProvider();
  if (!cachedWhatsApp) cachedWhatsApp = new WhatsAppProvider();
  return cachedWhatsApp;
}

export function setWhatsAppProviderForTesting(provider: SmsProvider | null): void {
  cachedWhatsApp = provider;
}

/** True while OTPs are the fixed development code rather than a random one. */
export function isMockSms(): boolean {
  return env.providers.sms === 'mock';
}
