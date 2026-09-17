'use client';

import { useId, useState } from 'react';
import { formatPaise, paise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Dashboard charts (session 2026-09-17) — plain inline SVG, no charting
 * library. Built against this session's dataviz skill: one axis per chart
 * (a "revenue vs orders" dual-axis chart was deliberately split into two
 * small multiples instead), a single hue for magnitude/trend (the app's own
 * `--primary` green), the skill's validated 8-slot categorical palette for
 * genuine multi-category identity (order status, payment method — each
 * mapped to a FIXED slot below, never reassigned by rank so a status keeps
 * its color across renders), and a hover/focus tooltip on every mark whose
 * value is also always visible as a direct label (the tooltip enhances, it
 * never gates).
 */

const SEQUENTIAL_HUE = '#2fa355'; // the app's own --primary green

/** The dataviz skill's validated 8-slot categorical order — fixed, never
    reordered or generated past 8. Each chart below maps its own categories
    onto a fixed subset of these slots (see CATEGORY_COLORS below) so a
    given status/method keeps the same color everywhere it appears. */
const CATEGORICAL = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948',
} as const;

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PLACED: CATEGORICAL.blue,
  CONFIRMED: CATEGORICAL.orange,
  PACKED: CATEGORICAL.aqua,
  OUT_FOR_DELIVERY: CATEGORICAL.yellow,
  DELIVERED: CATEGORICAL.green,
  CANCELLED: CATEGORICAL.red,
  FAILED_DELIVERY: CATEGORICAL.violet,
  REFUNDED: CATEGORICAL.magenta,
  PAYMENT_PENDING: CATEGORICAL.orange,
};

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  WALLET: CATEGORICAL.blue,
  RAZORPAY: CATEGORICAL.orange,
  COD: CATEGORICAL.aqua,
};

/** A small floating tooltip anchored to a pointer position within an SVG's
    parent card — shared by every chart below so hover/focus reads the same
    everywhere. Positioned in plain CSS px relative to the card, not SVG
    units, so it never scales/distorts with the viewBox. */
/** `xPct`/`yPct` are 0-100 positions within the chart's own viewBox — the
    wrapping `relative` div always matches the SVG's rendered box exactly
    (viewBox scales uniformly to `w-full`), so a plain CSS percentage lands
    correctly regardless of the container's actual rendered pixel width. */
function ChartTooltip({
  xPct,
  yPct,
  children,
}: {
  xPct: number;
  yPct: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-lg"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      role="tooltip"
    >
      {children}
    </div>
  );
}

/* ── Revenue trend — area + line, single hue, crosshair tooltip. ────────── */

