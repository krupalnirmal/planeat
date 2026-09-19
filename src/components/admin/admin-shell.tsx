'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Bike,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  FileClock,
  Home,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Package,
  Salad,
  Search,
  Settings,
  ShoppingBag,
  Sprout,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { NotificationBell } from '@/components/admin/notification-bell';
import { useInvalidateSession, useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
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
  { href: '/admin/meal-plans', key: 'mealPlans', icon: Salad },
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

/** The header's global search (session 2026-09-17) — scoped to Orders for
    now, the only admin list with a real free-text filter already
    (`listAdminOrders`, matches order number/customer name/phone); this
    submits into it rather than pretending to search customers/catalogue
    too, which have no such filter yet. Cmd/Ctrl+K focuses it from
    anywhere in the admin panel. */
function AdminSearchBox() {
  const t = useTranslations('admin.nav');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] border border-border bg-secondary/60 px-3"
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        if (q) router.push(`/admin/orders?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <kbd className="hidden shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
        ⌘K
      </kbd>
    </form>
  );
}

const ROLE_LABEL_KEY: Record<string, string> = {
  STORE_ADMIN: 'roleStoreAdmin',
  SUPER_ADMIN: 'roleSuperAdmin',
  DELIVERY_PARTNER: 'roleDeliveryPartner',
};

/** The real logged-in admin (session 2026-09-17) — name/role from the same
    `useSession()` every other part of the app already uses, not a static
    mock. Logout mirrors the delivery header's own mutation
    (`src/components/delivery/header.tsx`), redirecting to `/staff/login`
    instead of the customer `/login`. */
function ProfileMenu() {
  const t = useTranslations('admin.nav');
  const router = useRouter();
  const invalidateSession = useInvalidateSession();
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: async () => {
      await invalidateSession();
      router.replace('/staff/login');
    },
  });

  const name = user?.name ?? user?.phone ?? '';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-secondary"
        aria-expanded={open}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block truncate text-xs font-semibold text-foreground">{name}</span>
          <span className="block text-[10px] text-muted-foreground">
            {user ? t(ROLE_LABEL_KEY[user.role] ?? 'roleStoreAdmin') : ''}
          </span>
        </span>
        <ChevronDown className="hidden size-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t('closeMenu')}
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-50 mt-1 w-44 rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-secondary"
            >
              <LogOut className="size-4" aria-hidden />
              {t('logout')}
            </button>
          </div>
        </>
      )}
    </div>
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
    // White page background (client feedback, session 2026-09-17) — cards
    // now read as raised via `.card-3d`'s shadow rather than sitting on a
    // tinted page to separate them.
    <div className="admin-shell flex min-h-dvh bg-background">
      {/* The sidebar is hidden when printing — the picklist is printed on
          paper and carried to the market, and a nav column would waste a
          third of the page. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card lg:flex print:hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-bold">
            <span className="text-primary-dark">Get</span> <span className="text-primary">Fresh</span>
          </p>
          <p className="text-[11px] text-muted-foreground">{tAdmin('nav.tagline')}</p>
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-y-auto">
          <NavList />

          {/* Cosmetic branding, matching the client's reference — not tied
              to any data. */}
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2.5 rounded-[var(--radius)] bg-tint-green px-3 py-3">
              <Sprout className="size-6 shrink-0 text-primary" aria-hidden />
              <p className="text-xs leading-tight font-semibold text-primary-dark">
                {tAdmin('nav.promoTitle')}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Full-width top bar, desktop only — search + notifications +
            the real logged-in admin's own profile, matching the client's
            reference. Export/date-range stay on the dashboard page itself
            (AdminPageHeader's action slot) since they're dashboard-specific,
            not chrome every admin screen needs. */}
        <header className="hidden h-16 items-center gap-4 border-b border-border bg-card px-6 lg:flex print:hidden">
          <AdminSearchBox />
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell align="right" />
            <ProfileMenu />
          </div>
        </header>

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
          <p className="min-w-0 flex-1 truncate text-sm font-bold">
            <span className="text-primary-dark">Get</span> <span className="text-primary">Fresh</span>
          </p>
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
                  <p className="text-sm font-bold">
            <span className="text-primary-dark">Get</span> <span className="text-primary">Fresh</span>
          </p>
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
    <div className="card-3d overflow-x-auto rounded-[var(--radius)] border border-border/60 bg-card">
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

/** The mobile-responsive answer to `AdminTable` (session 2026-09-18): the
    same `<table>` above `lg`, unchanged — desktop rendering never
    regresses — and a caller-supplied card list below it, since a dense
    many-column table has no honest way to reflow to a phone width. Each
    screen writes its own small card (its columns carry different priority —
    an order card leads with status/total, a catalogue card leads with a
    photo — so this isn't a generic "auto-render columns" engine, just the
    show/hide split every screen would otherwise duplicate). */
export function AdminResponsiveTable({
  table,
  cards,
}: {
  table: React.ReactNode;
  cards: React.ReactNode;
}) {
  return (
    <>
      <div className="hidden lg:block">
        <AdminTable>{table}</AdminTable>
      </div>
      <ul className="flex flex-col gap-2.5 lg:hidden">{cards}</ul>
    </>
  );
}
