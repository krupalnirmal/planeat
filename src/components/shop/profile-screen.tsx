'use client';

import { useMutation } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  Download,
  FileText,
  HeartPulse,
  LogOut,
  MapPin,
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
  ] as const;

  const laterRows = [
    { key: 'healthProfile', icon: HeartPulse, phase: 4 },
    { key: 'notifications', icon: Bell, phase: 9 },
    { key: 'medicalDisclaimer', icon: Stethoscope, phase: 10 },
    { key: 'terms', icon: FileText, phase: 10 },
    { key: 'privacy', icon: ShieldCheck, phase: 10 },
  ] as const;

  return (
    <>
      <PageHeader title={t('title')} />
      <main className="space-y-2 pb-2">
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

        {laterRows.map(({ key, icon: Icon, phase }) => (
          <li key={key}>
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left opacity-55"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t(key)}</span>
              <span className="text-[10px] text-muted-foreground">P{phase}</span>
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
