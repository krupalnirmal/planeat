'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { PageHeader } from '@/components/shop/page-header';
import { useInvalidateSession, useSession, type SessionUser } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';

/** Lets a logged-in customer change the name/email `ProfileForm` only ever asks for once, at signup. */
export function ProfileEditScreen() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user, isLoggedIn, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.replace('/profile');
  }, [isLoading, isLoggedIn, router]);

  if (isLoading || !isLoggedIn || !user) {
    return (
      <>
        <PageHeader title={t('editProfile')} backHref="/profile" backLabel={tc('back')} />
        <main className="pb-2">
          <div className="bg-card px-5 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('editProfile')} backHref="/profile" backLabel={tc('back')} />
      {/* Keyed by user.id so the form remounts (fresh initial state) if a
          different account's session ever loads here. */}
      <ProfileEditForm key={user.id} user={user} />
    </>
  );
}

function ProfileEditForm({ user }: { user: SessionUser }) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const router = useRouter();
  const invalidateSession = useInvalidateSession();

  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.patch('/api/me', { name: name.trim(), email: email.trim() }),
    onSuccess: async () => {
      await invalidateSession();
      router.replace('/profile');
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : te('generic')),
  });

  const canSave = name.trim().length >= 2 && !save.isPending;

  return (
    <main className="px-4 py-4 lg:mx-auto lg:max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (canSave) save.mutate();
        }}
      >
        <div>
          <label htmlFor="edit-name" className="text-sm font-medium">
            {t('nameLabel')}
          </label>
          <input
            id="edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base outline-none focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="edit-email" className="text-sm font-medium">
            {t('emailLabel')}
          </label>
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">{t('phoneLabel')}</label>
          <p className="mt-1.5 flex h-12 items-center rounded-[var(--radius)] border border-border/60 bg-muted px-3 text-base text-muted-foreground">
            +91 {user.phone}
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={!canSave}
          className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? tc('saving') : tc('save')}
        </button>
      </form>
    </main>
  );
}
