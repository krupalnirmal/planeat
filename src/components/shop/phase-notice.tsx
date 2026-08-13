import { Hammer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/**
 * A visible, honest placeholder for a screen that a later phase fills in.
 *
 * Every string is translated (R7), so an empty state never becomes the place
 * where hard-coded English sneaks into the Marathi UI.
 */
export async function PhaseNotice({ phase }: { phase: number }) {
  const t = await getTranslations('common');

  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed border-border bg-card px-4 py-8 text-center">
      <Hammer className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{t('comingSoon')}</p>
      <p className="text-xs text-muted-foreground">{t('phase')}</p>
      <p className="text-[11px] text-muted-foreground/70">Phase {phase}</p>
    </div>
  );
}
