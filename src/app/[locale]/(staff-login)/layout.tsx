import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AdminInstallPrompt } from '@/components/admin/install-prompt';
import type { Metadata } from 'next';

/**
 * `/staff/login` — its own route group (session 2026-09-17) so it renders
 * outside both `(admin)/admin/layout.tsx` and `(delivery)/delivery/layout.tsx`,
 * neither of which this page can sit behind (it's exactly what an
 * unauthenticated visit to either gets redirected to). Same full-bleed shell
 * as `(intro)` — no bottom nav, no floating chrome.
 *
 * Points at the admin manifest, not delivery's (session 2026-09-20, client
 * request — "opening the admin login URL should offer to install the admin
 * app") — this page is also where an expired delivery session bounces to,
 * so a rider hitting this exact URL sees the admin install prompt too. That
 * is an accepted imprecision of a genuinely shared login page rather than an
 * oversight: the delivery app's own install prompt already only ever shows
 * once inside `/delivery/*` after logging in
 * (`(delivery)/delivery/layout.tsx`), never on this shared screen, so riders
 * lose nothing they had before.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });

  return {
    title: t('appTitle'),
    manifest: '/manifest-admin.json',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('appTitle') },
  };
}

export default async function StaffLoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="app-shell">
      {/* Same pre-hydration capture as the admin layout — this page is
          rendered outside it, so it needs its own copy of the script
          rather than relying on the admin layout's. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'));});`,
        }}
      />
      <AdminInstallPrompt />
      {children}
    </div>
  );
}
