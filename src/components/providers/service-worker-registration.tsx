'use client';

import { useEffect } from 'react';

/**
 * P10 — registers the offline shell (`public/sw.js`, M11, B18).
 *
 * Registration itself never blocks or throws into the tree: a browser with no
 * service worker support (or one that refuses for its own reasons) should
 * render the app exactly as it did before this existed.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[sw] registration failed', error);
    });
  }, []);

  return null;
}
