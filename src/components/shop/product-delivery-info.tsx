'use client';

import { ChevronRight, Leaf, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { useDeliveryArea } from '@/stores/delivery-area';

/**
 * The PDP's delivery/quality info box (session 2026-09-21, client
 * reference) — a small client component since the address comes from
 * `useSession()`/`useDeliveryArea()`, both client-only, and `page.tsx`
 * itself is a server component.
 *
 * Left cell is real: the same address source and the same hardcoded
 * `deliveryIn: 30` minutes `app-header.tsx`'s own "Deliver to" row already
 * uses — not the reference's invented "10-15 mins", which nothing in this
 * app computes. It links to address selection, same target as the header's
 * own address row. Right cell ("Fresh & Quality" / "Quality checked") is
 * generic decorative copy with no measurable claim behind it, so it isn't a
 * link — nothing real to navigate to.
 */
export function ProductDeliveryInfo() {
  const t = useTranslations('home');
  const tp = useTranslations('product');
  const { user, defaultAddress } = useSession();
  const rememberedArea = useDeliveryArea((s) => s.areaName ?? s.pincode);

  const addressLine = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.line1}`
    : (rememberedArea ?? t('selectAddress'));

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-[var(--radius)] bg-tint-green p-3">
      <Link href={user ? '/addresses' : '/serviceability'} className="flex items-start gap-2">
        <Truck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold">{t('deliveryIn', { minutes: 30 })}</span>
          <span className="truncate text-[11px] text-muted-foreground">{addressLine}</span>
        </span>
        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      <div className="flex items-start gap-2">
        <Leaf className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block text-xs font-bold">{tp('freshQualityTag')}</span>
          <span className="truncate text-[11px] text-muted-foreground">{tp('qualityChecked')}</span>
        </span>
      </div>
    </div>
  );
}
