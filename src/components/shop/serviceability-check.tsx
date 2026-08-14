'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, LocateFixed, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface ServiceabilityResult {
  serviceable: boolean;
  reason: 'OK' | 'PINCODE_NOT_SERVED' | 'OUTSIDE_RADIUS' | 'NO_INPUT';
  area: { id: string; name: string; pincode: string } | null;
  distanceMeters: number | null;
}

export function ServiceabilityCheck() {
  const t = useTranslations('serviceability');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const te = useTranslations('errors');
  const searchParams = useSearchParams();

  const [pincode, setPincode] = useState(searchParams.get('pincode') ?? '');
  const [phone, setPhone] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: (query: { pincode?: string; lat?: number; lng?: number }) =>
      api.get<ServiceabilityResult>(`/api/serviceability${qs(query)}`),
    onSuccess: setResult,
    onError: () => setError(te('generic')),
  });

  const join = useMutation({
    mutationFn: () =>
      api.post('/api/waitlist', {
        phone,
        pincode,
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      }),
    onSuccess: () => setJoined(true),
    onError: () => setError(te('generic')),
  });

  // A pincode arriving in the URL (from a rejected address save) is checked
  // straight away — retyping what the app already knows is pure friction.
  useEffect(() => {
    const initial = searchParams.get('pincode');
    if (initial && /^[1-9]\d{5}$/.test(initial)) {
      check.mutate({ pincode: initial });
    }
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(next);
        check.mutate({ ...next, ...(pincode ? { pincode } : {}) });
      },
      () => setError(te('generic')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const pincodeValid = /^[1-9]\d{5}$/.test(pincode);
  const phoneValid = /^[6-9]\d{9}$/.test(phone);

  return (
    <main className="pb-2">
      <div className="bg-card px-5 py-8">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (pincodeValid) check.mutate({ pincode, ...(coords ?? {}) });
        }}
      >
        <label htmlFor="pincode" className="text-sm font-medium">
          {t('checkPincode')}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="pincode"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={(event) => {
              setPincode(event.target.value.replace(/\D/g, '').slice(0, 6));
              setResult(null);
            }}
            className="input-3d h-12 min-w-0 flex-1 rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base tracking-wider outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!pincodeValid || check.isPending}
            className="h-12 shrink-0 rounded-[var(--radius)] bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {check.isPending ? tc('loading') : tc('next')}
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={check.isPending}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-primary text-sm font-semibold text-primary disabled:opacity-60"
      >
        <LocateFixed className={cn('size-4', check.isPending && 'animate-pulse')} aria-hidden />
        {check.isPending ? t('checking') : t('useCurrentLocation')}
      </button>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {result?.serviceable && (
        <section className="mt-6 rounded-[var(--radius)] border border-success/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            {result.area ? t('availableIn', { area: result.area.name }) : t('available')}
          </p>
          <Link
            href="/"
            className="mt-4 flex h-12 items-center justify-center rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {tc('next')}
          </Link>
        </section>
      )}

      {result && !result.serviceable && result.reason !== 'NO_INPUT' && (
        <section className="mt-6 rounded-[var(--radius)] border border-border bg-background p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPinOff className="size-5 shrink-0 text-warning" aria-hidden />
            {result.reason === 'OUTSIDE_RADIUS' ? t('outsideRadius') : t('unavailable')}
          </p>

          {joined ? (
            <p className="mt-4 rounded-[var(--radius)] bg-primary/5 px-3 py-3 text-sm text-success">
              {t('waitlistDone')}
            </p>
          ) : (
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                if (phoneValid && pincodeValid) join.mutate();
              }}
            >
              <h2 className="text-sm font-semibold">{t('waitlistTitle')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('waitlistBody')}</p>

              <label htmlFor="waitlist-phone" className="mt-3 block text-sm font-medium">
                {ta('phoneLabel')}
              </label>
              <input
                id="waitlist-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={ta('phonePlaceholder')}
                className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-card px-3 text-base outline-none focus:border-primary"
              />

              <button
                type="submit"
                disabled={!phoneValid || join.isPending}
                className={cn(
                  'mt-4 h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground',
                  (!phoneValid || join.isPending) && 'opacity-50',
                )}
              >
                {t('waitlistJoin')}
              </button>
            </form>
          )}

          <Link
            href="/"
            className="mt-3 flex min-h-11 items-center justify-center text-sm font-medium text-primary"
          >
            {t('browseAnyway')}
          </Link>
        </section>
      )}
      </div>
    </main>
  );
}
