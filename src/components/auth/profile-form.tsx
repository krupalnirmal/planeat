'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useInvalidateSession, useSession } from '@/hooks/use-session';
import { api } from '@/lib/api/client';

/**
 * M1 profile step: name only (session 2026-09-27, user request — dob and
 * gender dropped, and the full page became a popup card instead). Date of
 * birth/gender still exist on the profile and are still collected by the
 * health-profile wizard when a meal plan actually needs them; asking for
 * them again here, before a person has bought anything, was the wrong
 * trade to begin with.
 *
 * Still its own route (`/profile/complete`) — `login-flow.tsx` redirects a
 * new user straight here, and `cart-bar.tsx` hides on it — so this renders
 * as a centred card over a dimmed backdrop rather than a `PageHeader` +
 * full-width page, the same modal treatment `QuantityModal`/
 * `DeliveryModePopup` already use elsewhere, without needing to change
 * either of those two call sites.
 */
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/api/me', { name: name.trim() });
      await invalidateSession();
      router.replace(next);
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[420px] rounded-[calc(var(--radius)*1.6)] bg-background p-5">
        <h1 className="text-lg font-black">{t('completeTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('completeSubtitle')}</p>

        <form
          className="mt-5 space-y-4"
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
              autoFocus
              className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={name.trim().length < 2 || busy}
            className="h-11 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
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
      </div>
    </div>
  );
}
