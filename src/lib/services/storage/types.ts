/**
 * The storage port.
 *
 * Cloudinary's free tier is 25 credits/month and the next tier up is ~$99 —
 * there is nothing in between (PART 4.3). This interface is what makes moving
 * to Cloudflare R2 an `.env` change instead of a refactor.
 */

export type StorageFolder = 'products' | 'banners' | 'categories' | 'smart-list' | 'delivery-proof';

export interface UploadOptions {
  data: Buffer;
  mimeType: string;
  folder: StorageFolder;
  /** Base name without extension. A unique suffix is added by the provider. */
  fileName?: string;
}

export interface StoredFile {
  /** Provider-specific handle used for deletion and transformations. */
  key: string;
  url: string;
  bytes: number;
  mimeType: string;
}

export interface TransformOptions {
  width?: number;
  height?: number;
  /** Cloudinary f_auto,q_auto equivalents. Providers without support ignore these. */
  auto?: boolean;
}

export interface StorageProvider {
  readonly name: string;

  upload(opts: UploadOptions): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** M2 — product images are served as `f_auto,q_auto,w_300`. */
  urlFor(key: string, opts?: TransformOptions): string;
}

export class StorageProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageProviderError';
  }
}
