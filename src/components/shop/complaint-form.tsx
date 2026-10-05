'use client';

import { useMutation } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError, api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * General complaint/feedback (session 2026-10-05) — not the order-scoped
 * `ReportIssueForm` (`report-issue-form.tsx`), which carries a wallet-credit
 * claim this feature never touches. Same reason-chip + description + URL
 * photo-input pattern, minus the amount field.
 */

const CATEGORIES = [
  'PRODUCT_QUALITY',
  'DELIVERY',
  'APP_ISSUE',
  'BILLING',
  'STAFF_BEHAVIOUR',
  'OTHER',
] as const;
type Category = (typeof CATEGORIES)[number];

export function ComplaintForm({
  onDone,
  onCancel,
}: {
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('complaints');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const [category, setCategory] = useState<Category>('PRODUCT_QUALITY');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/api/complaints', {
        category,
        description: description.trim(),
        photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
      }),
    onSuccess: () => onDone(t('submitted')),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : te('generic')),
  });

  const canSubmit = description.trim().length >= 10 && !submit.isPending;

  return (
    <form
      className="rounded-[var(--radius)] border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (canSubmit) submit.mutate();
      }}
    >
      <h2 className="text-sm font-semibold">{t('newComplaint')}</h2>

      <fieldset className="mt-3">
        <legend className="sr-only">{t('category.label')}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'min-h-11 rounded-full border px-3 text-xs',
                category === c
                  ? 'border-primary bg-primary text-primary-foreground font-semibold'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="complaint-description" className="mt-4 block text-sm font-medium">
        {t('description')}
      </label>
      <textarea
        id="complaint-description"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
        className="mt-1.5 w-full resize-none rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <label htmlFor="complaint-photo" className="mt-4 block text-sm font-medium">
        {t('photo')}
      </label>
      <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3">
        <Camera className="size-4 shrink-0 text-primary" aria-hidden />
        <input
          id="complaint-photo"
          type="url"
          inputMode="url"
          value={photoUrl}
          onChange={(event) => setPhotoUrl(event.target.value)}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{t('photoHint')}</p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
        >
          {tc('cancel')}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submit.isPending ? tc('saving') : t('submit')}
        </button>
      </div>
    </form>
  );
}
