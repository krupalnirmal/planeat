'use client';

import {
  Bike,
  ChevronLeft,
  ClipboardList,
  FileClock,
  Home,
  LayoutDashboard,
  MapPinned,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { NotificationBell } from '@/components/admin/notification-bell';
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
  { href: '/admin/customers', key: 'customers', icon: Users },
  { href: '/admin/delivery-partners', key: 'deliveryPartners', icon: Bike },
  { href: '/admin/waitlist', key: 'waitlist', icon: MapPinned },
  { href: '/admin/settings', key: 'settings', icon: Settings },
  { href: '/admin/audit-log', key: 'auditLog', icon: FileClock },
] as const;

/** The vertical section list — shared by the desktop sidebar and the mobile
    drawer, so the two never drift into different link sets or ordering.
    `onNavigate` closes the drawer on mobile; the desktop sidebar just omits
    it, since there's nothing there that needs closing. */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  return (
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
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2.5 rounded-[var(--radius)] px-3 text-sm transition-colors',
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
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius)] px-3 text-sm text-muted-foreground"
        >
          <Home className="size-4 shrink-0" aria-hidden />
          {t('backToShop')}
        </Link>
      </div>
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const tAdmin = useTranslations('admin');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Belt-and-braces: `onNavigate` on each link already closes the drawer,
  // but a browser back/forward tap doesn't fire that handler. Adjusted
  // during render (React's own pattern for "reset state when a dependency
  // changes") rather than in an effect, which would cost an extra render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-secondary">
      {/* The sidebar is hidden when printing — the picklist is printed on
          paper and carried to the market, and a nav column would waste a
          third of the page. */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block print:hidden">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-bold">Get Fresh</p>
            <p className="text-xs text-muted-foreground">{tAdmin('title')}</p>
          </div>
          <NotificationBell align="left" />
        </div>

        <NavList />
      </aside>

      <div className="min-w-0 flex-1">
        {/* The client's reference for "a normal mobile menu": a compact top
            bar (hamburger, title, bell) with the same section list as the
            desktop sidebar opening as a slide-over drawer — not the
            horizontally-scrolling pill row this replaces, which read as a
            broken/custom scrollbar rather than a recognisable nav. */}
        <header className="flex h-14 items-center gap-1 border-b border-border bg-card px-2 lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={tAdmin('nav.openMenu')}
            aria-expanded={menuOpen}
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-bold">Get Fresh</p>
          <NotificationBell />
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label={tAdmin('nav.closeMenu')}
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-sm font-bold">Get Fresh</p>
                  <p className="text-xs text-muted-foreground">{tAdmin('title')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label={tAdmin('nav.closeMenu')}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                >
                  <X className="size-4.5" aria-hidden />
                </button>
              </div>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        <main className="p-4 lg:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}

/** Shared heading, so every admin screen looks like the same product.
    `backHref` is optional — only detail pages (drilled into from a list,
    e.g. an order) need it; every existing list-screen caller is unaffected. */
export function AdminPageHeader({
  title,
  subtitle,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 print:mb-3">
      <div className="flex min-w-0 items-start gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary print:hidden"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {/* `flex-wrap`: the outer header already wraps the action block as a
          whole onto its own line, but the action's own children (e.g.
          picklist-screen.tsx's date input + CSV link + print button) still
          laid out in one unbreakable row with nothing to stop them
          overflowing a phone's content width — this is what let that row
          push the whole page into horizontal scroll on mobile. */}
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{action}</div>
      )}
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
