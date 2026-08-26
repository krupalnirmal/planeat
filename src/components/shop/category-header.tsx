'use client';

import { ChevronDown, ChevronLeft, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { useDeliveryArea } from '@/stores/delivery-area';

/**
 * Category page header (session 2026-08-26, client's reference): "Delivery
 * in N min" as the headline, the delivery address underneath instead of an
 * item count, and a search icon instead of the cart icon this replaced —
 * the cart stays reachable via the floating CartBar, which already shows on
 * every shop screen once there's something in it.
 *
 * The address line reuses AppHeader's own logic (default saved address,
 * falling back to whatever area was checked pre-login) rather than
 * reinventing it — same source of truth, so the two headers never disagree.
 */
export function CategoryHeader() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const tCat = useTranslations('categories');
  const { defaultAddress } = useSession();
  const rememberedArea = useDeliveryArea((s) => s.areaName ?? s.pincode);

  const addressLine = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.line1}`
    : (rememberedArea ?? t('selectAddress'));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card px-3 pt-3 pb-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label={tc('back')}
          className="grid size-9 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-bold">
            {t('deliveryIn', { minutes: 30 })}
          </p>
          <Link
            href={defaultAddress ? '/addresses' : '/serviceability'}
            className="mt-0.5 flex max-w-full items-center gap-1"
          >
            <span className="truncate text-[12px] text-muted-foreground">{addressLine}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </div>

        <Link
          href="/search"
          aria-label={tCat('search')}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border"
        >
          <Search className="size-4" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
