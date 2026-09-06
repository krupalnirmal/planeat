'use client';

import { useState, useSyncExternalStore } from 'react';
import { enablePush, isPushSupported, type EnablePushResult } from '@/lib/push/subscribe';

/**
 * The "turn on push notifications for this device" state machine, shared by
 * the admin bell and the rider header — both need the same four outcomes
 * (can ask / asking / on / blocked) around the same `enablePush()` call, and
 * the browser-permission reading is the fiddly half.
 */

const ENABLED_FLAG = 'getfresh.push_enabled';

export type PushAlertStatus =
  | 'promptable'
  | 'enabling'
  | 'enabled'
  | Extract<EnablePushResult, { ok: false }>['reason'];

function readBrowserStatus(): PushAlertStatus {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') {
    try {
      return localStorage.getItem(ENABLED_FLAG) === '1' ? 'enabled' : 'promptable';
    } catch {
      return 'promptable';
    }
  }
  return 'promptable';
}

// Nothing external ever changes this on its own (a browser gives no event
// for "the user just flipped the notification permission"), but reading it
// through useSyncExternalStore — the same pattern as useWishlisted in
// product-card.tsx — is what lets the CLIENT's real value replace the
// SSR-safe placeholder after hydration without a setState-in-effect.
function subscribeNever() {
  return () => {};
}
function getServerStatus(): PushAlertStatus {
  return 'promptable';
}

export function usePushAlerts() {
  const browserStatus = useSyncExternalStore(subscribeNever, readBrowserStatus, getServerStatus);
  const [override, setOverride] = useState<PushAlertStatus | null>(null);

  async function enable() {
    setOverride('enabling');
    const result = await enablePush();
    if (result.ok) {
      try {
        localStorage.setItem(ENABLED_FLAG, '1');
      } catch {
        // Private mode — the token is still registered server-side; only
        // the "already enabled" shortcut for next time is lost.
      }
      setOverride('enabled');
    } else {
      setOverride(result.reason);
    }
  }

  return { status: override ?? browserStatus, enable };
}
