'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Clock, Keyboard, Loader2, Mic } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { Recorder } from '@/components/smart-list/recorder';
import { LoginPrompt } from '@/components/shop/login-prompt';
import { PageHeader } from '@/components/shop/page-header';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api, qs } from '@/lib/api/client';

/**
 * The Smart List entry screen (M4).
 *
 * Three ways in — speak, photograph, type — and the third is not a
 * second-class citizen. M4 requires manual entry as the fallback when AI is
 * unavailable, and on a phone with a broken mic or in a house where somebody
 * is asleep it is simply the better option.
 *
 * The voice path shows the transcript for editing before anything reaches a
 * cart: a misheard word costs one tap here instead of a re-recorded minute.
 */

interface VoiceResponse {
  smartListId: string;
  transcript: string;
  usedFallback: boolean;
}

interface CreateResponse {
  smartListId: string;
  usedFallback: boolean;
}

interface SavedListsResponse {
  lists: Array<{ id: string; name: string | null; source: string; itemCount: number }>;
}

type Mode = 'choose' | 'transcript' | 'type';

export function SmartListScreen() {
  const t = useTranslations('smartList');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = useSession();

  const [mode, setMode] = useState<Mode>('choose');
  const [transcript, setTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [pendingListId, setPendingListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const savedLists = useQuery({
    queryKey: ['smart-lists'],
    queryFn: () => api.get<SavedListsResponse>('/api/smart-list'),
    enabled: isLoggedIn,
  });

  function handleError(err: unknown) {
    setError(err instanceof ApiClientError ? err.message : t('failed'));
  }

  const uploadVoice = useMutation({
    mutationFn: async (input: { blob: Blob; mimeType: string }) => {
      const response = await fetch(`/api/smart-list/voice${qs({ locale, languageHint: locale })}`, {
        method: 'POST',
        headers: { 'content-type': input.mimeType },
        body: input.blob,
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!payload.success) throw new ApiClientError(payload.error.code, payload.error.message, response.status);
      return payload.data as VoiceResponse;
    },
    onSuccess: (data) => {
      setError(null);
      setPendingListId(data.smartListId);
      setTranscript(data.transcript);
      // M4 — the transcript is shown for editing BEFORE the review screen.
      setMode('transcript');
    },
    onError: handleError,
  });

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch(`/api/smart-list/photo${qs({ locale })}`, {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!payload.success) throw new ApiClientError(payload.error.code, payload.error.message, response.status);
      return payload.data as CreateResponse;
    },
    onSuccess: (data) => router.push(`/smart-list/${data.smartListId}`),
    onError: handleError,
  });

  const reparse = useMutation({
    mutationFn: () =>
      api.post<CreateResponse>(`/api/smart-list/${pendingListId}/reparse${qs({ locale })}`, {
        transcript,
      }),
    onSuccess: (data) => router.push(`/smart-list/${data.smartListId}`),
    onError: handleError,
  });

  const parseTyped = useMutation({
    mutationFn: () => api.post<CreateResponse>(`/api/smart-list${qs({ locale })}`, { text: typed }),
    onSuccess: (data) => router.push(`/smart-list/${data.smartListId}`),
    onError: handleError,
  });

  if (sessionLoading) {
    return (
      <>
        <PageHeader title={t('title')} />
        <main className="pb-2">
          <div className="bg-card px-4 py-8 text-sm text-muted-foreground">{tc('loading')}</div>
        </main>
      </>
    );
  }

  // B17 — the Smart List builds a cart, so it needs a login.
  if (!isLoggedIn) {
    return (
      <LoginPrompt
        icon={Mic}
        title={t('title')}
        bandSubtitle={t('subtitle')}
        description={t('loginDescription')}
        loginHref="/login?next=/smart-list"
      />
    );
  }

  const busy = uploadVoice.isPending || uploadPhoto.isPending || reparse.isPending || parseTyped.isPending;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <main className="pb-2">
      <div className="bg-card px-4 py-4">
      {error && (
        <p className="mb-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {busy && mode !== 'transcript' && (
        <p className="mb-4 flex items-center gap-2 rounded-[var(--radius)] bg-secondary px-3 py-2.5 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          {uploadVoice.isPending || uploadPhoto.isPending ? t('uploading') : t('processing')}
        </p>
      )}

      {/* ── Transcript editing (M4's editable transcript) */}
      {mode === 'transcript' ? (
        <section className="rounded-[var(--radius)] border border-border/60 bg-background p-4">
          <h2 className="text-sm font-semibold">{t('transcriptTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('transcriptHint')}</p>

          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value.slice(0, 4000))}
            rows={5}
            className="input-3d mt-3 w-full resize-none rounded-[var(--radius)] border border-border/60 bg-card px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
          />

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('choose');
                setPendingListId(null);
              }}
              className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
            >
              {tc('back')}
            </button>
            <button
              type="button"
              onClick={() => reparse.mutate()}
              disabled={transcript.trim().length < 2 || reparse.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {reparse.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('reparse')}
            </button>
          </div>
        </section>
      ) : mode === 'type' ? (
        <section className="rounded-[var(--radius)] border border-border/60 bg-background p-4">
          <h2 className="text-sm font-semibold">{t('typeTitle')}</h2>
          <textarea
            value={typed}
            onChange={(event) => setTyped(event.target.value.slice(0, 4000))}
            placeholder={t('typePlaceholder')}
            rows={6}
            className="input-3d mt-3 w-full resize-none rounded-[var(--radius)] border border-border/60 bg-card px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
            >
              {tc('back')}
            </button>
            <button
              type="button"
              onClick={() => parseTyped.mutate()}
              disabled={typed.trim().length < 2 || parseTyped.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {parseTyped.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('parse')}
            </button>
          </div>
        </section>
      ) : (
        <>
          <Recorder
            disabled={busy}
            onRecorded={(blob, mimeType) => uploadVoice.mutate({ blob, mimeType })}
          />

          <div className="mt-3 grid gap-3">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={busy}
              className="flex h-14 items-center gap-3 rounded-[var(--radius)] border border-border bg-background px-4 text-left disabled:opacity-50"
            >
              <Camera className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{t('photo')}</span>
            </button>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadPhoto.mutate(file);
                event.target.value = '';
              }}
            />

            {/* M4 — manual entry is the stated fallback, so it is a real
                option on the first screen, not hidden behind a failure. */}
            <button
              type="button"
              onClick={() => setMode('type')}
              disabled={busy}
              className="flex h-14 items-center gap-3 rounded-[var(--radius)] border border-border bg-background px-4 text-left disabled:opacity-50"
            >
              <Keyboard className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{t('typeInstead')}</span>
            </button>
          </div>

          {/* M4 — saved lists, named and reusable. */}
          {(savedLists.data?.lists.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold">{t('savedLists')}</h2>
              <ul className="space-y-2">
                {savedLists.data?.lists.map((saved) => (
                  <li key={saved.id}>
                    <Link
                      href={`/smart-list/${saved.id}`}
                      className="flex min-h-14 items-center gap-3 rounded-[var(--radius)] border border-border/60 bg-background px-4"
                    >
                      <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {saved.name ?? t('title')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t('itemCount', { count: saved.itemCount })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      </div>
      </main>
    </>
  );
}
