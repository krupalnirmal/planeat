import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma singleton.
 *
 * Prisma 7 dropped the Rust query engine, so a driver adapter is required.
 * TiDB Cloud speaks the MySQL wire protocol, which is what
 * `@prisma/adapter-mariadb` drives — and TiDB Starter *requires* TLS, hence
 * `sslaccept=strict` in DATABASE_URL.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every save and exhaust TiDB's connection limit within a
 * few minutes. Hence the global cache.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      // Small pool on purpose: serverless functions each hold their own, and
      // TiDB Starter's connection budget is not generous.
      connectionLimit: 5,
      // Fail fast rather than hanging. An unreachable database should surface
      // in a couple of seconds — the default waits ten, which on a page doing
      // three parallel queries means a thirty-second blank screen and no clue
      // why. A real TiDB connection from the same region takes ~200 ms, so
      // this is generous even when everything is working.
      connectTimeout: 4_000,
      acquireTimeout: 6_000,
      ...parseConnectionString(url),
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * The adapter takes discrete connection options rather than a URL, so the
 * single DATABASE_URL in `.env` stays the one place a connection is configured.
 */
function parseConnectionString(url: string) {
  const parsed = new URL(url);
  const needsTls =
    parsed.searchParams.get('sslaccept') === 'strict' ||
    parsed.searchParams.get('ssl') === 'true';

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 4000,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: needsTls ? { rejectUnauthorized: true } : undefined,
  };
}

/**
 * Constructed lazily. Importing this module must never require a database:
 * `next build` prerenders pages that only read messages and settings defaults,
 * and a missing DATABASE_URL should fail where a query is actually issued, not
 * at module load.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = (globalForPrisma.prisma ??= createClient());
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
