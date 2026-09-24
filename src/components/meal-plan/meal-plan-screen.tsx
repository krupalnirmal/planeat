'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Salad, ShoppingBasket, Truck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { AppHeader } from '@/components/shop/app-header';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';

/**
 * Wizard screen 1 — "My Meal Plan" home / entry point. Restyled again
 * (session 2026-09-20, client reference — WhatsApp Image 2026-09-20 at
 * 1.01.37 AM): left-aligned two-tone header with a leaf mark and a
 * (decorative — there's no notification system behind it yet) bell, a hero
 * photo with its own baked-in "Fresh Choices" caption, and the three
 * feature cards restyled from photo-with-caption-bar tiles to icon-in-circle
 * chips on a tinted card. All 6 new photos (`meal-plan-home-*` below) are
 * cropped directly out of that reference image with sharp
 * (`scripts/upload-meal-plan-home-images.mjs`), not substituted stock —
 * same reasoning as the home page's category-tile photos.
 *
 * The reference mockup's second row — "Quick & Smart Plan", "Daily Dairy &
 * Bakery", "Your Savings & Stats" — stays built for real rather than as
 * decoration (session 2026-09-17 decision, unchanged here): the savings
 * figure is `weeklySavingsPaise` (src/lib/meal-plan/queries.ts), the actual
 * MRP-vs-price gap summed across the saved plan, not a made-up number; the
 * dairy/bakery photo is that category's own real `iconUrl` (already fetched
 * for the builder's category tabs) rather than the reference's own generic
 * dairy photo, so it stays accurate if the admin ever changes it; both
 * cards link somewhere real (the builder, and the storefront's own dairy
 * category) instead of nowhere.
 */

// The client's new reference hero banner (session 2026-09-24) — replaces the
// earlier cropped-photo hero; this one already carries its own baked-in
// "Your Intelligent Meal Plan" headline and copy, so it's served locally
// from `public/brand` like the wordmark rather than re-uploaded to
// Cloudinary as a product-style asset.
const HERO_IMAGE = '/brand/meal-plan-hero.png';
const ICON_FRESH =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846983/planeat/meal-plan-home/meal-plan-home-icon-fresh.png';
const ICON_CHOICE =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846984/planeat/meal-plan-home/meal-plan-home-icon-choice.png';
const ICON_HEALTHY =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846985/planeat/meal-plan-home/meal-plan-home-icon-healthy.png';
const QUICKPLAN_IMAGE =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846985/planeat/meal-plan-home/meal-plan-home-quickplan.png';
const SAVINGS_ICON =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846986/planeat/meal-plan-home/meal-plan-home-savings.png';

interface PlanSummary {
  plan: { days: Array<{ items: unknown[] }> } | null;
  hasActiveSubscription: boolean;
  /** Null when there's no active subscription; otherwise the mode the
      running subscription was set up with — shown as a tag next to
      "View My Subscription" (session 2026-09-25, user request — "I should
      be able to see which plan is running"). */
  activeDeliveryMode: 'DAILY' | 'WEEKLY' | null;
  weeklySavingsPaise: string;
  columns: Array<{ slug: string; iconUrl: string | null }>;
}

