'use client';

import { Home, Mic, Salad, User, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * PART 5 — the 5-tab bottom navigation.
 *
 *   Home | Smart List | My Meal Plan | Wallet | Profile
 *
 * Matching the client's Planeat reference: the active tab gets a light-green
 * rounded-rect highlight behind the icon and label, both in green — a nav
 * tab you are already on is where you are, which the reference treats as
 * worth the same colour as an action, unlike the flat/near-black scheme this
 * replaced.
 */

const TABS = [
  { href: '/', icon: Home, key: 'home' },
  { href: '/smart-list', icon: Mic, key: 'smartList' },
  { href: '/meal-plan', icon: Salad, key: 'mealPlan' },
  { href: '/wallet', icon: Wallet, key: 'wallet' },
  { href: '/profile', icon: User, key: 'profile' },
] as const;

// Blinkit-style scroll behaviour (session 2026-08-26): visible only at the
// very top of the page, hidden the instant the customer scrolls down, back
// the moment they scroll back to the top — position-based, not direction-
// based, so a partial scroll-up while still mid-page leaves it hidden.
//
// `useSyncExternalStore`, not an effect + setState: this is exactly what it
// exists for (subscribing to a value React doesn't own), and it sidesteps
// both the extra render an effect-driven setState would cause on mount and
// any server/client mismatch (SSR has no scroll position; a fresh load is
// at the top anyway, so `true` is the right guess).
const AT_TOP_THRESHOLD_PX = 4;

function subscribeScrollTop(onStoreChange: () => void): () => void {
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

function getIsAtTop(): boolean {
  return window.scrollY <= AT_TOP_THRESHOLD_PX;
}

function getServerIsAtTop(): boolean {
  return true;
}

function useIsAtTop(): boolean {
  return useSyncExternalStore(subscribeScrollTop, getIsAtTop, getServerIsAtTop);
}

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const atTop = useIsAtTop();

  return (
    <nav
      aria-label={t('home')}
      // Kept in the DOM and always laid out — only transform/opacity move,
      // so nothing that positions itself off this nav's height (CartBar,
      // the various sticky action bars via --bottom-nav-height) has to
      // know or care whether it's currently showing.
      inert={!atTop}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-border bg-accent-faint transition-[transform,opacity] duration-300 ease-out',
        atTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5 gap-1 px-1.5 py-2">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-2xl py-1.5 transition-colors',
                  active && 'bg-tint-green',
                )}
              >
                <Icon
                  className={cn(active ? 'text-primary' : 'text-muted-foreground', 'size-5')}
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden
                />
                <span
                  className={cn(
                    'text-[10.5px] leading-none',
                    active ? 'font-bold text-primary-dark' : 'text-muted-foreground',
                  )}
                >
                  {t(tab.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
