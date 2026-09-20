import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/admin-shell';
import { STORE_ROLES } from '@/lib/auth/session';
import { getSession } from '@/lib/auth/session';
import { redirect } from '@/i18n/navigation';
import type { Metadata } from 'next';

/**
 * Admin shell (M9).
 *
 * R10 — its own route group, so Next code-splits the whole panel away from the
 * customer bundle. Nothing under `components/admin/**` is imported by a
 * customer-facing component.
 *
 * R9 — the role check here is a CONVENIENCE, not the security boundary. It
 * redirects somebody who wandered in, so they see a login rather than an empty
 * dashboard. Every `/api/admin/*` route enforces the role itself, because a
 * layout check protects the page and not the data behind it.
 *
 * Its own installable PWA (session 2026-09-20, client request), same pattern
 * as the delivery tree's `manifest-rider.json` — its own manifest, so store
 * staff installing it get "Get Fresh Admin" with its own icon, not the
 * customer app. `scope` stays `/` on purpose: an admin whose session expired
 * lands on the shared `/staff/login`, which has to open inside the installed
 * app rather than bouncing out to a browser tab.
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

export default async function AdminLayout({
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
  } else if (!STORE_ROLES.includes(session.role)) {
    redirect({ href: '/', locale });
  }

  return (
    <>
      {/* Chrome fires `beforeinstallprompt` during page load, routinely
          before React has hydrated — a listener attached inside a
          component misses it. This runs before hydration and parks the
          event on `window` for AdminInstallPrompt to pick up (immediately,
          or via the custom event if it lands after mount) — same mechanism
          as the delivery and shop layouts' own copies of this script. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'));});`,
        }}
      />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
