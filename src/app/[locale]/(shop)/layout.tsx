import { setRequestLocale } from 'next-intl/server';
import { BottomNav } from '@/components/shop/bottom-nav';
import { CartBar } from '@/components/shop/cart-bar';
import { InstallPrompt } from '@/components/shop/install-prompt';
import { FirstVisitGate } from '@/components/auth/first-visit-gate';

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
      {/* Chrome fires `beforeinstallprompt` during page load, routinely
          before React has hydrated — a listener attached inside a
          component misses it. This runs before hydration and parks the
          event on `window` for InstallPrompt to pick up (immediately, or
          via the custom event if it lands after mount) — same mechanism
          as the delivery layout's own copy of this script. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'));});`,
        }}
      />
      <FirstVisitGate />
      <InstallPrompt />
      <div className="app-scroll">{children}</div>
      <CartBar />
      <BottomNav />
    </div>
  );
}
