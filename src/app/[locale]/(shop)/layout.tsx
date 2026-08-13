import { setRequestLocale } from 'next-intl/server';
import { BottomNav } from '@/components/shop/bottom-nav';

/**
 * The customer shell: a single centred column sized for a 390px viewport, with
 * the 5-tab bottom navigation fixed to the bottom (R10, PART 5).
 *
 * The admin and delivery route groups deliberately do NOT use this layout —
 * they get their own, so the admin bundle never reaches a customer phone (M9).
 */
export default async function ShopLayout({
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
      <div className="app-scroll">{children}</div>
      <BottomNav />
    </div>
  );
}
