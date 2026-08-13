import type { Metadata, Viewport } from 'next';
import { Mukta } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { QueryProvider } from '@/components/providers/query-provider';
import { ServiceWorkerRegistration } from '@/components/providers/service-worker-registration';
import { routing } from '@/i18n/routing';
import '../globals.css';

/**
 * PART 5 — one font family with proper Devanagari support across the whole UI.
 *
 * Mukta is drawn as a single harmonised superfamily covering Devanagari and
 * Latin, so Marathi (the default language, B15) and English share the same
 * rhythm and weight. Pairing a Latin display face with a Devanagari fallback
 * is exactly the mismatch the brief rules out.
 */
const appFont = Mukta({
  variable: '--font-app',
  subsets: ['latin', 'devanagari'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    manifest: '/manifest.json',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('name') },
    icons: {
      icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#FFD400',
  width: 'device-width',
  initialScale: 1,
  // Zooming stays enabled: disabling it is an accessibility failure, and the
  // 44px touch targets already remove the reason people pinch-zoom.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${appFont.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>{children}</QueryProvider>
          <ServiceWorkerRegistration />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
