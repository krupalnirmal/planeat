import { api } from '@/lib/api/client';

/**
 * The client half of push that never existed anywhere in this app before
 * (M8's server half — `getPushProvider`, `POST /api/push/register` — was
 * always complete; nothing ever drove a browser through requesting
 * permission and registering a token). Built first for the admin "Enable
 * order alerts" button, but nothing here is admin-specific — the same
 * function would work for a customer or rider flow later.
 *
 * Firebase's JS SDK is only used for `getToken()`, which mints an FCM
 * registration token bound to a real browser PushSubscription — the exact
 * format `src/lib/services/push/providers/fcm.ts` sends to. Passing our own
 * `serviceWorkerRegistration` (already registered by
 * `ServiceWorkerRegistration`, src/components/providers) means Firebase
 * reuses the existing `public/sw.js` instead of requiring its own
 * `firebase-messaging-sw.js` — that file's generic `push` handler already
 * displays whatever arrives, with no idea who the recipient is.
 */

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'not-configured' | 'error'; message?: string };

const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isConfigured(): boolean {
  return Object.values(FIREBASE_CONFIG).every(Boolean) && Boolean(VAPID_KEY);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!isConfigured()) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'NEXT_PUBLIC_FIREBASE_* env vars are not set.',
    };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const [{ initializeApp, getApps, getApp }, { getMessaging, getToken }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);

    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: 'error', message: 'No token returned' };

    await api.post('/api/push/register', { token, platform: 'web' });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
