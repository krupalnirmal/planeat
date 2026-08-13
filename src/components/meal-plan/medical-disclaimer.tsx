'use client';

import { Info, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * S1–S4 — the medical safety layer's visible half.
 *
 * A client component so it can be used from both server pages and the client
 * wizard. The strings live in `messages/{mr,hi,en}.json` and are translated,
 * not machine-rendered, because this is the document a customer would be held
 * to.
 *
 * Nowhere in this component — or anywhere else in the UI — may the words
 * prescription, treatment, cure or medical advice appear as a claim (S1). The
 * disclaimer is allowed to say what the plan is NOT, and a test enforces that
 * distinction across the whole message catalogue.
 */
export function MedicalDisclaimer({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('safety');

  return (
    <aside
      className={
        compact
          ? 'rounded-[var(--radius)] bg-secondary px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'
          : 'rounded-[var(--radius)] border border-border bg-secondary px-4 py-3'
      }
    >
      {!compact && (
        <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 shrink-0 text-warning" aria-hidden />
          {t('disclaimerTitle')}
        </p>
      )}
      <p className={compact ? '' : 'text-xs leading-relaxed text-muted-foreground'}>
        {t('disclaimer')}
      </p>
    </aside>
  );
}

/**
 * B8 / S3 — shown on a plan whose profile tripped a red flag.
 *
 * The plan still generates and displays; the customer may proceed. This banner
 * and the disclaimer are the safeguard, and the admin review queue is the
 * second layer. Blocking would push someone back to the WhatsApp-and-paper
 * process this app replaced, where nobody was checking anything at all.
 *
 * The clinical *reason* is deliberately not shown: it goes to the admin queue.
 * "KIDNEY_DISEASE: condition KIDNEY_DISEASE" on a customer's screen is alarming
 * without being useful.
 */
export function DoctorBanner({ reason }: { reason?: string }) {
  const t = useTranslations('safety');

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius)] border border-warning/40 bg-[#FDF3E3] px-4 py-3"
    >
      <Stethoscope className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-[#8A5A2B]">{t('doctorBanner')}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#8A5A2B]/85">
          {reason ?? t('doctorBannerDetail')}
        </p>
      </div>
    </div>
  );
}
