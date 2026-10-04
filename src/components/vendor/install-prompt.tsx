'use client';

import { Download, MoreVertical, Share, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Copy-adapted from `src/components/delivery/install-prompt.tsx` — see its
 * own comment for the full reasoning (two different install mechanics,
 * snoozed not permanent, `beforeinstallprompt` captured pre-hydration by
 * the layout's own inline script). Only the i18n namespace and the
 * localStorage key differ.
 */

const DISMISSED_UNTIL_KEY = 'getfresh.vendor.install_dismissed_until';
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type WindowWithInstallPrompt = Window & {
  __installPromptEvent?: BeforeInstallPromptEvent;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const until = Number(localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function subscribeNever() {
  return () => {};
}
function getClientState() {
  return isStandalone() || wasDismissed() ? 'hidden' : isIos() ? 'ios' : 'android';
}
function getServerState() {
  return 'hidden' as const;
}

function subscribeInstallPrompt(onChange: () => void) {
  window.addEventListener('installpromptready', onChange);
  return () => window.removeEventListener('installpromptready', onChange);
}
function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return (window as WindowWithInstallPrompt).__installPromptEvent ?? null;
}
function getServerInstallPrompt(): null {
  return null;
}

export function InstallPrompt() {
  const t = useTranslations('vendor');
  const state = useSyncExternalStore(subscribeNever, getClientState, getServerState);
  const captured = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt,
    getServerInstallPrompt,
  );
  const [used, setUsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const deferred = used ? null : captured;

  useEffect(() => {
    function onInstalled() {
      setDismissed(true);
    }
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_SNOOZE_MS));
    } catch {
      // Private mode — it just reappears next visit, which is harmless.
    }
  }

  if (state === 'hidden' || dismissed) return null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-tint-green px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{t('installTitle')}</p>
        {deferred ? (
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              setUsed(true);
              if (choice.outcome === 'accepted') setDismissed(true);
            }}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-bold text-primary-foreground"
          >
            <Download className="size-3.5" aria-hidden />
            {t('installAction')}
          </button>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
            {state === 'ios' ? (
              <>
                <Share className="size-3 shrink-0" aria-hidden />
                {t('installIosHint')}
              </>
            ) : (
              <>
                <MoreVertical className="size-3 shrink-0" aria-hidden />
                {t('installAndroidHint')}
              </>
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('installDismiss')}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
