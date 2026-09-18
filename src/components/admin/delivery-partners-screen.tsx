'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminResponsiveTable } from '@/components/admin/admin-shell';
import { ApiClientError, api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * M9 — "Delivery Partners: CRUD, availability, load."
 *
 * The load column is the same number B12's suggestion panel uses to decide
 * who gets the next order — showing it here is what lets the owner notice a
 * rider is overloaded before the suggestion panel quietly routes around them
 * all morning.
 */

const VEHICLES = ['BICYCLE', 'BIKE', 'SCOOTER', 'EV', 'WALK'] as const;

interface Partner {
  id: string;
  name: string;
  phone: string;
  vehicleType: (typeof VEHICLES)[number];
  isAvailable: boolean;
  serviceAreaId: string | null;
  serviceAreaName: string | null;
  todayLoad: number;
}

interface ServiceArea {
  id: string;
  name: string;
  pincode: string;
}

export function AdminDeliveryPartnersScreen() {
  const t = useTranslations('admin.deliveryPartners');
  const tc = useTranslations('admin.common');
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const partners = useQuery({
    queryKey: ['admin-delivery-partners'],
    queryFn: () => api.get<{ partners: Partner[] }>('/api/admin/delivery-partners'),
  });

  const areas = useQuery({
    queryKey: ['admin-service-areas'],
    queryFn: () => api.get<{ areas: ServiceArea[] }>('/api/admin/service-areas'),
  });

  const toggleAvailable = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/api/admin/delivery-partners/${id}`, { isAvailable }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] }),
  });

  const rows = partners.data?.partners ?? [];

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
            {t('addRider')}
          </button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      {showForm && (
        <AddRiderForm
          areas={areas.data?.areas ?? []}
          onDone={(message) => {
            setNotice(message);
            setShowForm(false);
            void queryClient.invalidateQueries({ queryKey: ['admin-delivery-partners'] });
          }}
        />
      )}

      {partners.isLoading ? (
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
                  <th className="px-3 py-2 font-medium">{t('name')}</th>
                  <th className="px-3 py-2 font-medium">{t('phone')}</th>
                  <th className="px-3 py-2 font-medium">{t('vehicle')}</th>
                  <th className="px-3 py-2 font-medium">{t('area')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('load')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('available')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((partner) => (
                  <tr key={partner.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{partner.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{partner.phone}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t(`vehicles.${partner.vehicleType}`)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {partner.serviceAreaName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                      {partner.todayLoad}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={partner.isAvailable}
                        onChange={(event) =>
                          toggleAvailable.mutate({ id: partner.id, isAvailable: event.target.checked })
                        }
                        className="size-4 accent-[var(--primary)]"
                        aria-label={t('available')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          }
          cards={rows.map((partner) => (
            <li
              key={partner.id}
              className="card-3d flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{partner.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{partner.phone}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t(`vehicles.${partner.vehicleType}`)} · {partner.serviceAreaName ?? '—'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <p className="text-lg font-bold tabular-nums">{partner.todayLoad}</p>
                <input
                  type="checkbox"
                  checked={partner.isAvailable}
                  onChange={(event) =>
                    toggleAvailable.mutate({ id: partner.id, isAvailable: event.target.checked })
                  }
                  className="size-4 accent-[var(--primary)]"
                  aria-label={t('available')}
                />
              </div>
            </li>
          ))}
        />
      )}
    </>
  );
}

function AddRiderForm({
  areas,
  onDone,
}: {
  areas: ServiceArea[];
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin.deliveryPartners');
  const tc = useTranslations('admin.common');

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [vehicleType, setVehicleType] = useState<(typeof VEHICLES)[number]>('BIKE');
  const [serviceAreaId, setServiceAreaId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/admin/delivery-partners', {
        phone,
        name,
        vehicleType,
        serviceAreaId: serviceAreaId || null,
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
        {t('name')}
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-9 w-40 rounded border border-border bg-background px-2 text-sm outline-none"
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
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('vehicle')}
        <select
          value={vehicleType}
          onChange={(event) => setVehicleType(event.target.value as (typeof VEHICLES)[number])}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
        >
          {VEHICLES.map((vehicle) => (
            <option key={vehicle} value={vehicle}>
              {t(`vehicles.${vehicle}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t('area')}
        <select
          value={serviceAreaId}
          onChange={(event) => setServiceAreaId(event.target.value)}
          className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
        >
          <option value="">{t('noArea')}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name} ({area.pincode})
            </option>
          ))}
        </select>
      </label>
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
