import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/auth/session';
import { VendorHeader } from '@/components/vendor/header';
import { InstallPrompt } from '@/components/vendor/install-prompt';
import type { Metadata } from 'next';

/**
 * Vendors install this as its own app, so this tree points at its own
 * manifest (`public/manifest-vendor.json`) rather than the customer one —
 * same icons, but it is named "Get Frresh Vendor" and opens on `/mr/vendor`
 * instead of the storefront. Its `scope` stays `/` on purpose, same
 * reasoning as the delivery layout: a vendor whose session has expired
 * lands on `/staff/login`, which has to open inside the installed app
 * rather than bouncing out to a browser tab.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vendor' });

  return {
    title: t('appTitle'),
    manifest: '/manifest-vendor.json',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('appTitle') },
  };
}

/**
 * Vendor (supplier) shell (session 2026-10-04) — mirrors
 * `(delivery)/delivery/layout.tsx` exactly.
 *
 * R9 — the role check here is a CONVENIENCE, not the security boundary,
 * same as the admin and delivery layouts. It redirects somebody who
 * wandered in; every `/api/vendor/*` route enforces the role (and the
 * vendor-row lookup) itself via `requireVendor()`.
 */
export default async function VendorLayout({
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
    redirect({ href: '/staff/login', locale });
  } else if (session.role !== 'VENDOR') {
    redirect({ href: '/', locale });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
      {/* Same pre-hydration beforeinstallprompt capture as the delivery
          layout — see its own comment for why this can't live in a
          component's effect. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'));});`,
        }}
      />
      <VendorHeader />
      <InstallPrompt />
      <main className="p-4">{children}</main>
    </div>
  );
}
