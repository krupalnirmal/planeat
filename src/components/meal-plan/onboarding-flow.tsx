'use client';

import { useState } from 'react';
import { DraftPlanBuilder } from '@/components/meal-plan/draft-plan-builder';
import { DraftPlanFinal } from '@/components/meal-plan/draft-plan-final';
import { FamilyIntake } from '@/components/meal-plan/family-intake';
import { IntakeWizard } from '@/components/meal-plan/intake-wizard';
import { MealPlanTerms } from '@/components/meal-plan/meal-plan-terms';
import { PlanTypeChooser } from '@/components/meal-plan/plan-type-chooser';

type Step = 'terms' | 'planType' | 'personal' | 'family' | 'plan' | 'final';

/**
 * Terms gate → Personal/Family plan type → matching intake → AI-generated
 * day-by-day options → final preview → real MealPlan. Full rebuild of the
 * interim static flow (D-204/205) per the client's formal requirement doc
 * (session 2026-08-18) — see DECISIONS.md for what stayed vs. changed.
 */
export function OnboardingFlow({
  dislikeOptions,
}: {
  dislikeOptions: Array<{ id: string; name: string }>;
}) {
  const [step, setStep] = useState<Step>('terms');
  const [draftId, setDraftId] = useState<string | null>(null);

  if (step === 'terms') {
    return <MealPlanTerms onAgree={() => setStep('planType')} />;
  }

  if (step === 'planType') {
    return (
      <PlanTypeChooser
        onChoose={(planType) => setStep(planType === 'PERSONAL' ? 'personal' : 'family')}
      />
    );
  }

  if (step === 'personal') {
    return (
      <IntakeWizard
        dislikeOptions={dislikeOptions}
        onBack={() => setStep('planType')}
        onDraftReady={(id) => {
          setDraftId(id);
          setStep('plan');
        }}
      />
    );
  }

  if (step === 'family') {
    return (
      <FamilyIntake
        dislikeOptions={dislikeOptions}
        onBack={() => setStep('planType')}
        onDraftReady={(id) => {
          setDraftId(id);
          setStep('plan');
        }}
      />
    );
  }

  if (step === 'plan') {
    return <DraftPlanBuilder onConfirm={() => setStep('final')} />;
  }

  // step === 'final'
  return <DraftPlanFinal draftId={draftId ?? ''} onEdit={() => setStep('plan')} />;
}
