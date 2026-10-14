import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shop/page-header';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import { localePath } from '@/lib/seo';
import type { Metadata } from 'next';

/**
 * Account deletion (session 2026-10-15, Play Store "Data safety" declaration)
 * — Google requires a public web page describing how to delete an account,
 * reachable without the app installed. Content describes `DELETE /api/me`'s
 * real behaviour (`src/app/api/me/route.ts`): identifiers are scrubbed, the
 * health profile and saved addresses are hard-deleted, but orders/wallet
 * ledger/audit log rows survive as financial and compliance records — same
 * "no generic boilerplate" standard the Privacy Policy page sets. English
 * only, same reasoning as privacy/terms — legal text carries real precision
 * risk in translation.
 */
export function generateMetadata(): Metadata {
  return {
    title: 'Delete My Account',
    alternates: { canonical: localePath(DEFAULT_LOCALE, '/delete-account') },
  };
}

export default async function DeleteAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tc = await getTranslations('common');

  return (
    <>
      <PageHeader title="Delete My Account" backHref="/" backLabel={tc('back')} />
      <main className="space-y-5 bg-card px-4 py-5 text-sm leading-relaxed text-foreground lg:mx-auto lg:max-w-2xl">
        <p className="text-xs text-muted-foreground">Last updated: October 2026</p>

        <section>
          <h2 className="font-semibold">Delete your account in the app</h2>
          <p className="mt-1 text-muted-foreground">
            Open Get Frresh, log in, go to <strong>Profile</strong>, scroll to the bottom, and
            tap <strong>&quot;Close my account&quot;</strong>. Confirm when asked — this takes
            effect immediately, no waiting period.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Can&apos;t log in?</h2>
          <p className="mt-1 text-muted-foreground">
            Email <strong>getfrresh2026@gmail.com</strong> from the email address on your
            account (or mention your registered phone number) and ask us to close your account.
            We&apos;ll confirm once it&apos;s done.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">What gets deleted</h2>
          <p className="mt-1 text-muted-foreground">
            Your name, phone number and email are removed from our systems, your saved health
            profile (used for meal planning) is deleted, and every saved address is deleted.
            Your account is deactivated immediately and you&apos;re signed out of every device.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">What we keep, and why</h2>
          <p className="mt-1 text-muted-foreground">
            Your past orders, wallet transaction history, and payment records are kept —
            they&apos;re financial records we&apos;re required to retain, and by the time
            they&apos;re kept they&apos;re no longer linked to your name, phone or email, since
            those are already removed. This is the same standard India&apos;s Digital Personal
            Data Protection Act, 2023 expects.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Starting fresh</h2>
          <p className="mt-1 text-muted-foreground">
            Once your account is closed, your phone number is free to sign up again as a brand
            new account at any time — closing an account is not a ban.
          </p>
        </section>
      </main>
    </>
  );
}
