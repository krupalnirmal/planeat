'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LocateFixed, MapPin, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { ApiClientError, api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * M1 — address list and form.
 *
 * B11 is enforced by the API on save, so this component's job is to show the
 * refusal usefully: a "we do not deliver there" error routes the customer to
 * the waitlist rather than leaving them re-typing the same pincode.
 */

interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const LABEL_KEYS = ['labelHome', 'labelWork', 'labelOther'] as const;

export function AddressManager() {
  const t = useTranslations('address');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn, isLoading } = useSession();

  const [adding, setAdding] = useState(false);

  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<{ addresses: Address[] }>('/api/addresses'),
    enabled: isLoggedIn,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/addresses/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/api/addresses/${id}`, { isDefault: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });

  if (isLoading) {
    return <main className="px-5 py-8 text-sm text-muted-foreground">{tc('loading')}</main>;
  }

  if (!isLoggedIn) {
    return (
      <main className="px-5 py-8">
        <p className="text-sm text-muted-foreground">{te('unauthorized')}</p>
        <button
          type="button"
          onClick={() => router.push('/login?next=/addresses')}
          className="mt-4 h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
        >
          {tc('next')}
        </button>
      </main>
    );
  }

  const list = addresses.data?.addresses ?? [];

  return (
    <main className="px-5 py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      {adding ? (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: ['addresses'] });
            void queryClient.invalidateQueries({ queryKey: ['session'] });
          }}
        />
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {list.map((address) => (
              <li
                key={address.id}
                className="rounded-[var(--radius)] border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
                      {address.label}
                      {address.isDefault && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {t('isDefault')}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}
                      <br />
                      {address.city}, {address.state} — {address.pincode}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('deleteConfirm'))) remove.mutate(address.id);
                    }}
                    aria-label={tc('delete')}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                {!address.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault.mutate(address.id)}
                    className="mt-3 flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    <Check className="size-3.5" aria-hidden />
                    {t('setDefault')}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {addresses.isLoading && (
            <p className="mt-6 text-center text-sm text-muted-foreground">{tc('loading')}</p>
          )}

          {list.length === 0 && !addresses.isLoading && (
            <p className="mt-6 rounded-[var(--radius)] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          )}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-primary text-sm font-bold text-primary"
          >
            <Plus className="size-4" aria-hidden />
            {t('add')}
          </button>
        </>
      )}
    </main>
  );
}

function AddressForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const t = useTranslations('address');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const router = useRouter();

  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/addresses', {
        label,
        line1,
        line2,
        landmark,
        city,
        state: 'Maharashtra',
        pincode,
        ...(coords ?? {}),
        isDefault: false,
      }),
    onSuccess: onSaved,
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'NOT_SERVICEABLE') {
        router.push(`/serviceability?pincode=${pincode}`);
        return;
      }
      setError(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setError(t('locationDenied'));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setCoords({ latitude, longitude });

        // A pair of coordinates isn't an address a customer can recognise —
        // resolve it to one and fill the form, rather than leaving them to
        // type the same details GPS just found.
        try {
          const resolved = await api.get<{
            line1: string;
            landmark: string;
            city: string;
            state: string;
            pincode: string;
            displayName: string;
          }>(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`);

          if (resolved.line1) setLine1(resolved.line1);
          if (resolved.landmark) setLandmark(resolved.landmark);
          if (resolved.city) setCity(resolved.city);
          if (resolved.pincode) setPincode(resolved.pincode);
          setDetectedAddress(resolved.displayName || null);
        } catch {
          // Coordinates are still attached to the address even if reverse
          // geocoding fails — the customer just has to type the rest.
          setDetectedAddress(null);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError(t('locationDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const valid = line1.trim().length >= 3 && city.trim().length >= 2 && /^[1-9]\d{5}$/.test(pincode);

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !save.isPending) save.mutate();
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium">{t('label')}</legend>
        <div className="mt-2 flex gap-2">
          {LABEL_KEYS.map((key) => {
            const value = t(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setLabel(value)}
                aria-pressed={label === value}
                className={cn(
                  'min-h-11 flex-1 rounded-full border px-3 text-sm',
                  label === value
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-primary text-sm font-semibold text-primary disabled:opacity-60"
        >
          <LocateFixed className={cn('size-4', locating && 'animate-pulse')} aria-hidden />
          {locating ? t('locating') : t('useCurrentLocation')}
        </button>
        {detectedAddress && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>{t('detectedAddress', { address: detectedAddress })}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden />
        {t('orEnterManually')}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      <Field id="line1" label={t('line1')} value={line1} onChange={setLine1} />
      <Field id="line2" label={t('line2')} value={line2} onChange={setLine2} optional />
      <Field id="landmark" label={t('landmark')} value={landmark} onChange={setLandmark} optional />
      <Field id="city" label={t('city')} value={city} onChange={setCity} />
      <Field
        id="pincode"
        label={t('pincode')}
        value={pincode}
        onChange={(value) => setPincode(value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
        >
          {tc('cancel')}
        </button>
        <button
          type="submit"
          disabled={!valid || save.isPending}
          className="h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? tc('saving') : tc('save')}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  optional,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  inputMode?: 'numeric' | 'text';
}) {
  const tc = useTranslations('common');

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> ({tc('optional')})</span>}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border bg-card px-3 text-base outline-none focus:border-primary"
      />
    </div>
  );
}