export function MealPlanScreen() {
  const t = useTranslations('mealPlan');
  const locale = useLocale();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const current = useQuery({
    queryKey: ['meal-plan-current', locale],
    queryFn: () => api.get<PlanSummary>(`/api/meal-plan/current${qs({ locale })}`),
    enabled: isLoggedIn,
  });

  if (sessionLoading || (isLoggedIn && current.isLoading)) {
    return (
      <>
        <AppHeader />
        <main className="px-4 py-8 text-sm text-muted-foreground">{t('title')}…</main>
      </>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <AppHeader />
        <LoginPrompt
          icon={Salad}
          title={t('title')}
          bandSubtitle={t('subtitle')}
          description={t('loginDescription')}
          loginHref="/login?next=/meal-plan"
        />
      </>
    );
  }

  const data = current.data;
  const hasSavedItems = (data?.plan?.days ?? []).some((day) => day.items.length > 0);
  const dairyImage = data?.columns.find((c) => c.slug === 'dairy')?.iconUrl ?? null;
  const savings = paise(data?.weeklySavingsPaise ?? '0');

  return (
    <>
      {/* The real storefront header — logo, wallet/cart/profile, deliver-to
          bar (session 2026-09-24, client reference) — replaces the earlier
          standalone leaf-mark/bell row + separate title text this screen
          used to draw for itself. The new hero banner below already carries
          its own baked-in "Your Intelligent Meal Plan" headline, so a
          second text title here would just repeat it; every reference
          screenshot for this wizard (home, week view, day view) shows this
          same header at the very top, not a per-screen substitute. */}
      <AppHeader />
      <main className="pb-6 lg:mx-auto lg:max-w-2xl">
      <div className="px-4 pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          className="aspect-[3/1] w-full rounded-[var(--radius-2xl)] object-cover"
        />
      </div>

      <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
        <FeatureCard image={ICON_FRESH} label={t('wizard.homeFresh')} />
        <FeatureCard image={ICON_CHOICE} label={t('wizard.homeChoice')} />
        <FeatureCard image={ICON_HEALTHY} label={t('wizard.homeHealthy')} />
      </div>

      <div className="space-y-3 px-4 pt-4">
        <Link
          href={hasSavedItems ? '/meal-plan/build/summary' : '/meal-plan/build'}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
        >
          <ShoppingBasket className="size-4" aria-hidden />
          {hasSavedItems ? t('wizard.viewMyPlanCta') : t('wizard.createMyPlanCta')}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* Screen 1's second row — a real shortcut into the builder, a real
          shortcut into the dairy/bakery shelf, and the plan's own real
          savings total, not the mockup's decorative trio. Restyled
          (session 2026-09-20) from a bordered white card with a pill-shaped
          "See Options" label to a borderless card with a small circular
          chevron button, matching the reference. */}
      <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
        <Link
          href="/meal-plan/build"
          className="card-3d flex flex-col items-center gap-2 rounded-2xl bg-card p-2.5 text-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={QUICKPLAN_IMAGE} alt="" className="aspect-[3/2] w-full rounded-xl object-cover" />
          <span className="text-[11px] leading-tight font-bold">{t('wizard.quickPlanTitle')}</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>

        <Link
          href="/category/dairy"
          className="card-3d flex flex-col items-center gap-2 rounded-2xl bg-card p-2.5 text-center"
        >
          {dairyImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dairyImage} alt="" className="aspect-[3/2] w-full rounded-xl object-cover" />
          ) : (
            <div className="aspect-[3/2] w-full rounded-xl bg-tint-green" />
          )}
          <span className="text-[11px] leading-tight font-bold">{t('wizard.dairyBakeryTitle')}</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>

        <div className="card-3d flex flex-col items-center gap-1.5 rounded-2xl bg-card p-2.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SAVINGS_ICON} alt="" className="size-14 object-contain" />
          <span className="text-[10px] leading-tight font-semibold text-muted-foreground">
            {t('wizard.savingsTitle')}
          </span>
          <span className="text-base font-black text-primary">{formatPaise(savings, { hidePaise: true })}</span>
          <span className="text-[9px] leading-tight text-muted-foreground">{t('wizard.savingsHint')}</span>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {/* Outlined pill, not a filled card (session 2026-09-20, client
            reference) — a faint tint fill with a green border and green
            text/icon, matching the reference's "Start my deliveries" row. */}
        {hasSavedItems && !data?.hasActiveSubscription && (
          <Link
            href="/meal-plan/subscribe"
            className="flex items-center justify-between gap-2 rounded-full border border-primary/40 bg-tint-green px-4 py-3 text-sm font-bold text-primary-dark"
          >
            <span className="flex items-center gap-2">
              <Truck className="size-4 shrink-0" aria-hidden />
              {t('subscribe.cta')}
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        )}

        {data?.hasActiveSubscription && (
          <Link
            href="/subscription"
            className="flex items-center justify-between gap-2 rounded-full border border-primary/40 bg-tint-green px-4 py-3 text-sm font-bold text-primary-dark"
          >
            <span className="flex items-center gap-2">
              <Truck className="size-4 shrink-0" aria-hidden />
              {t('wizard.viewSubscription')}
              {data.activeDeliveryMode && (
                <span className="rounded-full bg-primary-dark px-2 py-0.5 text-[10px] font-bold text-white">
                  {data.activeDeliveryMode === 'WEEKLY' ? t('wizard.deliveryModeWeekly') : t('wizard.deliveryModeDaily')}
                </span>
              )}
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        )}
      </div>
      </main>
    </>
  );
}

function FeatureCard({ image, label }: { image: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-tint-lime px-2 py-3.5 text-center">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="size-full object-cover" />
      </span>
      <span className="flex items-center gap-0.5 text-[11.5px] leading-tight font-bold">
        {label}
        <ChevronRight className="size-3.5 shrink-0 text-primary" aria-hidden />
      </span>
    </div>
  );
}
