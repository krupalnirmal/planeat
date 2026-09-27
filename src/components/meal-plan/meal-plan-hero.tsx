import { ChevronLeft, Salad } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * The green-tinted hero header used by the meal-plan wizard's weekly-summary
 * screen (session 2026-09-23, client reference screenshot; the old day-list
 * screen shared this component too before it was dropped, session
 * 2026-09-27) — a back link, a leaf-mark icon, a title/subtitle pair, and a
 * decorative handwritten-style tagline + real hero photo on wider screens.
 * Kept as its own component rather than inlined, in case a future wizard
 * screen needs the identical treatment again.
 */

// The client's own real hero photo, already cropped for this wizard's
// screen 1 (`meal-plan-screen.tsx`'s own `HERO_IMAGE`) — reused here rather
// than sourcing more stock photos, so every screen in the flow carries the
// same real image instead of several different ones.
const HERO_IMAGE =
  'https://res.cloudinary.com/kf9nvvpv/image/upload/v1789846982/planeat/meal-plan-home/meal-plan-home-hero.png';

export function MealPlanHero({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle: string;
  backHref: string;
}) {
  const tw = useTranslations('mealPlan.wizard');
  const tc = useTranslations('common');

  return (
    <div
      className="relative overflow-hidden px-4 pt-4 pb-5"
      style={{ background: 'linear-gradient(120deg, var(--brand-tint-green) 0%, var(--brand-tint-yellow) 100%)' }}
    >
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          aria-label={tc('back')}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-card/70 text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>

        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Salad className="size-4.5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl leading-tight font-black text-foreground">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>

        <p
          aria-hidden
          className="hidden shrink-0 -rotate-3 text-right font-serif text-xs leading-tight whitespace-pre-line text-primary-dark/60 italic sm:block"
        >
          {tw('dayListTagline')}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          className="hidden h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md sm:block"
        />
      </div>
    </div>
  );
}
