import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import type {
  StorageFolder,
  StorageProvider,
  StoredFile,
  TransformOptions,
  UploadOptions,
} from '../types';
import { StorageProviderError } from '../types';

/**
 * Writes to `public/uploads` so a developer can see real uploaded images in the
 * browser without a Cloudinary account. This is the default `STORAGE_PROVIDER`.
 *
 * Node-only: a serverless filesystem is ephemeral and read-only, so this
 * provider refuses to run in production. Use cloudinary or r2 there.
 */

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

/**
 * Statically rooted at `public/uploads`, not at a variable.
 *
 * A `path.join(process.cwd(), someVariable)` makes the bundler trace the whole
 * project into the serverless output — every source file and the entire public
 * folder — because it cannot prove which directory is reachable. A literal
 * prefix keeps the trace to this subtree.
 */
const UPLOAD_ROOT = ['public', 'uploads'] as const;

/**
 * A literal per folder, not `path.join(...UPLOAD_ROOT, opts.folder)`.
 *
 * `opts.folder` is a runtime value even though its type is a five-member
 * union — Turbopack's bundler analysis cannot see through that, and joining
 * it straight onto the path triggers the same "traces the whole project"
 * warning D-43 already fixed for the root. Routing it through a literal
 * switch keeps every `path.join` call statically resolvable.
 */
function folderDir(folder: StorageFolder): string {
  switch (folder) {
    case 'products':
      return path.join(process.cwd(), 'public', 'uploads', 'products');
    case 'banners':
      return path.join(process.cwd(), 'public', 'uploads', 'banners');
    case 'categories':
      return path.join(process.cwd(), 'public', 'uploads', 'categories');
    case 'smart-list':
      return path.join(process.cwd(), 'public', 'uploads', 'smart-list');
    case 'delivery-proof':
      return path.join(process.cwd(), 'public', 'uploads', 'delivery-proof');
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  constructor(private readonly baseDir: string = env.storage.localUploadDir) {
    if (env.isProduction) {
      throw new StorageProviderError(
        'STORAGE_PROVIDER=local cannot be used in production — serverless filesystems are ephemeral. Use cloudinary or r2.',
      );
    }
  }

  async upload(opts: UploadOptions): Promise<StoredFile> {
    const ext = EXTENSIONS[opts.mimeType] ?? 'bin';
    const base = (opts.fileName ?? 'file').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const name = `${base}-${Date.now()}.${ext}`;
    const key = `${opts.folder}/${name}`;

    const dir = folderDir(opts.folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), opts.data);

    return {
      key,
      url: this.urlFor(key),
      bytes: opts.data.byteLength,
      mimeType: opts.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    // Keys are provider-generated (`<folder>/<name>`), but treat them as
    // untrusted anyway: a `..` segment here would delete outside the upload
    // root.
    if (key.includes('..')) {
      throw new StorageProviderError(`Refusing to delete a key containing "..": ${key}`);
    }
    try {
      // Unlike `upload`, the segment after the root is a full `key`
      // (`<folder>/<name>`), not one of five literal folder names — there is
      // no finite switch to route it through. The `..` guard above is what
      // keeps this safe; the ignore comment is Next's documented escape
      // hatch for a path that is dynamic by necessity.
      await unlink(path.join(/* turbopackIgnore: true */ process.cwd(), ...UPLOAD_ROOT, key));
    } catch {
      // Already gone — deleting twice must be harmless.
    }
  }

  /** No transformation pipeline locally; sizing is left to the browser. */
  urlFor(key: string, _opts: TransformOptions = {}): string {
    void _opts;
    const publicPath = this.baseDir.replace(/^public\/?/, '');
    return `/${publicPath ? `${publicPath}/` : ''}${key}`;
  }
}
