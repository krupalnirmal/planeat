'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useInvalidateSession, useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * M1 profile step: name, date of birth, gender.
 *
 * Only the name is required. Date of birth feeds the meal-plan age check in
 * Phase 4 (S3 flags under-18 and over-75), but demanding it before a person has
 * bought anything is the wrong trade — they can add it later, and the health
 * wizard asks again.
 */

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
type GenderOption = (typeof GENDERS)[number];

const GENDER_KEYS: Record<GenderOption, 'genderMale' | 'genderFemale' | 'genderOther' | 'genderUndisclosed'> = {
  MALE: 'genderMale',
  FEMALE: 'genderFemale',
  OTHER: 'genderOther',
  UNDISCLOSED: 'genderUndisclosed',
};

export function ProfileForm() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidateSession = useInvalidateSession();
  const { user } = useSession();

  const next = searchParams.get('next') ?? '/';

  const [name, setName] = useState(user?.name ?? '');
  const [dob, setDob] = useState(user?.dob ? user.dob.slice(0, 10) : '');
  const [gender, setGender] = useState<GenderOption | ''>(user?.gender ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/api/me', {
        name: name.trim(),
        ...(dob ? { dob } : {}),
        ...(gender ? { gender } : {}),
      });
      await invalidateSession();
      router.replace(next);
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-5 py-8">
      <h1 className="text-xl font-bold">{t('completeTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('completeSubtitle')}</p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2 && !busy) void save();
        }}
      >
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            {t('nameLabel')}
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            className="mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border bg-card px-3 text-base outline-none focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="dob" className="text-sm font-medium">
            {t('dobLabel')}{' '}
            <span className="font-normal text-muted-foreground">({tc('optional')})</span>
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setDob(event.target.value)}
            className="mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border bg-card px-3 text-base outline-none focus:border-primary"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">
            {t('genderLabel')}{' '}
            <span className="font-normal text-muted-foreground">({tc('optional')})</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENDERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGender(gender === option ? '' : option)}
                aria-pressed={gender === option}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-sm transition-colors',
                  gender === option
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {t(GENDER_KEYS[option])}
              </button>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={name.trim().length < 2 || busy}
          className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? tc('saving') : tc('save')}
        </button>

        <button
          type="button"
          onClick={() => router.replace(next)}
          className="h-11 w-full text-sm text-muted-foreground"
        >
          {tc('skip')}
        </button>
      </form>
    </main>
  );
}
