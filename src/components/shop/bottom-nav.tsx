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

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('home')}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-border bg-accent-faint"
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
