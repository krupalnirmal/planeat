import { setRequestLocale } from 'next-intl/server';

/**
 * The pre-shop flow shell: splash, onboarding, language pick and login.
 * No bottom nav, no floating cart bar — these screens are full-bleed on
 * purpose, matching the client's reference exactly rather than inheriting
 * chrome built for the shop tabs.
 */
export default async function IntroLayout({
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
