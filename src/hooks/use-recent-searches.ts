'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Recent searches (M2), kept in localStorage.
 *
 * Deliberately not server-side: a search history is personal, it is worthless
 * on another device, and storing it would put another piece of behavioural data
 * under the DPDP Act for no product benefit.
 *
 * Read through `useSyncExternalStore` rather than an effect. localStorage IS an
 * external store, and the effect version causes a cascading render on every
 * mount plus a hydration mismatch between the empty server render and the
 * populated client one.
 */

const STORAGE_KEY = 'planeat.recent-searches.v1';
const MAX_ENTRIES = 8;

const EMPTY: string[] = [];

/** The snapshot must be referentially stable or React re-renders forever. */
let cachedRaw: string | null = null;
let cachedValue: string[] = EMPTY;

const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode — behave as if the history is empty.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function write(next: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode — the feature is disposable.
  }
  for (const listener of listeners) listener();
}

export function useRecentSearches() {
  const recent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    const current = getSnapshot();
    if (current[0] === trimmed) return;

    write([trimmed, ...current.filter((t) => t !== trimmed)].slice(0, MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
    for (const listener of listeners) listener();
  }, []);

  return { recent, remember, clear };
}
