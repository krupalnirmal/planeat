'use client';

import { CalendarCheck, ChevronLeft, ChevronRight, Leaf, Salad } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/shop/app-header';
import { Link } from '@/i18n/navigation';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DAY_STYLE } from './day-style';
import { MealPlanHero } from './meal-plan-hero';
import { DAYS, usePlanDraft } from './plan-draft-context';

/**
 * Wizard screen 2 — pick a day to add items for. Restyled again (session
 * 2026-09-24, client reference screenshots) from a single-column list of
 * colour-badged rows to a 2-column grid of day cards showing each day's own
 * item count and running total, reusing the weekly-summary screen's own
 * `DayTile` look (`weekly-summary-screen.tsx`) so both screens in the
 * wizard read as one consistent "week at a glance" system — the reference's
 * own "Week View" screen shows exactly this card shape as the very first
 * thing after tapping into My Meal Plan, not just on the final review.
 *
 * The underlying plan is a recurring weekly template (`MealPlanDay.
 * dayOfWeek`, not a specific calendar date — the same Monday repeats every
 * week), so this deliberately shows day names only, not the calendar dates
 * the reference mockup pairs them with — showing "18 Aug" would
 * misrepresent a plan that isn't tied to one week.
 */

export function DayListScreen() {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');
  const draft = usePlanDraft();

  if (draft.loading) {
    return (
      <>
        <AppHeader />
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
      {/* Same storefront header every wizard screen now carries (session
          2026-09-24, client reference) — logo, wallet/cart/profile, the
          deliver-to bar — sitting above the green wizard band rather than
          replacing it. */}
      <AppHeader />
      <MealPlanHero title={t('title')} subtitle={tw('selectDayHint')} backHref="/meal-plan" />

      <main className="space-y-3 p-4 pb-24 lg:mx-auto lg:max-w-2xl">
        <div className="grid grid-cols-2 gap-2.5">
          {DAYS.map((day) => (
            <DayTile key={day} dayOfWeek={day} />
          ))}
        </div>

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

// Same colour-badged card as `weekly-summary-screen.tsx`'s own `DayTile`
// (kept local rather than imported/shared — this screen and the summary
// screen are two different steps in the wizard that happen to want the
// same look, not one component with two callers) — a tinted-when-picked
// card with the day name, item count, running total, and a `DAY_STYLE`
// icon badge, matching the reference's "Week View" card shape.
function DayTile({ dayOfWeek }: { dayOfWeek: number }) {
  const t = useTranslations('mealPlan');
  const tw = useTranslations('mealPlan.wizard');
  const draft = usePlanDraft();
  const count = draft.itemCount(dayOfWeek);
  const style = DAY_STYLE[dayOfWeek];
  const Icon = style.icon;

  return (
    <Link
      href={`/meal-plan/build/${dayOfWeek}`}
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius)] border p-3',
        count > 0 ? 'border-primary bg-tint-green' : 'border-border bg-card',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{t(`daysShort.${dayOfWeek}`)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tw('itemCount', { count })}</p>
        {count > 0 && <p className="mt-1 text-sm font-bold">{formatPaise(draft.dayTotalPaise(dayOfWeek))}</p>}
      </div>
      <span className="grid size-12 shrink-0 place-items-center rounded-full" style={{ backgroundColor: style.bg }}>
        <Icon className="size-6 shrink-0" style={{ color: style.solid }} aria-hidden />
      </span>
    </Link>
  );
}
