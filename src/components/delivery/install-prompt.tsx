'use client';

import { Download, MoreVertical, Share, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * M10 — "install the rider app" for someone who opened the link in a
 * browser. There is no Play Store build; this is the PWA install, which is
 * why the delivery tree carries its own `manifest-rider.json` (see the
 * layout) so the installed icon says "GF Rider" and opens on `/mr/delivery`.
 *
 * Two very different mechanics behind one strip:
 *   - Chrome/Android fires `beforeinstallprompt`, which we hold onto and
 *     replay when the rider taps Install — a real one-tap install.
 *   - iOS Safari has no such event and never will; the only route is
 *     Share → "Add to Home Screen", so there we show that instruction
 *     instead of a button that could not work.
 *
 * Renders nothing once the app is already running installed, which is the
 * state most riders will be in every day after the first.
 */

const DISMISSED_FLAG = 'getfresh.rider.install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true; // Assume installed on the server: render nothing until the client says otherwise.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own non-standard flag, still the only signal there.
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
    return localStorage.getItem(DISMISSED_FLAG) === '1';
  } catch {
    return false;
  }
}

// Read through useSyncExternalStore rather than an effect, same reasoning as
// `usePushAlerts` — it lets the client's real value replace the SSR-safe
// placeholder after hydration without a setState-in-effect.
function subscribeNever() {
  return () => {};
}
function getClientState() {
  return isStandalone() || wasDismissed() ? 'hidden' : isIos() ? 'ios' : 'android';
}
function getServerState() {
  return 'hidden' as const;
}

export function InstallPrompt() {
  const t = useTranslations('delivery');
  const state = useSyncExternalStore(subscribeNever, getClientState, getServerState);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // A real subscription to a browser event, which is exactly what an effect
  // is for — the setState happens in the listener, not in the effect body.
  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Keep the event so the install can happen on the rider's tap instead
      // of whenever Chrome happened to decide to ask.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDismissed(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_FLAG, '1');
    } catch {
      // Private mode — it just reappears next visit, which is harmless.
    }
  }

  if (state === 'hidden' || dismissed) return null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-tint-green px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{t('installTitle')}</p>
        {/* The one-tap path only exists when Chrome's `beforeinstallprompt`
            was actually captured, and often it isn't — the event fires
            early in page load, frequently before this component has
            hydrated and attached its listener, and Chrome skips it
            entirely once it thinks the origin is installed. Falling back
            to the menu instructions rather than hiding the strip: a rider
            who was shown nothing at all has no way to install, which is
            exactly what happened on the first version of this. */}
        {deferred ? (
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              setDeferred(null);
              if (choice.outcome === 'accepted') setDismissed(true);
            }}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[11px] font-bold text-primary-foreground"
          >
            <Download className="size-3.5" aria-hidden />
            {t('installAction')}
          </button>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
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
