import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * Desktop footer (session 2026-09-22, new client reference) — this app had
 * no footer anywhere before. Server component (no interactivity needed) so
 * it costs nothing on the client bundle.
 *
 * Deliberately narrower than the reference: no social icons (no real
 * accounts configured anywhere in the app — confirmed via investigation),
 * no app-store badges (not listed on Google Play or the App Store yet —
 * `capacitor.config.ts`'s own doc comment confirms the native build was
 * deliberately never run), no "About"/"Help" links (neither page exists).
 * What's here is real: the logo, the actual category list, and Privacy
 * Policy/Terms & Conditions, which are now real pages (see
 * `(shop)/privacy` and `(shop)/terms`) rather than the disabled
 * "coming soon" rows they used to be on the profile screen.
 *
 * Mobile doesn't get this footer at all — the reference's own mobile
 * mockup never shows one either, and the existing bottom nav already
 * covers primary navigation there.
 */
export async function Footer({
  categories,
}: {
  categories: { slug: string; name: string }[];
}) {
  const t = await getTranslations('footer');
  const tHome = await getTranslations('home');
  const tp = await getTranslations('profile');
  const year = new Date().getFullYear();

  return (
    <footer className="hidden border-t border-border bg-card lg:block">
      <div className="mx-auto max-w-[1280px] px-8 py-10">
        <div className="grid grid-cols-3 gap-8">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-compact.png" alt="getFresh" className="h-9 w-auto" />
            <p className="mt-2 text-sm text-muted-foreground">{tHome('tagline')}</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t('categoriesHeading')}</h2>
            <ul className="mt-3 space-y-2">
              {categories.slice(0, 6).map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t('legalHeading')}</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary">
                  {tp('privacy')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-muted-foreground hover:text-primary">
                  {tp('terms')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          {t('copyright', { year })}
        </p>
      </div>
    </footer>
  );
}
