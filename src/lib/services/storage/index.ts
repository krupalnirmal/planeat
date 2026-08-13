import { env } from '@/lib/env';
import { MockStorageProvider } from './mock';
import { CloudinaryProvider } from './providers/cloudinary';
import { LocalStorageProvider } from './providers/local';
import { R2Provider } from './providers/r2';
import type { StorageProvider } from './types';

export * from './types';
export { MockStorageProvider } from './mock';

let cached: StorageProvider | null = null;
let cachedKey = '';

function build(name: string): StorageProvider {
  switch (name) {
    case 'cloudinary':
      return new CloudinaryProvider();
    case 'r2':
      return new R2Provider();
    case 'local':
      return new LocalStorageProvider();
    case 'mock':
      return new MockStorageProvider();
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${name}". Expected one of: mock, local, cloudinary, r2.`,
      );
  }
}

export function getStorageProvider(): StorageProvider {
  if (cached && cachedKey === env.providers.storage) return cached;
  cached = build(env.providers.storage);
  cachedKey = env.providers.storage;
  return cached;
}

export function setStorageProviderForTesting(provider: StorageProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}
