'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { usePushAlerts } from '@/hooks/use-push-alerts';
import { cn } from '@/lib/utils';

/**
 * M9 — the admin bell: every store admin's own recent IN_APP notifications
 * (currently just "a new order was placed", but the shape is generic —
 * whatever else starts calling `notifyAdmins` shows up here too).
 *
 * Polls rather than pushing to the UI in real time — matches the Dashboard's
 * existing `refetchInterval` pattern (dashboard-screen.tsx), just tighter
 * (20s vs 60s) since a new order is more time-sensitive than the daily
 * metrics that screen tracks.
 */

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const t = useTranslations('admin.notifications');
  const tc = useTranslations('admin.common');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notifications = useQuery({
    queryKey: ['admin-notifications', locale],
    queryFn: () =>
      api.get<{ notifications: NotificationRow[]; unreadCount: number }>(
        `/api/admin/notifications${qs({ locale })}`,
      ),
    refetchInterval: 20_000,
  });

  const markRead = useMutation({
    mutationFn: () => api.post('/api/admin/notifications/read'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  const rows = notifications.data?.notifications ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markRead.mutate();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('title')}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
      >
        <Bell className="size-4.5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-danger text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={tc('dismiss')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          {/* `align` picks which edge the panel opens from — the bell sits in
              two very different contexts (a narrow left sidebar on desktop,
              a right-pinned icon in the mobile top bar), and a fixed edge
              here has one of them extend a 320px panel past the browser's
              own viewport edge. Desktop passes "left" (opens rightward, into
              the spacious main content area); mobile keeps the default
              "right" (opens leftward, back onto the screen). */}
          <div
            className={cn(
              'absolute top-full z-40 mt-1 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[var(--radius)] border border-border bg-card shadow-lg',
              align === 'left' ? 'left-0' : 'right-0',
            )}
          >
            <p className="border-b border-border px-3 py-2 text-xs font-bold text-muted-foreground">
              {t('title')}
            </p>
            <PushAlertsRow />
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
              <ul>
                {rows.map((row) => {
                  const content = (
                    <>
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {format.dateTime(new Date(row.createdAt), {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </>
                  );
                  return (
                    <li key={row.id} className="border-b border-border px-3 py-2.5 last:border-0">
                      {row.orderId ? (
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          onClick={() => setOpen(false)}
                          className="block hover:bg-secondary/40"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The strip that turns IN_APP-only into a real phone/browser buzz. Silent
 * (renders nothing) on a browser that doesn't support push at all, so it
 * never clutters the dropdown with an affordance nobody there can use. The
 * permission state machine itself is shared with the rider header — see
 * `usePushAlerts`.
 */
function PushAlertsRow() {
  const t = useTranslations('admin.notifications');
  const { status, enable } = usePushAlerts();

  if (status === 'unsupported') return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-xs">
      {status === 'enabled' ? (
        <>
          <BellRing className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="text-muted-foreground">{t('alertsEnabled')}</span>
        </>
      ) : status === 'denied' ? (
        <span className="text-muted-foreground">{t('alertsBlocked')}</span>
      ) : status === 'not-configured' || status === 'error' ? (
        <span className="text-muted-foreground">{t('alertsFailed')}</span>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'enabling'}
          className="flex items-center gap-1.5 font-semibold text-primary disabled:opacity-60"
        >
          {status === 'enabling' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Bell className="size-3.5" aria-hidden />
          )}
          {t('enableAlerts')}
        </button>
      )}
    </div>
  );
}
