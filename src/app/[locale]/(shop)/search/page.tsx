import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { SearchScreen } from '@/components/shop/search-screen';

/**
 * Search (M2).
 *
 * Client-rendered because it is debounced autocomplete against a query that
 * changes on every keystroke; server-rendering each keystroke would be a round
 * trip to Singapore per character.
 */
export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // `useSearchParams` opts a client component out of prerendering unless it
  // sits behind a Suspense boundary. The shell above it still renders
  // statically, which is what keeps the first paint fast.
  return (
    <Suspense fallback={<div className="px-4 py-4" />}>
      <SearchScreen />
    </Suspense>
  );
}
