'use client';

import { useSyncExternalStore } from 'react';

/**
 * Position-based (not direction-based) scroll-top tracking, shared by
 * `BottomNav` (which hides below this threshold) and `CartBar` (which needs
 * to know the nav is hidden so it can drop down to the real screen edge
 * instead of floating above empty space — session 2026-08-30). A partial
 * scroll-up while still mid-page reports `false`, matching the nav's own
 * hide behaviour.
 */
const AT_TOP_THRESHOLD_PX = 4;

function subscribe(onStoreChange: () => void): () => void {
  let ticking = false;

  function handleScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onStoreChange();
    });
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => window.removeEventListener('scroll', handleScroll);
}

function getSnapshot(): boolean {
  return window.scrollY <= AT_TOP_THRESHOLD_PX;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsAtTop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
