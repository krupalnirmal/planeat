'use client';

import { useState } from 'react';
import { BasePlanBuilder, type FinalSelection } from '@/components/meal-plan/base-plan-builder';
import { BasePlanFinal } from '@/components/meal-plan/base-plan-final';
import { MealPlanTerms } from '@/components/meal-plan/meal-plan-terms';

type Step = 'terms' | 'builder' | 'final';

/**
 * Terms gate → day-by-day picker → final plan (D-204). Replaces the old
 * AI-personalised intake-wizard flow as the default free "Make My Meal
 * Plan" entry point, per the client's brief — the wizard/generation code
 * (`intake-wizard.tsx`, `src/lib/meal-plan/generate.ts`) is left intact and
 * unlinked for a possible future paid, nutritionist-personalised tier
 * rather than deleted.
 */
export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('terms');
  const [selection, setSelection] = useState<FinalSelection[]>([]);

  if (step === 'terms') {
    return <MealPlanTerms onAgree={() => setStep('builder')} />;
  }

  if (step === 'builder') {
    return (
      <BasePlanBuilder
        onConfirm={(result) => {
          setSelection(result);
          setStep('final');
        }}
      />
    );
  }

  return <BasePlanFinal selection={selection} onEdit={() => setStep('builder')} />;
}
