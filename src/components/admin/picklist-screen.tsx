'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Printer, Sunrise, Sunset } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { api, qs } from '@/lib/api/client';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * M9's starred screen (⭐) — "this replaces the owner's notebook".
 *
 * Two views of the same orders, used at two different moments:
 *
 *   The AGGREGATE is what the owner carries to the mandi at 05:00. Heaviest
 *   line first, because that is the order they walk the market in, and short
 *   lines flagged in red so they know to leave early.
 *
 *   The PACKING SLIPS are what goes in each bag afterwards, grouped under
 *   सकाळी / संध्याकाळी (B1) so the customer knows what to cook when.
 *
 * Both are laid out to survive `Ctrl+P` onto A4 — see the print rules at the
 * bottom. Paper is what actually goes to the market; the screen is where it
 * is prepared.
 */

interface PicklistLine {
  variantId: string;
  name: string;
  totalQuantity: number;
  displayQuantity: string;
  orderCount: number;
  stockQty: number;
  shortfall: number;
}

interface SlipItem {
  name: string;
  displayQuantity: string;
  isSubstituted: boolean;
  originalName: string | null;
}

interface PackingSlip {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  landmark: string | null;
  riderName: string | null;
  morning: SlipItem[];
  evening: SlipItem[];
  unslotted: SlipItem[];
  totalPaise: string;
  paymentMethod: string;
  paymentStatus: string;
  notes: string | null;
}

interface PicklistResponse {
  dateKey: string;
  orderCount: number;
  lines: PicklistLine[];
  slips: PackingSlip[];
  shortfallCount: number;
}

export function PicklistScreen() {
  const t = useTranslations('admin.picklist');
  const tc = useTranslations('admin.common');
  const locale = useLocale();

  const [date, setDate] = useState<string | null>(null);

  const picklist = useQuery({
    queryKey: ['admin-picklist', date, locale],
    queryFn: () =>
      api.get<PicklistResponse>(`/api/admin/picklist${qs({ date: date ?? undefined, locale })}`),
  });

  if (picklist.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const data = picklist.data;
  if (!data) return <p className="text-sm text-danger">{tc('failed')}</p>;

  const csvHref = `/api/admin/picklist${qs({ date: data.dateKey, locale, format: 'csv' })}`;

  return (
    <>
      <AdminPageHeader
        title={t('title')}
        subtitle={t('subtitle', { date: data.dateKey })}
        action={
          <>
            <input
              type="date"
              value={data.dateKey}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 rounded-[var(--radius)] border border-border bg-card px-3 text-sm outline-none"
            />
            <a
              href={csvHref}
              className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-card px-3 text-xs font-semibold"
            >
              <Download className="size-3.5" aria-hidden />
              {t('downloadCsv')}
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-10 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground"
            >
              <Printer className="size-3.5" aria-hidden />
              {t('print')}
            </button>
          </>
        }
      />

      {data.orderCount === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('noOrders')}
        </p>
      ) : (
        <>
          {data.shortfallCount > 0 && (
            <p className="mb-4 flex items-center gap-2 rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t('shortfallAlert', { count: data.shortfallCount })}
            </p>
          )}

          {/* ── What to buy. */}
          <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold">
              {t('aggregate')} · {data.orderCount} {t('orders')}
            </h2>

            <AdminTable>
              <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('item')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('quantity')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('orders')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('inStock')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('shortBy')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.variantId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-medium">{line.name}</td>
                    <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">
                      {line.displayQuantity}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {line.orderCount}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {line.stockQty}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right font-semibold tabular-nums',
                        line.shortfall > 0 ? 'text-danger' : 'text-muted-foreground',
                      )}
                    >
                      {line.shortfall > 0 ? line.shortfall : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </section>

          {/* ── What goes in each bag. One card per customer, each starting on
              its own page when printed. */}
          <section>
            <h2 className="mb-3 text-base font-semibold">{t('slips')}</h2>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 print:block">
              {data.slips.map((slip) => (
                <article
                  key={slip.orderId}
                  className="break-inside-avoid rounded-[var(--radius)] border border-border bg-card p-4 print:mb-4 print:break-after-page"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{slip.customerName}</p>
                      <p className="text-xs text-muted-foreground">{slip.customerPhone}</p>
                    </div>
                    <p className="shrink-0 text-xs font-mono text-muted-foreground">
                      {slip.orderNumber}
                    </p>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {slip.address}
                    {slip.landmark && ` · ${slip.landmark}`}
                  </p>

                  {/* B1 — सकाळी / संध्याकाळी headers, so the customer knows
                      what to cook when. */}
                  {slip.morning.length > 0 && (
                    <SlipSection title={t('morning')} icon={Sunrise} items={slip.morning} t={t} />
                  )}
                  {slip.evening.length > 0 && (
                    <SlipSection title={t('evening')} icon={Sunset} items={slip.evening} t={t} />
                  )}
                  {slip.unslotted.length > 0 && (
                    <SlipSection title={t('other')} icon={null} items={slip.unslotted} t={t} />
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className={slip.riderName ? '' : 'text-warning'}>
                      {slip.riderName ?? t('unassigned')}
                    </span>
                    <span className="font-bold">
                      {/* COD is the one thing the rider must not forget. */}
                      {slip.paymentMethod === 'COD' && slip.paymentStatus !== 'PAID' ? (
                        <span className="text-danger">
                          {t('cod')} {formatPaise(paise(slip.totalPaise))}
                        </span>
                      ) : (
                        formatPaise(paise(slip.totalPaise), { hidePaise: true })
                      )}
                    </span>
                  </div>

                  {slip.notes && (
                    <p className="mt-2 rounded bg-secondary px-2 py-1.5 text-[11px]">
                      {slip.notes}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SlipSection({
  title,
  icon: Icon,
  items,
  t,
}: {
  title: string;
  icon: typeof Sunrise | null;
  items: SlipItem[];
  t: ReturnType<typeof useTranslations<'admin.picklist'>>;
}) {
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase">
        {Icon && <Icon className="size-3 text-accent" aria-hidden />}
        {title}
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, index) => (
          <li key={index} className="flex justify-between gap-2 text-sm">
            <span className="min-w-0">
              {item.name}
              {/* B7 — a substitution is never silent, not even on paper. */}
              {item.isSubstituted && item.originalName && (
                <span className="ml-1 text-[11px] text-warning">
                  {t('substitutedFrom', { name: item.originalName })}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{item.displayQuantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
