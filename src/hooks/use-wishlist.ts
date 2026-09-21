'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The wishlist heart toggle — extracted (session 2026-09-21) from
 * `product-card.tsx`, where it used to live as module-private helpers, once
 * the Product Detail Page needed the exact same per-device toggle rather
 * than a second implementation.
 *
 * Same shape as `useRecentSearches` (src/hooks/use-recent-searches.ts):
 * localStorage read through `useSyncExternalStore`, not an effect +
 * setState — that would cascade an extra render on every card's mount and
 * mismatch the empty server render against the populated client one.
 *
 * Deliberately a per-device toggle only — it doesn't sync to an account or
 * a wishlist page, since neither exists yet.
 */

const listeners = new Set<() => void>();

function wishlistKey(productId: string) {
  return `getfresh.wishlist.${productId}`;
}

function readWishlisted(productId: string): boolean {
  try {
    return window.localStorage.getItem(wishlistKey(productId)) === '1';
  } catch {
    return false; // Private mode — behave as if nothing is wishlisted.
  }
}

function writeWishlisted(productId: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(wishlistKey(productId), '1');
    else window.localStorage.removeItem(wishlistKey(productId));
  } catch {
    // Quota or private mode — the toggle still works for this render.
  }
  for (const listener of listeners) listener();
}

function subscribeWishlist(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getServerWishlisted(): boolean {
  return false;
}

export function useWishlisted(productId: string) {
  const wishlisted = useSyncExternalStore(
    subscribeWishlist,
    () => readWishlisted(productId),
    getServerWishlisted,
  );
  const toggle = useCallback(() => writeWishlisted(productId, !readWishlisted(productId)), [productId]);
  return [wishlisted, toggle] as const;
}
