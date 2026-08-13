'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useInvalidateSession } from '@/hooks/use-session';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

/**
 * M10 — "Phone + OTP login, availability toggle." The toggle lives in the
 * header because it is the one control a rider needs reachable from every
 * screen in this app, not just the dashboard.
 */
export function DeliveryHeader() {
  const t = useTranslations('delivery');
  const router = useRouter();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['delivery-me'],
    queryFn: () => api.get<{ name: string | null; isAvailable: boolean }>('/api/delivery/me'),
  });

  const toggle = useMutation({
    mutationFn: (isAvailable: boolean) =>
      api.patch<{ isAvailable: boolean }>('/api/delivery/availability', { isAvailable }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['delivery-me'] }),
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
        {me.data?.name && <p className="truncate text-[11px] opacity-80">{me.data.name}</p>}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs font-medium">
          <span>{t('available')}</span>
          <input
            type="checkbox"
            checked={me.data?.isAvailable ?? false}
            onChange={(event) => toggle.mutate(event.target.checked)}
            disabled={me.isLoading}
            className="size-4 accent-white"
          />
        </label>
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
