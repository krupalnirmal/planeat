'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-device "Daily vs Weekly" preference the customer picks the first time
 * they open My Meal Plan (session 2026-09-27, user request) — asked once,
 * mandatorily (see `MandatoryDeliveryModePopup` in `meal-plan-screen.tsx`),
 * then remembered so it never asks again on this device. Same
 * localStorage + `useSyncExternalStore` shape as `useWishlisted`
 * (src/hooks/use-wishlist.ts) — a soft, per-device convenience, not the
 * source of truth: the actual `Subscription.deliveryMode` is still set
 * (and still changeable) on the real Subscribe screen later.
 */

const STORAGE_KEY = 'getfresh.meal-plan.delivery-mode-preference';

export type DeliveryModePreference = 'DAILY' | 'WEEKLY';

const listeners = new Set<() => void>();

function readPreference(): DeliveryModePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'DAILY' || value === 'WEEKLY' ? value : null;
  } catch {
    return null; // Private mode — behave as if nothing was ever picked.
  }
}

function writePreference(value: DeliveryModePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Quota or private mode — the toggle still works for this render.
  }
  for (const listener of listeners) listener();
}

function subscribePreference(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getServerPreference(): DeliveryModePreference | null {
  return null;
}

export function useDeliveryModePreference() {
  const preference = useSyncExternalStore(subscribePreference, readPreference, getServerPreference);
  const setPreference = useCallback((value: DeliveryModePreference) => writePreference(value), []);
  return [preference, setPreference] as const;
}
