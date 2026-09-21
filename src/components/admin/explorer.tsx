'use client';

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Admin dashboard v2 (session 2026-09-18) — the shared master-detail
 * primitives every one of the 8 dashboard tabs (Orders/Revenue/Deliveries/
 * Payments/Customers/Plans/Inventory/Complaints) is built from: a tab-pill
 * row, a real "Showing X–Y of Z" pagination control (every admin list API
 * already returns page/perPage/total/hasMore via `paginate()` — no UI ever
 * consumed it), and a date-range dropdown (previously only bare pill
 * presets or a native `<input type="date">` existed anywhere in admin).
 *
 * `ExplorerSplit` is the two-pane layout: a list on the left and a detail
 * panel on the right that's always visible on desktop and becomes a
 * full-screen overlay on mobile — the same overlay mechanic `AdminShell`'s
 * own mobile nav drawer already uses, not a new pattern.
 */

export interface ExplorerTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function ExplorerTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: ExplorerTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              // `rounded-full` (session 2026-09-21, new client reference) —
              // was `rounded-[var(--radius)]`, the app's standard medium
              // radius; the reference shows full capsule pills.
              'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'border-primary bg-tint-green text-primary-dark'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const RANGE_KEYS = ['today', 'yesterday', '7d', '14d', '30d', 'month'] as const;
export type ExplorerRange = (typeof RANGE_KEYS)[number];

/** Every dashboard-v2 tab's date filter — presets only, no calendar widget
    (the reference's "Today ▾" is a dropdown of presets, not a date-picker
    UI, and nothing like that exists anywhere in this codebase to build on). */
export function DateRangeDropdown({
  value,
  onChange,
  keys = RANGE_KEYS,
}: {
  value: ExplorerRange;
  onChange: (value: ExplorerRange) => void;
  /** Narrows the dropdown's own option list — the Analytics tab's header
      dropdown only offers 14d/30d/month (session 2026-09-20), not the full
      today/yesterday/7d/14d/30d/month set every other tab's own
      `DateRangeDropdown` shows. Defaults to the full set. */
  keys?: readonly ExplorerRange[];
}) {
  const t = useTranslations('admin.explorer.range');
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold"
      >
        <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
        {t(value)}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 z-50 mt-1 w-44 rounded-[var(--radius)] border border-border bg-card py-1 shadow-lg">
            {keys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-secondary',
                  key === value && 'font-semibold text-primary',
                )}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** UTC-based `YYYY-MM-DD` day-key strings — same convention `parseDateKey`
    and every other admin date filter already use, not a new one. */
export function rangeToDateParams(range: ExplorerRange): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  function daysAgoKey(n: number): string {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  switch (range) {
    case 'today':
      return { dateFrom: todayKey, dateTo: todayKey };
    case 'yesterday': {
      const y = daysAgoKey(1);
      return { dateFrom: y, dateTo: y };
    }
    case '7d':
      return { dateFrom: daysAgoKey(6), dateTo: todayKey };
    case '14d':
      return { dateFrom: daysAgoKey(13), dateTo: todayKey };
    case '30d':
      return { dateFrom: daysAgoKey(29), dateTo: todayKey };
    case 'month': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { dateFrom: first.toISOString().slice(0, 10), dateTo: todayKey };
    }
  }
}

export function ExplorerPagination({
  page,
  perPage,
  total,
  onPageChange,
}: {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('admin.explorer');
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{t('showing', { from, to, total })}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('prevPage')}
          className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {page}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('nextPage')}
          className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The two-pane layout every tab renders into. `detail` is `null` when
    nothing's selected — the list then takes the full width on desktop and
    there's nothing to overlay on mobile. `detailOpen` only matters below
    `lg`: it toggles the full-screen overlay; desktop always shows a
    non-null panel via the sticky right column regardless of this flag. */
export function ExplorerSplit({
  list,
  detail,
  detailOpen,
  onCloseDetail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode | null;
  detailOpen: boolean;
  onCloseDetail: () => void;
}) {
  return (
    <div className={cn('mt-4 grid items-start gap-4', detail && 'lg:grid-cols-[1fr_380px]')}>
      <div className={cn(detailOpen && detail && 'hidden lg:block')}>{list}</div>

      {detail && (
        <div
          className={cn(
            'card-3d bg-card',
            detailOpen
              ? 'fixed inset-0 z-40 overflow-y-auto rounded-none border-0 lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100dvh-3rem)] lg:rounded-[var(--radius)] lg:border lg:border-border/60'
              : 'hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:rounded-[var(--radius)] lg:border lg:border-border/60',
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-end border-b border-border bg-card p-2">
            <button
              type="button"
              onClick={onCloseDetail}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X className="size-4.5" aria-hidden />
            </button>
          </div>
          {detail}
        </div>
      )}
    </div>
  );
}

export function ExplorerEmpty({ label }: { label: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}
