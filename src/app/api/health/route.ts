import { ok } from '@/lib/api/response';
import { env } from '@/lib/env';

/**
 * Liveness + configuration probe.
 *
 * Deliberately reports which provider each of the six ports resolved to. When
 * a demo behaves oddly, "which providers am I actually running?" is the first
 * question, and R1 means the answer is always just six strings.
 *
 * No secrets are exposed — only provider names and booleans.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({
    status: 'ok',
    app: env.appName,
    environment: env.nodeEnv,
    time: new Date().toISOString(),
    providers: env.providers,
    features: env.features,
    locales: { default: env.locale.default, supported: env.locale.supported },
    aiAllowsRealHealthData: env.ai.allowRealHealthData,
  });
}
