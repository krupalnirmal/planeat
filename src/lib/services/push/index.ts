import { env } from '@/lib/env';
import { MockPushProvider } from './mock';
import { FcmProvider } from './providers/fcm';
import type { PushProvider } from './types';

export * from './types';
export { MockPushProvider } from './mock';

let cached: PushProvider | null = null;
let cachedKey = '';

function build(name: string): PushProvider {
  switch (name) {
    case 'fcm':
      return new FcmProvider();
    case 'mock':
      return new MockPushProvider();
    default:
      throw new Error(`Unknown PUSH_PROVIDER "${name}". Expected one of: mock, fcm.`);
  }
}

export function getPushProvider(): PushProvider {
  if (cached && cachedKey === env.providers.push) return cached;
  cached = build(env.providers.push);
  cachedKey = env.providers.push;
  return cached;
}

export function setPushProviderForTesting(provider: PushProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}
