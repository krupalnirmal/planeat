'use client';

import { Leaf } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { INTRO_SEEN_FLAG } from '@/lib/auth/intro-flag';

/**
 * The first screen a first-time visitor sees (wired up from the home page
 * via `FirstVisitGate`) — a brief, non-interactive brand moment before the
 * onboarding carousel, matching the client's reference exactly. It advances
 * itself so nobody is stuck looking at a logo; a tap skips ahead immediately
 * for anyone who doesn't want to wait.
 */
const AUTO_ADVANCE_MS = 1800;

export function SplashScreen() {
  const t = useTranslations('intro');
  const ta = useTranslations('app');
  const router = useRouter();

  useEffect(() => {
    window.localStorage.setItem(INTRO_SEEN_FLAG, '1');
    const timer = setTimeout(() => router.replace('/onboarding'), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main
      onClick={() => router.replace('/onboarding')}
      className="flex min-h-dvh flex-col items-center justify-between bg-background px-6 py-14 text-center"
    >
      <span aria-hidden />

      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1.5">
          <Leaf className="size-9 -rotate-12 text-primary" aria-hidden />
          <p className="text-4xl font-black tracking-tight">
            <span className="text-primary-dark">Plan</span>
            <span className="text-primary">eat</span>
          </p>
        </div>

        <h1 className="mt-6 text-2xl leading-snug font-black text-balance">{ta('tagline')}</h1>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/promo/veg-basket-hero.jpg"
          alt=""
          aria-hidden
          className="mt-10 w-full max-w-[280px] rounded-[var(--radius)]"
        />
      </div>

      <p className="flex items-center gap-1.5 text-sm font-bold text-primary-dark">
        <Leaf className="size-4" aria-hidden />
        {t('splashFooter')}
      </p>
    </main>
  );
}
