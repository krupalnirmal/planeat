import { env } from '@/lib/env';
import type { PushMessage, PushProvider, PushResult, PushTarget } from '../types';
import { PushProviderError } from '../types';

/**
 * Firebase Cloud Messaging HTTP v1 over plain REST — no firebase-admin SDK
 * (R1, R11; the SDK also pulls in gRPC, which will not run on a Worker).
 *
 * Auth is a service-account JWT exchanged for an OAuth access token, signed
 * with Web Crypto so it stays runtime-portable.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface FcmError {
  error?: { message?: string; status?: string };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class FcmProvider implements PushProvider {
  readonly name = 'fcm';

  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly projectId: string = env.push.fcmProjectId,
    private readonly clientEmail: string = env.push.fcmClientEmail,
    private readonly privateKey: string = env.push.fcmPrivateKey,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (!this.projectId || !this.clientEmail || !this.privateKey) {
      throw new PushProviderError(
        'FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are not all set.',
      );
    }
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(
      new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    );
    const claims = base64Url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: this.clientEmail,
          scope: SCOPE,
          aud: TOKEN_URL,
          iat: now,
          exp: now + 3600,
        }),
      ),
    );

    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(this.privateKey) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    const jwt = `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const json = (await res.json()) as { access_token?: string; expires_in?: number } & FcmError;
    if (!res.ok || !json.access_token) {
      throw new PushProviderError(
        json.error?.message ?? `FCM token exchange failed with status ${res.status}`,
      );
    }

    this.accessToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.accessToken.value;
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    const token = await this.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

    const invalidTokens: string[] = [];
    let accepted = 0;
    let failed = 0;

    // FCM v1 has no batch endpoint; send per token and collect the failures.
    for (const target of targets) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: {
            token: target.token,
            notification: {
              title: message.title,
              body: message.body,
              ...(message.imageUrl ? { image: message.imageUrl } : {}),
            },
            data: { ...message.data, ...(message.url ? { url: message.url } : {}) },
            android: {
              collapseKey: message.collapseKey,
              notification: { clickAction: message.url },
            },
          },
        }),
      });

      if (res.ok) {
        accepted += 1;
        continue;
      }

      failed += 1;
      const json = (await res.json().catch(() => ({}))) as FcmError;
      // UNREGISTERED / INVALID_ARGUMENT mean the token is dead for good.
      if (json.error?.status === 'UNREGISTERED' || json.error?.status === 'INVALID_ARGUMENT') {
        invalidTokens.push(target.token);
      }
    }

    return { accepted, failed, invalidTokens };
  }
}
