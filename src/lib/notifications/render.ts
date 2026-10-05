import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import en from '@/i18n/messages/en.json';
import hi from '@/i18n/messages/hi.json';
import mr from '@/i18n/messages/mr.json';
import { formatPaise, paise } from '@/lib/money';
import type { Locale } from '@/generated/prisma/enums';
import { TEMPLATE, type TemplateKey } from './notify';

/**
 * Turns a stored `(templateKey, payload)` pair into text a channel can
 * actually send. This is the piece Phase 6 deferred — a notification row is
 * DATA until now (R7: never a rendered sentence), and this is the one place
 * that data becomes a sentence, in whichever of mr/hi/en the recipient reads.
 *
 * `next-intl`'s `createTranslator` works outside a request (no React, no
 * Next.js context needed), which is exactly what a cron-driven sender is.
 */

const MESSAGES: Record<Locale, Record<string, unknown>> = { mr, hi, en };

/**
 * JSON object keys cannot contain the dots `TEMPLATE` values use (next-intl
 * reads a dot as a nesting path, not a literal character), so each template
 * key maps to a flat message id under the `notifications` namespace.
 */
const MESSAGE_ID: Record<TemplateKey, string> = {
  [TEMPLATE.orderPlaced]: 'orderPlaced',
  [TEMPLATE.orderSubstituted]: 'orderSubstituted',
  [TEMPLATE.orderItemDropped]: 'orderItemDropped',
  [TEMPLATE.orderPaymentPending]: 'orderPaymentPending',
  [TEMPLATE.orderSkippedUnpaid]: 'orderSkippedUnpaid',
  [TEMPLATE.orderStatusChanged]: 'orderStatusChanged',
  [TEMPLATE.lowWalletBalance]: 'lowWalletBalance',
  [TEMPLATE.tomorrowPreview]: 'tomorrowPreview',
  [TEMPLATE.subscriptionExpiring]: 'subscriptionExpiring',
  [TEMPLATE.subscriptionCancelled]: 'subscriptionCancelled',
  [TEMPLATE.mealPlanReady]: 'mealPlanReady',
  [TEMPLATE.orderPlacedAdmin]: 'orderPlacedAdmin',
  [TEMPLATE.orderAssignedRider]: 'orderAssignedRider',
  [TEMPLATE.complaintResolved]: 'complaintResolved',
};

export interface RenderedNotification {
  title: string;
  body: string;
}

const ORDER_STATUS_MESSAGE_ID: Record<Locale, Record<string, string>> = {
  mr: (mr as { orders: { status: Record<string, string> } }).orders.status,
  hi: (hi as { orders: { status: Record<string, string> } }).orders.status,
  en: (en as { orders: { status: Record<string, string> } }).orders.status,
};

function itemNames(locale: Locale, items: unknown): string {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        if ('from' in record && 'to' in record) return `${record.from} → ${record.to}`;
        const key = locale === 'mr' ? 'nameMr' : locale === 'hi' ? 'nameHi' : 'nameEn';
        if (typeof record[key] === 'string') return record[key] as string;
        if (typeof record.name === 'string') return record.name;
      }
      return String(item);
    })
    .join(', ');
}

function money(value: unknown): string {
  if (value === undefined || value === null) return '';
  return formatPaise(paise(String(value)));
}

/**
 * Raw payloads hold the shapes each call site found convenient (`amountPaise`
 * as BigInt-turned-string, `dropped` as a bare string array, `substitutions`
 * as `{from,to,slot}` objects…). This turns those into the flat, already
 * locale-appropriate strings the ICU messages below interpolate.
 */
