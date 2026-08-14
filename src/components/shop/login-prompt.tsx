import { ArrowRight, Bike, Leaf, Lock, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// The same basket photo the client supplied for splash/onboarding/login —
// one consistent hero image across the app instead of two different baskets.
const VEG_BASKET_URL = '/promo/veg-basket-hero.jpg';

/**
 * The "please log in" screen every gated tab shares (wallet, orders,
 * addresses, meal plan, smart list, guest cart) — a tinted hero band naming
 * the screen, a lock icon and CTA, and the same trust strip and promo card
 * everywhere, so logging in reads as one consistent moment in the app
 * instead of a different bare prompt on every tab.
 */
export function LoginPrompt({
  icon: BandIcon,
  title,
  bandSubtitle,
  description,
  loginHref,
}: {
  icon: LucideIcon;
  title: string;
  bandSubtitle: string;
  description: string;
  loginHref: string;
}) {
  const te = useTranslations('errors');
  const t = useTranslations('loginPrompt');

  return (
    <main className="pb-2">
      <div className="relative overflow-hidden bg-tint-green px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
            <BandIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-primary-dark">{title}</h1>
            <p className="text-xs leading-snug text-muted-foreground">{bandSubtitle}</p>
          </div>
        </div>

        <div className="pointer-events-none absolute top-1/2 right-3 size-24 -translate-y-1/2 overflow-hidden rounded-full border-4 border-card shadow-md sm:size-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={VEG_BASKET_URL} alt="" aria-hidden className="size-full object-cover" />
        </div>
        <span className="pointer-events-none absolute top-3 right-24 grid size-7 -rotate-12 place-items-center rounded-full bg-card/70 shadow-sm sm:right-28">
          <Leaf className="size-3.5 text-primary" aria-hidden />
        </span>
      </div>

      <div className="bg-card px-6 py-10">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-16 place-items-center rounded-full bg-tint-green">
            <Lock className="size-7 text-primary" aria-hidden />
          </span>
          <p className="mt-4 text-xl font-black">{te('unauthorized')}</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>

          <Link
            href={loginHref}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
          >
            <ArrowRight className="size-4" aria-hidden />
            {t('cta')}
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2">
          {(
            [
              [ShieldCheck, 'trustSecure'],
              [Bike, 'trustFast'],
              [Leaf, 'trustFresh'],
            ] as const
          ).map(([Icon, key]) => (
            <div key={key} className="flex flex-col items-center gap-1.5 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-tint-green text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <p className="text-[11px] leading-tight font-bold">{t(`${key}Title`)}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{t(`${key}Body`)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-[var(--radius)] bg-tint-green p-3">
          <span className="size-14 shrink-0 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={VEG_BASKET_URL} alt="" aria-hidden className="size-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-primary-dark">{t('promoTitle')}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t('promoBody')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
