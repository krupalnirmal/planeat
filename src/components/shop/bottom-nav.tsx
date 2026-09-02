'use client';

import { Home, Mic, Salad, User, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useIsAtTop } from '@/hooks/use-is-at-top';
import { cn } from '@/lib/utils';

/**
 * PART 5 — the 5-tab bottom navigation.
 *
 *   Home | Smart List | My Meal Plan | Wallet | Profile
 *
 * Plain black-active/gray-inactive (session 2026-09-02, client's cart-page
 * reference) — replaces the earlier green-highlight-pill treatment app-wide,
 * an explicit reversal of that prior decision. No colour, no background
 * pill: the active tab is just bold and black, everything else is muted.
 *
 * Home is the fallback active tab on any route that isn't one of the other
 * four sections (cart, checkout, product pages, orders, login, …) — the
 * reference shows Home highlighted on the cart screen even though "/cart"
 * isn't itself one of the five tab routes.
 */

const TABS = [
  { href: '/', icon: Home, key: 'home' },
  { href: '/smart-list', icon: Mic, key: 'smartList' },
  { href: '/meal-plan', icon: Salad, key: 'mealPlan' },
  { href: '/wallet', icon: Wallet, key: 'wallet' },
  { href: '/profile', icon: User, key: 'profile' },
] as const;

const NON_HOME_PREFIXES = ['/smart-list', '/meal-plan', '/wallet', '/profile'] as const;

// Blinkit-style scroll behaviour (session 2026-08-26): visible only at the
// very top of the page, hidden the instant the customer scrolls down, back
// the moment they scroll back to the top — position-based, not direction-
// based, so a partial scroll-up while still mid-page leaves it hidden.
// `useIsAtTop` (src/hooks/use-is-at-top.ts) is shared with CartBar, which
// needs the same signal to know when to drop down to the real screen edge.

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
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-2xl py-1.5"
              >
                <Icon
                  className={cn(active ? 'text-foreground' : 'text-muted-foreground', 'size-5')}
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden
                />
                <span
                  className={cn(
                    'text-[10.5px] leading-none',
                    active ? 'font-bold text-foreground' : 'text-muted-foreground',
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