export function RevenueTrendChart({
  data,
}: {
  data: Array<{ dateKey: string; revenuePaise: string }>;
}) {
  const width = 600;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 22, left: 8 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = data.map((d) => Number(paise(d.revenuePaise)) / 100);
  const max = Math.max(...values, 1);

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = padding.top + plotH - (values[i] / max) * plotH;
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? 0} ${padding.top + plotH} L ${points[0]?.x ?? 0} ${padding.top + plotH} Z`;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(event: React.PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Revenue by day"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEQUENTIAL_HUE} stopOpacity={0.12} />
            <stop offset="100%" stopColor={SEQUENTIAL_HUE} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Hairline baseline only — no full gridline field, kept recessive. */}
        <line
          x1={padding.left}
          y1={padding.top + plotH}
          x2={padding.left + plotW}
          y2={padding.top + plotH}
          stroke="var(--border)"
          strokeWidth={1}
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={SEQUENTIAL_HUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* First/last date as the only direct labels — endpoints, not every
            point, per the skill's "label selectively" rule. */}
        <text x={padding.left} y={height - 6} fontSize={10} fill="var(--text-muted)">
          {formatShortDate(data[0]?.dateKey)}
        </text>
        <text x={padding.left + plotW} y={height - 6} fontSize={10} fill="var(--text-muted)" textAnchor="end">
          {formatShortDate(data[data.length - 1]?.dateKey)}
        </text>

        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={padding.top}
              x2={hovered.x}
              y2={padding.top + plotH}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={SEQUENTIAL_HUE} stroke="var(--card)" strokeWidth={2} />
          </>
        )}

        {/* The hit target — the crosshair finds X, so one full-width rect
            covers the whole plot rather than per-point pinpoint targets. */}
        <rect
          x={padding.left}
          y={0}
          width={plotW}
          height={height}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
          onFocus={() => setHoverIndex(points.length - 1)}
          onBlur={() => setHoverIndex(null)}
          tabIndex={0}
        />
      </svg>

      {hovered && (
        <ChartTooltip xPct={(hovered.x / width) * 100} yPct={(hovered.y / height) * 100}>
          <p className="font-semibold">{formatPaise(paise(hovered.d.revenuePaise), { hidePaise: true })}</p>
          <p className="text-background/70">{formatShortDate(hovered.d.dateKey)}</p>
        </ChartTooltip>
      )}
    </div>
  );
}

/* ── Orders trend — thin bars, single hue, per-bar tooltip. ─────────────── */

export function OrdersTrendChart({ data }: { data: Array<{ dateKey: string; orders: number }> }) {
  const width = 600;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 22, left: 8 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.orders), 1);
  const gap = 3;
  const barW = Math.min(24, plotW / data.length - gap);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Orders by day">
        <line
          x1={padding.left}
          y1={padding.top + plotH}
          x2={padding.left + plotW}
          y2={padding.top + plotH}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const slot = plotW / data.length;
          const x = padding.left + i * slot + (slot - barW) / 2;
          const barH = (d.orders / max) * plotH;
          const y = padding.top + plotH - barH;
          const active = hoverIndex === i;
          return (
            <rect
              key={d.dateKey}
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, d.orders > 0 ? 2 : 0)}
              rx={4}
              fill={SEQUENTIAL_HUE}
              opacity={active ? 1 : 0.85}
              onPointerEnter={() => setHoverIndex(i)}
              onPointerLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              tabIndex={0}
            />
          );
        })}

        <text x={padding.left} y={height - 6} fontSize={10} fill="var(--text-muted)">
          {formatShortDate(data[0]?.dateKey)}
        </text>
        <text x={padding.left + plotW} y={height - 6} fontSize={10} fill="var(--text-muted)" textAnchor="end">
          {formatShortDate(data[data.length - 1]?.dateKey)}
        </text>
      </svg>

      {hoverIndex !== null && (
        <ChartTooltip
          xPct={((padding.left + hoverIndex * (plotW / data.length) + (plotW / data.length) / 2) / width) * 100}
          yPct={(padding.top / height) * 100}
        >
          <p className="font-semibold">{data[hoverIndex].orders} orders</p>
          <p className="text-background/70">{formatShortDate(data[hoverIndex].dateKey)}</p>
        </ChartTooltip>
      )}
    </div>
  );
}

/* ── Horizontal bars — reused for order status / top categories / payment
   method. `color` per item for genuine categorical identity (status,
   payment method); a single shared hue for a nominal-magnitude ranking
   (top categories) — never a value-ramp over nominal categories. ────────── */

export function HorizontalBarChart({
  items,
  valueFormat,
}: {
  items: Array<{ key: string; label: string; value: number; color: string; sublabel?: string }>;
  valueFormat: (value: number) => string;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => {
        const pct = Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0);
        const active = hoverKey === item.key;
        return (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onPointerEnter={() => setHoverKey(item.key)}
              onPointerLeave={() => setHoverKey(null)}
              onFocus={() => setHoverKey(item.key)}
              onBlur={() => setHoverKey(null)}
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {valueFormat(item.value)}
                </span>
              </div>
              <div className={cn('h-2.5 min-h-[10px] w-full overflow-hidden rounded-full bg-secondary')}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${pct}%`, backgroundColor: item.color, opacity: active ? 1 : 0.9 }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function formatShortDate(dateKey: string | undefined): string {
  if (!dateKey) return '';
  const [, month, day] = dateKey.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(month) - 1;
  return `${Number(day)} ${monthNames[idx] ?? ''}`;
}
