'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, List, PartyPopper, ShoppingBasket } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/shop/page-header';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DAYS, usePlanDraft } from './plan-draft-context';

/** Wizard screens 9–10: the weekly review, then the real save (the only
    point in the whole wizard that actually writes to the server), then a
    success confirmation. */
export function WeeklySummaryScreen() {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const draft = usePlanDraft();

  const [view, setView] = useState<'week' | 'list'>('week');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ plan: unknown }>(`/api/meal-plan/current${qs({ locale })}`, {
        days: draft.buildSavePayload(),
      }),
    onSuccess: () => {
      setSaveError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['meal-plan-current'] });
    },
    onError: (err) => setSaveError(err instanceof ApiClientError ? err.message : te('generic')),
  });

  if (draft.loading) {
    return (
      <>
        <PageHeader title={t('title')} backHref="/meal-plan/build" backLabel={tc('back')} />
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  if (saved) {
    return <SavedScreen daysCount={DAYS.filter((d) => draft.itemCount(d) > 0).length} />;
  }

  const weekTotal = draft.weekTotalPaise();
  const weekItems = draft.weekItemCount();

  return (
    <>
      <PageHeader title={t('title')} backHref="/meal-plan/build" backLabel={tc('back')} />
      <main className="space-y-4 p-4 pb-28 lg:mx-auto lg:max-w-2xl">
        <div className="flex rounded-[var(--radius)] border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView('week')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-4px)] py-2 text-xs font-bold',
              view === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            {tw('weekView')}
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-4px)] py-2 text-xs font-bold',
              view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <List className="size-3.5" aria-hidden />
            {tw('listView')}
          </button>
        </div>

        {view === 'week' ? (
          <div className="grid grid-cols-2 gap-2.5">
            {DAYS.map((day) => (
              <DayTile key={day} dayOfWeek={day} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card">
            {DAYS.map((day) => (
              <DayRow key={day} dayOfWeek={day} />
            ))}
          </ul>
        )}

        {saveError && (
          <p className="rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">{saveError}</p>
        )}

        <div className="flex items-center justify-between rounded-[var(--radius)] bg-secondary px-4 py-3 text-sm font-bold">
          <span>
            {tw('totalDays', { days: DAYS.filter((d) => draft.itemCount(d) > 0).length })} ·{' '}
            {tw('itemCount', { count: weekItems })}
          </span>
          <span>{formatPaise(weekTotal)}</span>
        </div>
      </main>

      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={weekItems === 0 || save.isPending}
          onClick={() => save.mutate()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? tc('loading') : tw('confirmSave')}
        </button>
      </div>
    </>
  );
}

function DayTile({ dayOfWeek }: { dayOfWeek: number }) {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const draft = usePlanDraft();
  const count = draft.itemCount(dayOfWeek);

  return (
    <Link
      href={`/meal-plan/build/${dayOfWeek}`}
      className={cn(
        'rounded-[var(--radius)] border p-3',
        count > 0 ? 'border-primary bg-tint-green' : 'border-border bg-card',
      )}
    >
      <p className="text-sm font-bold">{t(`daysShort.${dayOfWeek}`)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{tw('itemCount', { count })}</p>
      {count > 0 && <p className="mt-1 text-sm font-bold">{formatPaise(draft.dayTotalPaise(dayOfWeek))}</p>}
    </Link>
  );
}

function DayRow({ dayOfWeek }: { dayOfWeek: number }) {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const draft = usePlanDraft();
  const count = draft.itemCount(dayOfWeek);

  return (
    <li>
      <Link href={`/meal-plan/build/${dayOfWeek}`} className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t(`days.${dayOfWeek}`)}</p>
          <p className="text-xs text-muted-foreground">{tw('itemCount', { count })}</p>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && <span className="text-sm font-bold">{formatPaise(draft.dayTotalPaise(dayOfWeek))}</span>}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

function SavedScreen({ daysCount }: { daysCount: number }) {
  const tw = useTranslations('mealPlan.wizard');
  const draft = usePlanDraft();

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-success/10 text-success">
        <PartyPopper className="size-10" aria-hidden />
      </span>
      <h1 className="text-xl font-black">{tw('savedTitle')}</h1>
      <p className="text-sm text-muted-foreground">{tw('savedSubtitle')}</p>

      <div className="mt-2 grid w-full grid-cols-3 gap-2 rounded-[var(--radius-2xl)] bg-card p-4 text-center">
        <Stat value={String(daysCount)} label={tw('statDays')} />
        <Stat value={String(draft.weekItemCount())} label={tw('statItems')} />
        <Stat value={formatPaise(draft.weekTotalPaise(), { hidePaise: true })} label={tw('statTotal')} />
      </div>

      <Link
        href="/meal-plan"
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
      >
        {tw('viewMyPlan')}
      </Link>
      <Link
        href="/"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border text-sm font-bold"
      >
        <ShoppingBasket className="size-4" aria-hidden />
        {tw('continueShopping')}
      </Link>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-base font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
