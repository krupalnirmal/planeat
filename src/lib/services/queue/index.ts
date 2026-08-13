import { env } from '@/lib/env';
import { MockQueueProvider } from './mock';
import { QStashProvider } from './providers/qstash';
import type { QueueProvider } from './types';

export * from './types';
export { MockQueueProvider } from './mock';

let cached: QueueProvider | null = null;
let cachedKey = '';

function build(name: string): QueueProvider {
  switch (name) {
    case 'qstash':
      return new QStashProvider();
    case 'mock':
      return new MockQueueProvider();
    default:
      throw new Error(`Unknown QUEUE_PROVIDER "${name}". Expected one of: mock, qstash.`);
  }
}

export function getQueueProvider(): QueueProvider {
  if (cached && cachedKey === env.providers.queue) return cached;
  cached = build(env.providers.queue);
  cachedKey = env.providers.queue;
  return cached;
}

export function setQueueProviderForTesting(provider: QueueProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}
