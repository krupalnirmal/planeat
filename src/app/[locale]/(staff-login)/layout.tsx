import { setRequestLocale } from 'next-intl/server';

/**
 * `/staff/login` — its own route group (session 2026-09-17) so it renders
 * outside both `(admin)/admin/layout.tsx` and `(delivery)/delivery/layout.tsx`,
 * neither of which this page can sit behind (it's exactly what an
 * unauthenticated visit to either gets redirected to). Same full-bleed shell
 * as `(intro)` — no bottom nav, no floating chrome.
 */
export default async function StaffLoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div className="app-shell">{children}</div>;
}
