'use client';

import {
  Bike,
  ClipboardList,
  FileClock,
  Home,
  LayoutDashboard,
  MapPinned,
  Package,
  Repeat,
  Salad,
  Settings,
  ShoppingBag,
  Users,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * M9 — the admin shell: desktop-optimised, and in its own route group so
 * Next code-splits it away from the customer bundle (R10).
 *
 * Nothing under `src/components/admin/**` may be imported by a customer-facing
 * component. That is what keeps a ₹200-phone's initial download under budget
 * while the owner's laptop gets a dense table.
 *
 * Ordered by how often the owner opens each one. The picklist sits second
 * because it is the screen that replaces their notebook.
 */

const SECTIONS = [
  { href: '/admin', key: 'dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/picklist', key: 'picklist', icon: ClipboardList },
  { href: '/admin/orders', key: 'orders', icon: ShoppingBag },
  { href: '/admin/inventory', key: 'inventory', icon: Warehouse },
  { href: '/admin/catalogue', key: 'catalogue', icon: Package },
  { href: '/admin/meal-plans', key: 'mealPlans', icon: Salad },
  { href: '/admin/customers', key: 'customers', icon: Users },
  { href: '/admin/delivery-partners', key: 'deliveryPartners', icon: Bike },
  { href: '/admin/swaps', key: 'swaps', icon: Repeat },
  { href: '/admin/waitlist', key: 'waitlist', icon: MapPinned },
  { href: '/admin/settings', key: 'settings', icon: Settings },
  { href: '/admin/audit-log', key: 'auditLog', icon: FileClock },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin.nav');
  const tAdmin = useTranslations('admin');
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh bg-secondary">
      {/* The sidebar is hidden when printing — the picklist is printed on
          paper and carried to the market, and a nav column would waste a
          third of the page. */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block print:hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-bold">Planeat</p>
          <p className="text-xs text-muted-foreground">{tAdmin('title')}</p>
        </div>

        <nav className="p-2">
          <ul className="space-y-0.5">
            {SECTIONS.map((section) => {
              const active =
                'exact' in section && section.exact
                  ? pathname === section.href
                  : pathname.startsWith(section.href);
              const Icon = section.icon;

              return (
                <li key={section.key}>
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-[var(--radius)] px-3 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {t(section.key)}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-border pt-2">
            <Link
              href="/"
              className="flex min-h-10 items-center gap-2.5 rounded-[var(--radius)] px-3 text-sm text-muted-foreground"
            >
              <Home className="size-4 shrink-0" aria-hidden />
              {t('backToShop')}
            </Link>
          </div>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* A horizontal nav on narrow screens, so the panel is still usable on
            a phone when the owner is standing in the shop. */}
        <nav className="border-b border-border bg-card px-3 py-2 lg:hidden print:hidden">
          <ul className="flex gap-1 overflow-x-auto">
            {SECTIONS.map((section) => {
              const active =
                'exact' in section && section.exact
                  ? pathname === section.href
                  : pathname.startsWith(section.href);
              const Icon = section.icon;

              return (
                <li key={section.key}>
                  <Link
                    href={section.href}
                    className={cn(
                      'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs whitespace-nowrap',
                      active
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {t(section.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="p-4 lg:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}

/** Shared heading, so every admin screen looks like the same product. */
export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 print:mb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 print:hidden">{action}</div>}
    </header>
  );
}

/** A dense table wrapper that scrolls horizontally rather than the page. */
export function AdminTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}
