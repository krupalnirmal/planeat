import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shop/page-header';

/**
 * A real Terms & Conditions page (session 2026-09-22, new client
 * reference) — `profile.terms` used to be an orphaned i18n key, same
 * situation as `profile.privacy` (see privacy/page.tsx's own comment).
 * Describes this app's own real, current service — a single-city delivery
 * operation with pincode-based serviceability, not a multi-city claim the
 * app doesn't back. English only, same reasoning as the privacy page.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('profile');
  const tc = await getTranslations('common');

  return (
    <>
      <PageHeader title={t('terms')} backHref="/profile" backLabel={tc('back')} />
      <main className="space-y-5 bg-card px-4 py-5 text-sm leading-relaxed text-foreground lg:mx-auto lg:max-w-2xl">
        <p className="text-xs text-muted-foreground">Last updated: September 2026</p>

        <section>
          <h2 className="font-semibold">Our service</h2>
          <p className="mt-1 text-muted-foreground">
            getFrresh delivers fresh groceries within our serviceable delivery area — check
            serviceability for your address before placing an order. We&apos;re expanding
            carefully, not claiming to cover areas we don&apos;t actually deliver to yet.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Your account</h2>
          <p className="mt-1 text-muted-foreground">
            You sign in with your phone number and a one-time code. Keep your phone secure —
            anyone with access to it and your OTP can act on your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Orders &amp; payment</h2>
          <p className="mt-1 text-muted-foreground">
            Prices shown at checkout are final for that order. We accept the payment methods
            offered at checkout, including your getFrresh wallet. Once an order is placed, its
            status is visible under My Orders.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Delivery &amp; issues</h2>
          <p className="mt-1 text-muted-foreground">
            If an item arrives damaged, missing, or wrong, report it from that order — refunds
            for approved issues are credited to your getFrresh wallet.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Changes</h2>
          <p className="mt-1 text-muted-foreground">
            We may update these terms as the service grows. Continuing to use getFrresh after a
            change means you accept the updated terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Governing law</h2>
          <p className="mt-1 text-muted-foreground">These terms are governed by the laws of India.</p>
        </section>
      </main>
    </>
  );
}
