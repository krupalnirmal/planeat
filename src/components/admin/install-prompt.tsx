'use client';

import { Download, MoreVertical, Share, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * "Install the admin app" for staff who open the panel (or its shared
 * `/staff/login`) in a browser rather than the installed app — same
 * mechanism as the delivery tree's own `InstallPrompt`
 * (src/components/delivery/install-prompt.tsx) and the shop tree's
 * (src/components/shop/install-prompt.tsx), kept as its own copy rather
 * than shared since none of the shop/admin/delivery bundles import from
 * each other (M9 — the admin bundle must never reach a customer phone).
 *
 * Two very different mechanics behind one strip:
 *   - Chrome/Android fires `beforeinstallprompt`, which the layout's
 *     pre-hydration script holds onto and this replays when tapped — a
 *     real one-tap install.
 *   - iOS Safari has no such event and never will; the only route is
 *     Share → "Add to Home Screen", so there we show that instruction
 *     instead of a button that could not work.
 *
 * Renders nothing once the app is already running installed.
 */

const DISMISSED_FLAG = 'getfresh.admin.install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Where the layout's pre-hydration script parks the captured event. */
type WindowWithInstallPrompt = Window & {
  __installPromptEvent?: BeforeInstallPromptEvent;
};

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
// the shop/delivery install prompts — it lets the client's real value
// replace the SSR-safe placeholder after hydration without a
// setState-in-effect.
function subscribeNever() {
  return () => {};
}
function getClientState() {
  return isStandalone() || wasDismissed() ? 'hidden' : isIos() ? 'ios' : 'android';
}
function getServerState() {
  return 'hidden' as const;
}

// The captured `beforeinstallprompt`, read the same way — it lives on
// `window`, put there by the layout's pre-hydration script, and the script
// announces each capture with `installpromptready`.
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

export function AdminInstallPrompt() {
  const t = useTranslations('admin');
  const state = useSyncExternalStore(subscribeNever, getClientState, getServerState);
  const captured = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt,
    getServerInstallPrompt,
  );
  const [used, setUsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const deferred = used ? null : captured;

  // Hide the strip the moment the install actually completes. setState in
  // an event listener is fine; it's setState in the effect BODY that
  // cascades renders, which is why the deferred event above comes through
  // useSyncExternalStore instead.
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
      localStorage.setItem(DISMISSED_FLAG, '1');
    } catch {
      // Private mode — it just reappears next visit, which is harmless.
    }
  }

  if (state === 'hidden' || dismissed) return null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-tint-green px-4 py-2.5 print:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{t('installTitle')}</p>
        {/* The one-tap path only exists when Chrome's `beforeinstallprompt`
            was actually captured, and often it isn't — the event fires
            early in page load, frequently before this component has
            hydrated and attached its listener, and Chrome skips it
            entirely once it thinks the origin is installed. Falling back
            to the menu instructions rather than hiding the strip: staff
            shown nothing at all have no way to install. */}
        {deferred ? (
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              // A prompt can only be replayed once; drop back to the menu
              // instructions if it was declined.
              setUsed(true);
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
