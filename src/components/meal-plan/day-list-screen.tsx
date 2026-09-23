'use client';

import { CalendarCheck, ChevronLeft, ChevronRight, Leaf, Salad } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { DAY_STYLE } from './day-style';
import { MealPlanHero } from './meal-plan-hero';
import { DAYS, usePlanDraft } from './plan-draft-context';

/**
 * Wizard screen 2 — pick a day to add items for. Restyled (session
 * 2026-09-23, client reference screenshot) from a plain bordered list to a
 * green-tinted hero header (`MealPlanHero`, shared with the weekly-summary
 * screen) + colour-badged day rows + an illustrated "plan your week" strip,
 * matching the reference's warmer, more decorated look.
 *
 * The underlying plan is a recurring weekly template (`MealPlanDay.
 * dayOfWeek`, not a specific calendar date — the same Monday repeats every
 * week), so this deliberately shows day names only, not the calendar dates
 * the reference mockup pairs them with — showing "18 Aug" would
 * misrepresent a plan that isn't tied to one week.
 *
 * The per-day colour/icon badges come from the shared `DAY_STYLE` map
 * (`day-style.ts`) — see that file's own doc comment on why they're real
 * lucide icons, not the reference's own per-day food photos.
 */

export function DayListScreen() {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const draft = usePlanDraft();

  if (draft.loading) {
    return (
      <>
        <header className="card-3d sticky top-0 z-30 flex items-center gap-2 bg-card px-3 py-3">
          <Link href="/meal-plan" aria-label={tc('back')} className="grid size-11 shrink-0 place-items-center rounded-full">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <h1 className="text-base font-bold">{t('title')}</h1>
        </header>
        <main className="px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</main>
      </>
    );
  }

  return (
    <>
      <MealPlanHero title={t('title')} subtitle={tw('selectDayHint')} backHref="/meal-plan" />

      <main className="space-y-3 p-4 pb-24 lg:mx-auto lg:max-w-2xl">
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-2xl)] border border-border">
          {DAYS.map((day) => {
            const count = draft.itemCount(day);
            const style = DAY_STYLE[day];
            const Icon = style.icon;
            return (
              <li key={day} style={{ backgroundColor: `${style.bg}80` }}>
                <Link href={`/meal-plan/build/${day}`} className="flex items-center gap-3 px-3 py-3">
                  {/* Colour-badged day mark (session 2026-09-23, client
                      reference) — a small "calendar" card: a solid-colour
                      top band carrying the day's short name, a tinted
                      bottom half carrying a real lucide food icon (see this
                      file's own doc comment on why an icon, not a photo). */}
                  <span className="grid w-14 shrink-0 overflow-hidden rounded-[14px] text-center shadow-sm">
                    <span
                      className="py-1 text-[9px] leading-tight font-bold text-white"
                      style={{ backgroundColor: style.solid }}
                    >
                      {t(`daysShort.${day}`)}
                    </span>
                    <span className="grid place-items-center bg-card py-2">
                      <Icon className="size-5 shrink-0" style={{ color: style.solid }} aria-hidden />
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{t(`days.${day}`)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tw('dayRowHint')}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={
                        count > 0
                          ? 'rounded-full bg-tint-green px-2.5 py-0.5 text-xs font-bold text-primary-dark'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {tw('itemCount', { count })}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* "Plan your week" strip (session 2026-09-23, client reference) —
            grew from a single tinted line with a small inline leaf icon
            into a fuller card: a solid leaf-mark badge, a real subtitle
            line, and a bowl icon standing in for the reference's own
            illustrated salad bowl. */}
        <div
          className="relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-2xl)] px-4 py-4"
          style={{ background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)' }}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-dark text-white">
            <Leaf className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-primary-dark">{tw('planWeekTip')}</p>
            <p className="mt-0.5 truncate text-xs text-primary-dark/70">{tw('planWeekTipSubtitle')}</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card/70 text-primary-dark">
            <Salad className="size-6" aria-hidden />
          </span>
        </div>
      </main>

      {draft.weekItemCount() > 0 && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-16 py-4"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <Link
            href="/meal-plan/build/summary"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
          >
            <CalendarCheck className="size-4 shrink-0" aria-hidden />
            {tw('viewPlan', { count: draft.weekItemCount() })}
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </div>
      )}
    </>
  );
}
