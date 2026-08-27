'use client';

import { Mic, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The home-screen search entry. Submitting navigates to `/search?q=`, so a
 * search is a real, shareable, back-button-friendly URL rather than a piece of
 * component state.
 *
 * The mic on the right is the reference design's voice-search affordance, and
 * here it is a real one: it opens the Smart List, which is this app's actual
 * voice feature (M4). A decorative mic that did nothing would be worse than
 * no mic at all.
 */
export function SearchBar({
  defaultValue = '',
  autoFocus = false,
  onChange,
  showMic = false,
  className,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  onChange?: (value: string) => void;
  showMic?: boolean;
  className?: string;
}) {
  const t = useTranslations('search');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function update(next: string) {
    setValue(next);
    onChange?.(next);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      className={cn(
        'input-3d flex h-12 items-center gap-2.5 rounded-[var(--radius)] border border-border bg-card pr-1 pl-3.5',
        className,
      )}
    >
      <Search className="size-[18px] shrink-0 text-foreground" strokeWidth={2.4} aria-hidden />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => update(event.target.value)}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={() => update('')}
          aria-label={t('clearRecent')}
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : (
        showMic && (
          <Link
            href="/smart-list"
            aria-label={tNav('smartList')}
            className="grid size-11 shrink-0 place-items-center rounded-full border-l border-border text-foreground"
          >
            <Mic className="size-[18px]" strokeWidth={2.2} aria-hidden />
          </Link>
        )
      )}
    </form>
  );
}
