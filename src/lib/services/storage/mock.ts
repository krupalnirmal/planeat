import type {
  StorageProvider,
  StoredFile,
  TransformOptions,
  UploadOptions,
} from './types';

/**
 * R2 — in-memory storage mock. Nothing touches the disk or the network, so
 * tests are fast and CI never hits a quota.
 *
 * `urlFor` returns a stable `/api/mock-storage/<key>` path so the UI has
 * something renderable during development.
 */

export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock';

  private files = new Map<string, { data: Buffer; mimeType: string }>();
  private counter = 0;

  async upload(opts: UploadOptions): Promise<StoredFile> {
    this.counter += 1;
    const base = opts.fileName?.replace(/[^a-z0-9-]/gi, '-').toLowerCase() ?? 'file';
    const key = `${opts.folder}/${base}-${this.counter}`;

    this.files.set(key, { data: opts.data, mimeType: opts.mimeType });

    return {
      key,
      url: this.urlFor(key),
      bytes: opts.data.byteLength,
      mimeType: opts.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  urlFor(key: string, opts: TransformOptions = {}): string {
    const params = new URLSearchParams();
    if (opts.width) params.set('w', String(opts.width));
    if (opts.height) params.set('h', String(opts.height));
    const query = params.toString();
    return `/api/mock-storage/${key}${query ? `?${query}` : ''}`;
  }

  /** Test helpers. */
  read(key: string): Buffer | undefined {
    return this.files.get(key)?.data;
  }

  count(): number {
    return this.files.size;
  }

  clear(): void {
    this.files.clear();
    this.counter = 0;
  }
}
