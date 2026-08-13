import { createTranslator } from 'next-intl';
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
