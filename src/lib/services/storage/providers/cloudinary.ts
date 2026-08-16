import { env } from '@/lib/env';
import type { StorageProvider, StoredFile, TransformOptions, UploadOptions } from '../types';
import { StorageProviderError } from '../types';

/**
 * Cloudinary over plain REST — no vendor SDK (R1, R11).
 *
 * Signed uploads need an SHA-1 of the request parameters plus the API secret.
 * We use Web Crypto rather than node:crypto so this stays Workers-compatible.
 */

interface CloudinaryUploadResponse {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  resource_type?: string;
  format?: string;
  error?: { message?: string };
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CloudinaryProvider implements StorageProvider {
  readonly name = 'cloudinary';

  constructor(
    private readonly cloudName: string = env.storage.cloudinaryCloudName,
    private readonly apiKey: string = env.storage.cloudinaryApiKey,
    private readonly apiSecret: string = env.storage.cloudinaryApiSecret,
  ) {}

  private assertConfigured(): void {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new StorageProviderError(
        'CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not all set.',
      );
    }
  }

  async upload(opts: UploadOptions): Promise<StoredFile> {
    this.assertConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `getfresh/${opts.folder}`;
    const publicId = `${opts.fileName ?? 'file'}-${timestamp}`.replace(/[^a-z0-9-]/gi, '-');

    // Signature covers the alphabetically sorted params, secret appended.
    const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = await sha1Hex(`${toSign}${this.apiSecret}`);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }));
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('public_id', publicId);
    form.append('signature', signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
      { method: 'POST', body: form },
    );

    const json = (await res.json()) as CloudinaryUploadResponse;

    if (!res.ok || !json.public_id || !json.secure_url) {
      throw new StorageProviderError(
        json.error?.message ?? `Cloudinary upload failed with status ${res.status}`,
      );
    }

    return {
      key: json.public_id,
      url: json.secure_url,
      bytes: json.bytes ?? opts.data.byteLength,
      mimeType: opts.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    this.assertConfigured();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1Hex(
      `public_id=${key}&timestamp=${timestamp}${this.apiSecret}`,
    );

    const form = new FormData();
    form.append('public_id', key);
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
      { method: 'POST', body: form },
    );

    if (!res.ok) {
      throw new StorageProviderError(`Cloudinary delete failed with status ${res.status}`);
    }
  }

  /** M2 — `f_auto,q_auto,w_300` keeps product grids light on rural 4G. */
  urlFor(key: string, opts: TransformOptions = {}): string {
    const parts: string[] = [];
    if (opts.auto !== false) parts.push('f_auto', 'q_auto');
    if (opts.width) parts.push(`w_${opts.width}`);
    if (opts.height) parts.push(`h_${opts.height}`);
    const transform = parts.length > 0 ? `${parts.join(',')}/` : '';
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transform}${key}`;
  }
}
