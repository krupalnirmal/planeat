'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * Customer orders routed to this vendor to pack (session 2026-10-16),
 * auto-assigned by service area at order placement — the second half of
 * the Vendor role, alongside `dashboard.tsx`'s supply reporting. Deliberately
 * shows no customer name/phone/address, mirroring `src/lib/vendor/orders.ts`'s
 * own privacy boundary.
 */

type OrderStatus = 'PLACED' | 'CONFIRMED' | 'PACKED';
type OrderType = 'INSTANT' | 'MEAL_PLAN_DAILY' | 'MEAL_PLAN_WEEKLY';

interface VendorOrderItem {
  name: string;
  quantity: number;
}

type AssignmentStatus = 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

interface VendorOrderAssignment {
  status: AssignmentStatus;
  partnerName: string;
}

interface VendorOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  placedAt: string;
  items: VendorOrderItem[];
  assignment: VendorOrderAssignment | null;
}

export function VendorOrdersPanel() {
  const t = useTranslations('vendor.orders');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const orders = useQuery({
    queryKey: ['vendor-orders'],
    queryFn: () => api.get<{ orders: VendorOrderRow[] }>('/api/vendor/orders'),
    refetchInterval: 30_000,
  });

  const pack = useMutation({
    mutationFn: (orderId: string) => api.post(`/api/vendor/orders/${orderId}/pack`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vendor-orders'] }),
  });

  const rows = orders.data?.orders ?? [];

  if (orders.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {t('noOrders')}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          onPack={() => pack.mutate(order.id)}
          packing={pack.isPending && pack.variables === order.id}
        />
      ))}
    </ul>
  );
}

function OrderRow({
  order,
  onPack,
  packing,
}: {
  order: VendorOrderRow;
  onPack: () => void;
  packing: boolean;
}) {
  const t = useTranslations('vendor.orders');

  return (
    <li className="rounded-[var(--radius)] border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold">{order.orderNumber}</span>
          <StatusPill status={order.status} />
          {order.type !== 'INSTANT' && (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {t('mealPlanBadge')}
            </span>
          )}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {order.items.map((item, index) => (
          <li key={index}>
            {item.name} × {item.quantity}
          </li>
        ))}
      </ul>
      {order.status === 'CONFIRMED' && (
        <button
          type="button"
          onClick={onPack}
          disabled={packing}
          className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          <PackageCheck className="size-3.5" aria-hidden />
          {t('markAsPacked')}
        </button>
      )}
      {order.status === 'PACKED' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {order.assignment
            ? order.assignment.status === 'ASSIGNED'
              ? t('assignedTo', { name: order.assignment.partnerName })
              : t('pickedUpBy', { name: order.assignment.partnerName })
            : t('awaitingPickup')}
        </p>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const t = useTranslations('vendor.orders.status');
  const tone: Record<OrderStatus, string> = {
    PLACED: 'bg-secondary text-muted-foreground',
    CONFIRMED: 'bg-[#FDF3E3] text-warning',
    PACKED: 'bg-tint-green text-primary-dark',
  };
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', tone[status])}>
      {t(status)}
    </span>
  );
}
