'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { INTRO_SEEN_FLAG } from '@/lib/auth/intro-flag';

/**
 * Sends a brand-new device through splash → onboarding → select language
 * exactly once, on its very first hit of the home page. Anyone who already
 * has the flag (or is deep-linking into a specific product/category/order)
 * lands straight in the shop, same as today — this only intercepts the bare
 * "/" landing.
 */
export function FirstVisitGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== '/') return;
    if (window.localStorage.getItem(INTRO_SEEN_FLAG)) return;
    router.replace('/splash');
  }, [pathname, router]);

  return null;
}
