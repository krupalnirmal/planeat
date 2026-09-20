import { setRequestLocale } from 'next-intl/server';
import { BottomNav } from '@/components/shop/bottom-nav';
import { CartBar } from '@/components/shop/cart-bar';
import { DesktopHeader } from '@/components/shop/desktop-header';
import { InstallPrompt } from '@/components/shop/install-prompt';
import { FirstVisitGate } from '@/components/auth/first-visit-gate';
import { getCategories } from '@/lib/catalog/queries';
import type { AppLocale } from '@/i18n/routing';

/**
 * The customer shell: a single centred column sized for a 390px viewport
 * below `lg:`, with the 5-tab bottom navigation fixed to the bottom (R10,
 * PART 5). At `lg:` and up (session 2026-09-20, client request — "desktop
 * looks the same as mobile, design a real one"), it widens instead and
 * `DesktopHeader` takes over navigation; `BottomNav`/`CartBar` hide
 * themselves past that point (see their own `lg:hidden`).
 *
 * The admin and delivery route groups deliberately do NOT use this layout —
 * they get their own, so the admin bundle never reaches a customer phone (M9).
 *
 * `getCategories()` runs here, once per request, rather than inside
 * `DesktopHeader` itself — that component renders on every page and is a
 * client component (needs `useCart`/`useSession`), so fetching server-side
 * here and passing the result down avoids a second client query for data
 * this layout can just read directly.
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

  const categories = await getCategories(locale as AppLocale);

  return (
    // `lg:max-w-[1280px] lg:px-8` (session 2026-09-20) — the `.app-shell`
    // class itself stays untouched since (intro)/(staff-login) share it and
    // aren't part of this desktop redesign; the wider width is added here
    // as plain utility classes scoped to just this layout.
    <div className="app-shell lg:max-w-[1280px] lg:px-8">
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
      <DesktopHeader categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <FirstVisitGate />
      <InstallPrompt />
      <div className="app-scroll">{children}</div>
      <CartBar />
      <BottomNav />
    </div>
  );
}
