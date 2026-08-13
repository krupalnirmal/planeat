/**
 * P10 — the PWA's offline shell (M11, B18, R11).
 *
 * Hand-written rather than a generated Workbox bundle: the whole app already
 * avoids vendor SDKs outside the six ports (R1), and a service worker this
 * small does not need a build step of its own. It is deliberately modest —
 * "the app installs and launches offline to a real shell", not "the whole
 * catalogue works with no network", which would need a sync strategy this
 * project does not have.
 *
 * Cache-first for the app's own static assets (they are content-hashed by
 * Next, so a cached one is never stale); network-first for everything else,
 * falling back to the cache and finally to `/offline.html` for a navigation
 * that has nothing cached at all.
 */

const CACHE_VERSION = 'planeat-shell-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — every one of them is either dynamic data or a
  // mutation, and a stale cached API response would be actively wrong (a cart
  // total, a wallet balance) rather than just missing.
  if (url.pathname.startsWith('/api/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(
        () =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
            return Response.error();
          }),
      ),
  );
});

/**
 * M8's push channel. `getPushProvider().send()` (server-side) is only half
 * of "push notification" — this is the half that actually shows one, once a
 * real FCM/Web Push message arrives at a real browser.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Planeat', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Planeat', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
