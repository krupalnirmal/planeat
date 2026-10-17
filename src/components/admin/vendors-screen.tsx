'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminResponsiveTable } from '@/components/admin/admin-shell';
import { Link } from '@/i18n/navigation';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * The admin half of the Vendor role (session 2026-10-04) — mirrors
 * `delivery-partners-screen.tsx`'s shape exactly, for suppliers instead of
 * riders: a list with an inline "Add Vendor" form, each row linking to its
 * own detail page (`/admin/vendors/[id]`) where supplies get confirmed or
 * rejected and payments are recorded.
 *
 * The vendor's pin (session 2026-10-17, replacing a same-day ServiceArea
 * version on client feedback — "assign to whichever vendor is nearest the
 * customer") drives `findNearestVendor()` (`src/lib/vendor/match.ts`), not
 * an area match. There's no map UI or forward-geocoding anywhere in this
 * app yet, so the admin enters raw coordinates — read off Google Maps
 * (long-press a pin → the numbers at the bottom), or captured on the spot
 * with the "Use my current location" button below, same
 * `getCurrentPosition` call `address-manager.tsx`'s customer-facing one
 * already uses.
 */

interface VendorRow {
  id: string;
  name: string;
  phone: string;
  businessName: string;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  balancePaise: string;
  pendingSupplies: number;
}

export function AdminVendorsScreen() {
  const t = useTranslations('admin.vendors');
  const tc = useTranslations('admin.common');
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const vendors = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: () => api.get<{ vendors: VendorRow[] }>('/api/admin/vendors'),
  });

  const rows = vendors.data?.vendors ?? [];

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        subtitle={t('hint')}
        action={
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            <Plus className="size-3.5" aria-hidden />
            {t('addVendor')}
          </button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {showForm && (
        <AddVendorForm
          onDone={(message) => {
            setNotice(message);
            setShowForm(false);
            void queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
          }}
        />
      )}

      {vendors.isLoading ? (
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {tc('empty')}
        </p>
      ) : (
        <AdminResponsiveTable
          table={
            <>
              <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('businessName')}</th>
                  <th className="px-3 py-2 font-medium">{t('contact')}</th>
                  <th className="px-3 py-2 font-medium">{t('location')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('balanceOwed')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('pending')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((vendor) => (
                  <tr key={vendor.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/admin/vendors/${vendor.id}`} className="text-primary hover:underline">
                        {vendor.businessName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {vendor.name}
                      <br />
                      <span className="font-mono">{vendor.phone}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <VendorMapLink vendor={vendor} label={t('viewOnMap')} noPin={t('noPin')} />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">
                      {formatPaise(paise(vendor.balancePaise))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {vendor.pendingSupplies > 0 ? (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
                          {vendor.pendingSupplies}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {vendor.isActive ? t('active') : t('inactive')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          }
          cards={rows.map((vendor) => (
            <li key={vendor.id}>
              <Link
                href={`/admin/vendors/${vendor.id}`}
                className="card-3d flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{vendor.businessName}</p>
                  <p className="text-xs text-muted-foreground">{vendor.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{vendor.phone}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    <VendorMapLink vendor={vendor} label={t('viewOnMap')} noPin={t('noPin')} />
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-bold tabular-nums">{formatPaise(paise(vendor.balancePaise))}</p>
                  {vendor.pendingSupplies > 0 && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
                      {vendor.pendingSupplies} {t('pending')}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        />
      )}
    </>
  );
}

/** A plain `maps.google.com/?q=lat,lng` link — no API key, same
    zero-dependency approach this codebase already uses for geocoding
    (`/api/geocode/reverse`). `null` when the vendor has no pin yet. */
function VendorMapLink({
  vendor,
  label,
  noPin,
}: {
  vendor: { latitude: number | null; longitude: number | null };
  label: string;
  noPin: string;
}) {
  if (vendor.latitude == null || vendor.longitude == null) return <>{noPin}</>;
  return (
    <a
      href={`https://www.google.com/maps?q=${vendor.latitude},${vendor.longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <MapPin className="size-3" aria-hidden />
      {label}
    </a>
  );
}

/** Latitude/longitude pair + a "use my current location" convenience —
    the primary path is still typing coordinates read off Google Maps,
    since there's no forward-geocoding or map-click UI in this app yet.
    Exported — `VendorDetailScreen`'s own edit control reuses it. */
export function LocationFields({
  latitude,
  longitude,
  onChange,
}: {
  latitude: string;
  longitude: string;
  onChange: (next: { latitude: string; longitude: string }) => void;
}) {
  const t = useTranslations('admin.vendors');
  const [locating, setLocating] = useState(false);

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('latitude')}
        <input
          type="number"
          step="any"
          value={latitude}
          onChange={(event) => onChange({ latitude: event.target.value, longitude })}
          className="h-9 w-28 rounded border border-border bg-background px-2 text-sm outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('longitude')}
        <input
          type="number"
          step="any"
          value={longitude}
          onChange={(event) => onChange({ latitude, longitude: event.target.value })}
          className="h-9 w-28 rounded border border-border bg-background px-2 text-sm outline-none"
        />
      </label>
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex h-9 items-center gap-1 rounded-[var(--radius)] border border-border px-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
      >
        <MapPin className="size-3.5" aria-hidden />
        {locating ? '…' : t('useCurrentLocation')}
      </button>
    </>
  );
}

function AddVendorForm({ onDone }: { onDone: (message: string) => void }) {
  const t = useTranslations('admin.vendors');
  const tc = useTranslations('admin.common');

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/admin/vendors', {
        phone,
        name,
        businessName,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
      }),
    onSuccess: () => onDone(t('added')),
    onError: (err) => {
      setError(
        err instanceof ApiClientError && err.code === 'CONFLICT' ? t('phoneInUse') : tc('failed'),
      );
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        create.mutate();
      }}
      className="mb-4 flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-border bg-card p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('contactName')}
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-40 rounded border border-border bg-background px-2 text-sm outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('businessName')}
        <input
          required
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          className="h-9 w-48 rounded border border-border bg-background px-2 text-sm outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('phone')}
        <input
          required
          inputMode="numeric"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-9 w-32 rounded border border-border bg-background px-2 text-sm outline-none"
        />
      </label>
      <LocationFields
        latitude={latitude}
        longitude={longitude}
        onChange={(next) => {
          setLatitude(next.latitude);
          setLongitude(next.longitude);
        }}
      />
      <button
        type="submit"
        disabled={create.isPending}
        className={cn(
          'h-9 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground',
          create.isPending && 'opacity-60',
        )}
      >
        {t('add')}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
