import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Next 16 writes AGENTS.md and CLAUDE.md into the repo root on every dev
  // start. This project documents itself in README.md and DECISIONS.md; two
  // more generated files at the root are churn, not guidance.
  agentRules: false,

  // R11 — stay Cloudflare-compatible. Nothing Vercel-only goes in here.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },

  // R10 — the admin panel must never ship in the customer bundle. Prisma is
  // server-only; keeping it external stops the bundler from trying to trace it
  // into a client chunk.
  serverExternalPackages: ['@prisma/client'],

  typescript: {
    // Type errors fail the build. They are bugs, not warnings.
    ignoreBuildErrors: false,
  },
  // Next 16 dropped the built-in `next lint` step, so ESLint runs as its own
  // script (`npm run lint`, and `npm run check` before every commit).
};

export default withNextIntl(nextConfig);
