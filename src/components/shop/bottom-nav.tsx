'use client';

import { Home, Mic, Salad, User, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * PART 5 — the 5-tab bottom navigation.
 *
 *   Home | Smart List | My Meal Plan | Wallet | Profile
 *
 * A floating white rounded card (session 2026-09-17, client reference) —
 * inset from all four edges rather than a bar spanning the screen, with the
 * active tab picked out by a pill (icon + label) instead of plain bold text.
 * Reverses the session-2026-09-02 "no colour, no pill" decision this same
 * nav went through earlier — client direction on this changed again, so the
 * pill is back, just as a floating card this time rather than the old
 * edge-to-edge bar's own highlight.
 *
 * The pill uses `--accent` (session 2026-09-20, client request) — the same
 * yellow `AppHeader`'s cart-icon item-count badge uses — instead of the
 * green `--primary` it used to. `--accent` is commented in globals.css as
 * "small badges/flags only — never a background field"; this is the first
 * place it's used as one, at the client's explicit ask to try it here.
 *
 * Home is the fallback active tab on any route that isn't one of the other
 * four sections (cart, checkout, product pages, orders, login, …) — the
 * reference shows Home highlighted on the cart screen even though "/cart"
 * isn't itself one of the five tab routes.
 *
 * Always visible (session 2026-09-16) — see `CartBar`
 * (src/components/shop/cart-bar.tsx), which always sits above this nav's
 * fixed height instead of reacting to it hiding.
 */

const TABS = [
  { href: '/', icon: Home, key: 'home' },
  { href: '/smart-list', icon: Mic, key: 'smartList' },
  { href: '/meal-plan', icon: Salad, key: 'mealPlan' },
  { href: '/wallet', icon: Wallet, key: 'wallet' },
  { href: '/profile', icon: User, key: 'profile' },
] as const;

const NON_HOME_PREFIXES = ['/smart-list', '/meal-plan', '/wallet', '/profile'] as const;

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('home')}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
    >
      <ul className="card-3d grid grid-cols-5 gap-1 rounded-[24px] bg-card px-1.5 py-2">
        {TABS.map((tab) => {
          const active =
            tab.href === '/'
              ? !NON_HOME_PREFIXES.some((prefix) => pathname.startsWith(prefix))
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // `px-1` (session 2026-09-20 — trimmed down from an
                  // earlier `px-1.5` that fixed the pill's edge-to-edge
                  // text but, on a narrow 5-column cell, pushed "My Meal
                  // Plan" past one line and wrapped it, growing the whole
                  // bar's height). Paired with the label's own
                  // `whitespace-nowrap` and a hair smaller font below —
                  // together they keep the longest label on one line with
                  // a little breathing room either side, instead of either
                  // extreme.
                  'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-full px-1 py-1.5 transition-colors',
                  active && 'bg-accent',
                )}
              >
                <Icon
                  className={cn(active ? 'text-accent-foreground' : 'text-muted-foreground', 'size-5')}
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden
                />
                <span
                  className={cn(
                    'text-[9.5px] leading-none whitespace-nowrap',
                    active ? 'font-bold text-accent-foreground' : 'text-muted-foreground',
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
