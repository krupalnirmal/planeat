'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  BellRing,
  ChevronRight,
  Download,
  FileText,
  HeartPulse,
  LogOut,
  MapPin,
  MessageSquareWarning,
  Package,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/shop/language-switcher';
import { PageHeader } from '@/components/shop/page-header';
import { usePushAlerts } from '@/hooks/use-push-alerts';
import { useInvalidateSession, useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';

/**
 * Profile screen.
 *
 * Rows that a later phase owns are rendered but disabled, so the shape of the
 * app is visible without pretending a screen exists. Everything M1 promised —
 * login, logout, addresses, data export, account closure — works now.
 */
export function ProfileScreen() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const tl = useTranslations('language');
  const router = useRouter();
  const invalidateSession = useInvalidateSession();
  const { user, isLoggedIn, isLoading } = useSession();

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: async () => {
      await invalidateSession();
      router.replace('/');
    },
  });

  const closeAccount = useMutation({
    mutationFn: () => api.delete('/api/me'),
    onSuccess: async () => {
      await invalidateSession();
      router.replace('/');
    },
  });

  async function exportData() {
    const payload = await api.get<unknown>('/api/me/export');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `getfresh-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const liveRows = [
    { key: 'myOrders', icon: Package, href: '/orders' },
    { key: 'addresses', icon: MapPin, href: '/addresses' },
    { key: 'complaints', icon: MessageSquareWarning, href: '/complaints' },
    // Real pages now (session 2026-09-22, new client reference) — were
    // disabled "coming soon" rows below with no page behind them.
    { key: 'terms', icon: FileText, href: '/terms' },
    { key: 'privacy', icon: ShieldCheck, href: '/privacy' },
  ] as const;

  const laterRows = [
    { key: 'healthProfile', icon: HeartPulse },
    { key: 'medicalDisclaimer', icon: Stethoscope },
  ] as const;

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="space-y-2 pb-2 lg:mx-auto lg:max-w-2xl">
      <div className="bg-card px-4 py-4">
      <section className="flex items-center gap-3 rounded-[var(--radius)] border border-border/60 bg-background p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {user?.name?.trim().charAt(0) ?? <UserRound className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{tc('loading')}</p>
          ) : isLoggedIn ? (
            <>
              <p className="truncate text-sm font-semibold">{user?.name ?? t('guest')}</p>
              <p className="text-xs text-muted-foreground">+91 {user?.phone}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">{t('guest')}</p>
              <Link href="/login?next=/profile" className="text-xs font-semibold text-primary">
                {t('login')}
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{tl('label')}</p>
        <LanguageSwitcher />
      </section>
      </div>

      <ul className="divide-y divide-border bg-card">
        {liveRows.map(({ key, icon: Icon, href }) => (
          <li key={key}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5">
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t(key)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}

        {isLoggedIn && <NotificationsRow />}

        {laterRows.map(({ key, icon: Icon }) => (
          <li key={key}>
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left opacity-55"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t(key)}</span>
              <span className="text-[11px] text-muted-foreground">{tc('comingSoon')}</span>
            </button>
          </li>
        ))}
      </ul>

      {isLoggedIn && (
        <ul className="divide-y divide-border bg-card">
          <li>
            <button
              type="button"
              onClick={() => void exportData()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <Download className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t('exportData')}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                if (confirm(t('logoutConfirm'))) logout.mutate();
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <LogOut className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t('logout')}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                if (confirm(t('deleteAccountConfirm'))) closeAccount.mutate();
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <Trash2 className="size-5 shrink-0 text-danger" aria-hidden />
              <span className="flex-1 text-sm font-medium text-danger">{t('deleteAccount')}</span>
            </button>
          </li>
        </ul>
      )}
      </main>
    </>
  );
}

/**
 * Push notifications (session 2026-10-05) — a customer was never actually
 * asked for notification permission anywhere; this was a disabled "coming
 * soon" row with no real toggle behind it, which is why a push (e.g. an
 * admin's reply to a complaint) never arrived even on a closed app — there
 * was simply no registered `PushToken` for any customer to send to. Same
 * `usePushAlerts()` hook the vendor/delivery/admin headers already use
 * (`src/components/vendor/header.tsx`).
 */
function NotificationsRow() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { status, enable } = usePushAlerts();

  if (status === 'unsupported') return null;

  if (status === 'enabled') {
    return (
      <li>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <BellRing className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="flex-1 text-sm font-medium">{t('notifications')}</span>
          <span className="text-[11px] font-semibold text-primary">{t('notificationsEnabled')}</span>
        </div>
      </li>
    );
  }

  if (status === 'denied') {
    return (
      <li>
        <div className="flex items-center gap-3 px-4 py-3.5 opacity-70">
          <BellOff className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">{t('notifications')}</span>
          <span className="text-[11px] text-muted-foreground">{t('notificationsBlocked')}</span>
        </div>
      </li>
    );
  }

  // 'not-configured'/'error' previously fell through to the same tappable
  // "Turn on" row as 'promptable' — a retap silently failed again with no
  // visible sign anything went wrong (no permission popup even shows for
  // 'not-configured', since `enablePush()` returns before ever calling
  // `Notification.requestPermission()`). Surfaced explicitly instead, since
  // it means a real deploy problem (missing `NEXT_PUBLIC_FIREBASE_*` env
  // vars at build time), not something retapping fixes.
  if (status === 'not-configured' || status === 'error') {
    return (
      <li>
        <div className="flex items-center gap-3 px-4 py-3.5 opacity-70">
          <BellOff className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">{t('notifications')}</span>
          <span className="text-[11px] text-muted-foreground">{t('notificationsUnavailable')}</span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={status === 'enabling'}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
      >
        <Bell className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm font-medium">{t('notifications')}</span>
        <span className="text-[11px] font-semibold text-primary">
          {status === 'enabling' ? tc('loading') : t('enableNotifications')}
        </span>
      </button>
    </li>
  );
}
