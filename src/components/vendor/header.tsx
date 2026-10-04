'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePushAlerts } from '@/hooks/use-push-alerts';
import { useInvalidateSession } from '@/hooks/use-session';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/**
 * Mirrors `src/components/delivery/header.tsx` — no availability toggle
 * here, though: a vendor has no on/off shift concept the way a rider does.
 */
export function VendorHeader() {
  const t = useTranslations('vendor');
  const router = useRouter();
  const invalidateSession = useInvalidateSession();

  const me = useQuery({
    queryKey: ['vendor-me'],
    queryFn: () => api.get<{ businessName: string; balancePaise: string }>('/api/vendor/me'),
  });

  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: async () => {
      await invalidateSession();
      router.replace('/login');
    },
  });

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t('appTitle')}</p>
        {me.data?.businessName && <p className="truncate text-[12px] opacity-80">{me.data.businessName}</p>}
      </div>
      <div className="flex items-center gap-3">
        <PushAlertsButton />
        <button
          type="button"
          onClick={() => logout.mutate()}
          aria-label={t('logout')}
          className="grid size-11 place-items-center rounded-full"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}

/** Same pattern as the delivery header's own button — see its comment. */
function PushAlertsButton() {
  const t = useTranslations('vendor');
  const { status, enable } = usePushAlerts();

  if (status === 'unsupported') return null;

  if (status === 'enabled') {
    return (
      <span aria-label={t('alertsEnabled')} title={t('alertsEnabled')} className="grid size-11 place-items-center">
        <BellRing className="size-4" aria-hidden />
      </span>
    );
  }

  if (status === 'denied') {
    return (
      <span aria-label={t('alertsBlocked')} title={t('alertsBlocked')} className="grid size-11 place-items-center opacity-50">
        <BellOff className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={status === 'enabling'}
      aria-label={t('enableAlerts')}
      title={t('enableAlerts')}
      className="grid size-11 place-items-center rounded-full disabled:opacity-50"
    >
      <Bell className="size-4" aria-hidden />
    </button>
  );
}