function variablesFor(
  templateKey: TemplateKey,
  locale: Locale,
  payload: Record<string, unknown>,
): Record<string, string> {
  switch (templateKey) {
    case TEMPLATE.orderPlaced:
      return {
        orderNumber: String(payload.orderNumber ?? ''),
        amount: money(payload.totalPaise),
      };
    case TEMPLATE.orderSubstituted:
      return { date: String(payload.date ?? ''), items: itemNames(locale, payload.substitutions) };
    case TEMPLATE.orderItemDropped:
      return {
        date: String(payload.date ?? ''),
        items: payload.allDropped ? '' : itemNames(locale, payload.dropped),
      };
    case TEMPLATE.orderPaymentPending:
      return { date: String(payload.date ?? ''), amount: money(payload.amountPaise) };
    case TEMPLATE.orderSkippedUnpaid:
      return { date: String(payload.date ?? '') };
    case TEMPLATE.orderStatusChanged:
      return {
        orderNumber: String(payload.orderNumber ?? ''),
        status: ORDER_STATUS_MESSAGE_ID[locale]?.[String(payload.status)] ?? String(payload.status),
      };
    case TEMPLATE.lowWalletBalance:
      return { balance: money(payload.balancePaise), needed: money(payload.neededPaise) };
    case TEMPLATE.tomorrowPreview:
      return { date: String(payload.date ?? ''), total: money(payload.totalPaise), items: itemNames(locale, payload.items) };
    case TEMPLATE.subscriptionExpiring:
      return { daysLeft: String(payload.daysLeft ?? '') };
    case TEMPLATE.subscriptionCancelled:
      return {
        refunded: money(payload.refundedPaise),
        remainingDays: String(payload.remainingDays ?? ''),
      };
    case TEMPLATE.mealPlanReady:
      return {};
    case TEMPLATE.orderPlacedAdmin:
      return {
        orderNumber: String(payload.orderNumber ?? ''),
        amount: money(payload.totalPaise),
      };
    case TEMPLATE.orderAssignedRider:
      return {
        orderNumber: String(payload.orderNumber ?? ''),
        area: String(payload.area ?? ''),
      };
    case TEMPLATE.complaintResolved:
      return {};
    default:
      return {};
  }
}

export function renderNotification(
  templateKey: TemplateKey,
  locale: Locale,
  payload: Record<string, unknown>,
): RenderedNotification {
  const messageId =
    templateKey === TEMPLATE.orderItemDropped && payload.allDropped
      ? 'orderItemDroppedAll'
      : templateKey === TEMPLATE.mealPlanReady && payload.flaggedForReview
        ? 'mealPlanReadyFlagged'
        : MESSAGE_ID[templateKey];

  // `createTranslator`'s key type is inferred from a literal message shape,
  // which only exists for the statically-imported default locale. Every key
  // used here is computed at runtime from `TEMPLATE`, so a loose signature is
  // the honest type rather than a workaround for a real bug.
  const t = createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: 'notifications',
  }) as unknown as (key: string, values?: Record<string, string>) => string;

  const variables = variablesFor(templateKey, locale, payload);

  return {
    title: t(`${messageId}.title`),
    body: t(`${messageId}.body`, variables),
  };
}

/**
 * Where tapping the notification should land.
 *
 * `PushMessage.url` and `public/sw.js`'s `notificationclick` handler have
 * both always supported a deep link; nothing ever supplied one, so every
 * push opened the storefront home instead of the thing it was about. Routes
 * are locale-aware, so the recipient's own language decides the path.
 * Built by hand rather than via `@/i18n/navigation`'s `getPathname`: that
 * one resolves through next-intl's React-navigation build (`next/
 * navigation`), which isn't resolvable outside a full Next.js build/runtime
 * (breaks under Vitest) — this module runs from a plain cron job, so it
 * mirrors `@/i18n/routing`'s `localePrefix: 'as-needed'` manually instead
 * (no prefix for the default locale, 'en'; `/mr`/`/hi` still prefixed).
 */
export function urlFor(
  templateKey: TemplateKey,
  locale: Locale,
  payload: Record<string, unknown>,
): string | undefined {
  const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;

  let pathname: string | undefined;
  switch (templateKey) {
    case TEMPLATE.orderAssignedRider:
      pathname = orderId ? `/delivery/orders/${orderId}` : '/delivery';
      break;
    case TEMPLATE.orderPlacedAdmin:
      pathname = orderId ? `/admin/orders/${orderId}` : '/admin/orders';
      break;
    case TEMPLATE.orderPlaced:
    case TEMPLATE.orderStatusChanged:
    case TEMPLATE.orderSubstituted:
    case TEMPLATE.orderItemDropped:
    case TEMPLATE.orderPaymentPending:
    case TEMPLATE.orderSkippedUnpaid:
      pathname = orderId ? `/orders/${orderId}` : '/orders';
      break;
    case TEMPLATE.mealPlanReady:
    case TEMPLATE.tomorrowPreview:
      pathname = '/meal-plan';
      break;
    case TEMPLATE.lowWalletBalance:
      pathname = '/wallet';
      break;
    case TEMPLATE.complaintResolved:
      pathname = '/complaints';
      break;
    default:
      return undefined;
  }

  return locale === DEFAULT_LOCALE ? pathname : `/${locale}${pathname}`;
}
