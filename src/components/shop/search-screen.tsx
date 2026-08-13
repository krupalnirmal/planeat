'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductCard, type ProductCardData } from '@/components/shop/product-card';
import { SearchBar } from '@/components/shop/search-bar';
import { api, qs } from '@/lib/api/client';
import { useRecentSearches } from '@/hooks/use-recent-searches';

/**
 * M2 search: debounced autocomplete, recent searches, and matching across
 * Marathi, English and transliteration (`kanda` → कांदा → Onion).
 */

const DEBOUNCE_MS = 300;

interface SearchResponse {
  query: string;
  products: Array<
    Omit<ProductCardData, 'variant'> & {
      variant: ProductCardData['variant'];
    }
  >;
}

export function SearchScreen() {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [debounced, setDebounced] = useState(input);
  const { recent, remember, clear } = useRecentSearches();

  // Debounce so a 10-character query is one request, not ten. On rural 4G that
  // is the difference between usable and unusable.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const results = useQuery({
    queryKey: ['search', debounced, locale],
    queryFn: () => api.get<SearchResponse>(`/api/products/search${qs({ q: debounced, locale })}`),
    enabled: debounced.length > 1,
    staleTime: 30_000,
  });

  // Only remember a search that actually found something — a typo is not
  // worth offering back to the user tomorrow.
  useEffect(() => {
    if (debounced.length > 1 && (results.data?.products.length ?? 0) > 0) {
      remember(debounced);
    }
  }, [debounced, results.data, remember]);

  const products = results.data?.products ?? [];

  return (
    <main className="px-4 py-4">
      <SearchBar defaultValue={input} autoFocus onChange={setInput} className="mb-4" />

      {debounced.length <= 1 && (
        <>
          {recent.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t('recent')}</h2>
                <button
                  type="button"
                  onClick={clear}
                  className="flex min-h-9 items-center gap-1 text-xs text-muted-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                  {t('clearRecent')}
                </button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <li key={term}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(term);
                        setDebounced(term);
                      }}
                      className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm"
                    >
                      <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                      {term}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('typeToSearch')}</p>
          )}
        </>
      )}

      {debounced.length > 1 && (
        <>
          {results.isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          )}

          {!results.isLoading && products.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">{t('noResults', { query: debounced })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('noResultsHint')}</p>
            </div>
          )}

          {products.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold">
                {t('resultsFor', { query: debounced })}
              </h2>
              <ul className="grid grid-cols-2 gap-3">
                {products.map((product) => (
                  <li key={product.id}>
                    <ProductCard product={product} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
