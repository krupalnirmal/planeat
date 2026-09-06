import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/auth/session';
import { DeliveryHeader } from '@/components/delivery/header';
import { InstallPrompt } from '@/components/delivery/install-prompt';
import type { Metadata } from 'next';

/**
 * Riders install this as its own app, so this tree points at its own
 * manifest (`public/manifest-rider.json`) rather than the customer one —
 * same icons, but it is named "Get Fresh Rider" and opens on `/mr/delivery`
 * instead of the storefront. Its `scope` stays `/` on purpose: a rider whose
 * session has expired lands on `/login?next=/delivery`, which has to open
 * inside the installed app rather than bouncing out to a browser tab.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'delivery' });

  return {
    title: t('appTitle'),
    manifest: '/manifest-rider.json',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('appTitle') },
  };
}

/**
 * Delivery partner shell (M10).
 *
 * Deliberately its own route group: riders run cheap Android phones on flaky
 * networks, so this tree stays minimal and must never pull in the customer
 * storefront or the admin panel.
 *
 * R9 — the role check here is a CONVENIENCE, not the security boundary, same
 * as the admin layout. It redirects somebody who wandered in; every
 * `/api/delivery/*` route enforces the role (and the partner-row lookup)
 * itself via `requireDeliveryPartner()`.
 */
export default async function DeliveryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();

  if (!session) {
    redirect({ href: '/login?next=/delivery', locale });
  } else if (session.role !== 'DELIVERY_PARTNER') {
    redirect({ href: '/', locale });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
      <DeliveryHeader />
      <InstallPrompt />
      <main className="p-4">{children}</main>
    </div>
  );
}
