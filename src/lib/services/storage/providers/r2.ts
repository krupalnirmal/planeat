import { env } from '@/lib/env';
import type { StorageProvider, StoredFile, TransformOptions, UploadOptions } from '../types';
import { StorageProviderError } from '../types';

/**
 * Cloudflare R2 over the S3 REST API with hand-rolled SigV4 — no AWS SDK
 * (R1, R11; the SDK is also far too heavy for a Worker bundle).
 *
 * This is the documented exit from Cloudinary's 25-credit free tier
 * (PART 4.3). R2 has no image transformation pipeline, so `urlFor` ignores
 * width/height; resize on upload or put Cloudflare Images in front.
 */

const SERVICE = 's3';
const REGION = 'auto';

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

export class R2Provider implements StorageProvider {
  readonly name = 'r2';

  constructor(
    private readonly accountId: string = env.storage.r2AccountId,
    private readonly accessKeyId: string = env.storage.r2AccessKeyId,
    private readonly secretAccessKey: string = env.storage.r2SecretAccessKey,
    private readonly bucket: string = env.storage.r2Bucket,
    private readonly publicBaseUrl: string = process.env.R2_PUBLIC_BASE_URL ?? '',
  ) {}

  private assertConfigured(): void {
    if (!this.accountId || !this.accessKeyId || !this.secretAccessKey || !this.bucket) {
      throw new StorageProviderError(
        'R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET are not all set.',
      );
    }
  }

  private get host(): string {
    return `${this.accountId}.r2.cloudflarestorage.com`;
  }

  private async signedFetch(
    method: 'PUT' | 'DELETE',
    key: string,
    body: Uint8Array | undefined,
    contentType?: string,
  ): Promise<Response> {
    this.assertConfigured();

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(body ?? new Uint8Array());
    const canonicalUri = `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

    const headers: Record<string, string> = {
      host: this.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k]}\n`)
      .join('');

    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = await hmac(new TextEncoder().encode(`AWS4${this.secretAccessKey}`), dateStamp);
    const kRegion = await hmac(kDate, REGION);
    const kService = await hmac(kRegion, SERVICE);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = hex(await hmac(kSigning, stringToSign));

    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(`https://${this.host}${canonicalUri}`, {
      method,
      headers,
      body: body ? (body as BodyInit) : undefined,
    });
  }

  async upload(opts: UploadOptions): Promise<StoredFile> {
    const base = (opts.fileName ?? 'file').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const key = `${opts.folder}/${base}-${Date.now()}`;

    const res = await this.signedFetch(
      'PUT',
      key,
      new Uint8Array(opts.data),
      opts.mimeType,
    );

    if (!res.ok) {
      throw new StorageProviderError(`R2 upload failed with status ${res.status}`);
    }

    return { key, url: this.urlFor(key), bytes: opts.data.byteLength, mimeType: opts.mimeType };
  }

  async delete(key: string): Promise<void> {
    const res = await this.signedFetch('DELETE', key, undefined);
    if (!res.ok && res.status !== 404) {
      throw new StorageProviderError(`R2 delete failed with status ${res.status}`);
    }
  }

  urlFor(key: string, _opts: TransformOptions = {}): string {
    void _opts;
    const base = this.publicBaseUrl || `https://${this.host}/${this.bucket}`;
    return `${base.replace(/\/$/, '')}/${key}`;
  }
}
