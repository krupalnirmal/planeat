import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shop/page-header';

/**
 * A real Privacy Policy page (session 2026-09-22, new client reference) —
 * `profile.privacy` used to be an orphaned i18n key pointing nowhere (a
 * disabled "coming soon" row on the profile screen). Content describes
 * this app's own actual data practices, not generic boilerplate: phone-OTP
 * login, saved addresses, order history, wallet, push notifications, and
 * the pincode-based serviceability check are the real things this app
 * collects — nothing here is a stand-in for a feature that doesn't exist.
 * English only, not run through next-intl's mr/hi catalogues — legal text
 * carries real precision risk in translation, unlike ordinary UI copy.
 */
export default async function PrivacyPage({
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
      <PageHeader title={t('privacy')} backHref="/profile" backLabel={tc('back')} />
      <main className="space-y-5 bg-card px-4 py-5 text-sm leading-relaxed text-foreground lg:mx-auto lg:max-w-2xl">
        <p className="text-xs text-muted-foreground">Last updated: September 2026</p>

        <section>
          <h2 className="font-semibold">What we collect</h2>
          <p className="mt-1 text-muted-foreground">
            Your phone number (used to sign in via a one-time code — we never ask for a
            password), your name, the delivery addresses you save, your order and payment
            history, your wallet balance and transactions, and — only if you turn on order
            alerts — a notification token for your device. When you check whether we deliver
            to your area, we use the pincode or location you provide for that check alone.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">How we use it</h2>
          <p className="mt-1 text-muted-foreground">
            To take your order, get it delivered to the right address, keep you updated on its
            status, process refunds to your wallet when something goes wrong, and — only if
            you&apos;ve enabled them — send you order-status notifications.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Who we share it with</h2>
          <p className="mt-1 text-muted-foreground">
            Your delivery address and phone number are shared with the delivery partner
            assigned to your order — that&apos;s how they find and reach you. Payment details
            are handled directly by our payment gateway; we don&apos;t store your card or UPI
            details ourselves. We don&apos;t sell your data, and we don&apos;t share it with
            anyone else for marketing.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Your data, your control</h2>
          <p className="mt-1 text-muted-foreground">
            You can download a copy of your data or close your account at any time from your
            Profile page — both are real, working buttons there, not a request you need to
            email in for.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Compliance</h2>
          <p className="mt-1 text-muted-foreground">
            We handle your personal data in line with India&apos;s Digital Personal Data
            Protection Act, 2023.
          </p>
        </section>
      </main>
    </>
  );
}
