'use client';

import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Stethoscope, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MedicalDisclaimer } from '@/components/meal-plan/medical-disclaimer';
import { ApiClientError, api, qs } from '@/lib/api/client';
import {
  ACTIVITY_LEVELS,
  ALLERGENS,
  DIETARY_PREFERENCES,
  HEALTH_GOALS,
  MEDICAL_CONDITIONS,
} from '@/lib/meal-plan/taxonomy';
import { cn } from '@/lib/utils';

/**
 * M5 — the 7-step intake wizard.
 *
 * One step per screen because it runs on a 390px phone: a single long form
 * would need scrolling past fields the customer has already answered, and the
 * abandon rate on long health forms is exactly why the owner was collecting
 * this on WhatsApp instead.
 *
 * S2 — step 7 carries the mandatory consent checkbox and the disclaimer. The
 * finish button stays disabled until it is ticked, and the API refuses without
 * it regardless of what the client does.
 */

const TOTAL_STEPS = 7;

interface Draft {
  age: string;
  heightCm: string;
  weightKg: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
  activityLevel: '' | (typeof ACTIVITY_LEVELS)[number];
  householdAdults: number;
  householdChildren: number;
  medicalConditions: string[];
  medications: string;
  allergies: string[];
  dietaryPreference: (typeof DIETARY_PREFERENCES)[number];
  dislikedProductIds: string[];
  goal: (typeof HEALTH_GOALS)[number];
  notes: string;
  consentGiven: boolean;
}

const EMPTY: Draft = {
  age: '',
  heightCm: '',
  weightKg: '',
  gender: '',
  activityLevel: '',
  householdAdults: 2,
  householdChildren: 0,
  medicalConditions: [],
  medications: '',
  allergies: [],
  dietaryPreference: 'VEG',
  dislikedProductIds: [],
  goal: 'GENERAL_HEALTH',
  notes: '',
  consentGiven: false,
};

export function IntakeWizard({
  initial,
  dislikeOptions,
  onBack,
  onDraftReady,
}: {
  initial?: Partial<Draft>;
  dislikeOptions: Array<{ id: string; name: string }>;
  /** Step 1's back button — returns to the plan-type chooser. */
  onBack: () => void;
  /** The options draft finished generating; move to the day-by-day picker. */
  onDraftReady: (draftId: string) => void;
}) {
  const t = useTranslations('intake');
  const tm = useTranslations('mealPlan');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const tp = useTranslations('profile');
  const ts = useTranslations('safety');
  const locale = useLocale();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...initial });
  const [allergyText, setAllergyText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function patch(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function toggleCondition(code: string) {
    setDraft((current) => {
      // "None of these" is exclusive — holding it alongside diabetes is not a
      // state the customer can have meant.
      if (code === 'NONE') {
        return { ...current, medicalConditions: current.medicalConditions.includes('NONE') ? [] : ['NONE'] };
      }
      const without = current.medicalConditions.filter((c) => c !== 'NONE');
      return {
        ...current,
        medicalConditions: without.includes(code)
          ? without.filter((c) => c !== code)
          : [...without, code],
      };
    });
  }

  function toggleAllergen(code: string) {
    setDraft((current) => ({
      ...current,
      allergies: current.allergies.includes(code)
        ? current.allergies.filter((a) => a !== code)
        : [...current.allergies, code],
    }));
  }

  function addFreeTextAllergy() {
    const value = allergyText.trim();
    if (value.length === 0 || draft.allergies.includes(value)) return;
    patch({ allergies: [...draft.allergies, value] });
    setAllergyText('');
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<{ flaggedForReview: boolean }>('/api/health-profile', {
        planType: 'PERSONAL',
        age: draft.age ? Number(draft.age) : null,
        heightCm: draft.heightCm ? Number(draft.heightCm) : null,
        weightKg: draft.weightKg ? Number(draft.weightKg) : null,
        gender: draft.gender || null,
        activityLevel: draft.activityLevel || null,
        householdAdults: draft.householdAdults,
        householdChildren: draft.householdChildren,
        medicalConditions: draft.medicalConditions,
        medications: draft.medications || null,
        allergies: draft.allergies,
        dietaryPreference: draft.dietaryPreference,
        likedProductIds: [],
        dislikedProductIds: draft.dislikedProductIds,
        goal: draft.goal,
        notes: draft.notes || null,
        consentGiven: true,
      }),
    onSuccess: () => generate.mutate(),
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : te('generic'));
    },
  });

  // "Make My Meal Plan" — options generation (AI-1b), not the old
  // single-pick pipeline. `onDraftReady` hands control back to the
  // onboarding state machine, which moves to the day-by-day picker step.
  const generate = useMutation({
    mutationFn: () => api.post<{ draftId: string }>(`/api/meal-plan/draft${qs({ locale })}`),
    onSuccess: (data) => onDraftReady(data.draftId),
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === 'BAD_REQUEST') {
        setError(tm('notEnoughVeg'));
        return;
      }
      setError(tm('generateFailed'));
    },
  });

  const busy = save.isPending || generate.isPending;

  if (generate.isPending) {
    return (
      <main className="pb-2">
        <div className="flex flex-col items-center bg-card px-6 py-24 text-center">
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="mt-4 text-base font-semibold">{tm('generating')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tm('generatingHint')}</p>
        </div>
      </main>
    );
  }

  const stepTitles = [
    t('step1'),
    t('step2'),
    t('step3'),
    t('step4'),
    t('step5'),
    t('step6'),
    t('step7'),
  ];

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <button
          type="button"
          onClick={() => (step === 1 ? onBack() : setStep(step - 1))}
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {t('stepOf', { current: step, total: TOTAL_STEPS })}
          </p>
          <h1 className="truncate text-base font-bold">{stepTitles[step - 1]}</h1>
        </div>
      </header>

      <main className="pb-2">
      <div className="bg-card px-4 py-4">
      <div
        className="mb-6 h-1 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* ── Step 1: basics */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              id="age"
              label={t('age')}
              unit={t('ageUnit')}
              value={draft.age}
              onChange={(value) => patch({ age: value })}
            />
            <NumberField
              id="height"
              label={t('height')}
              unit={t('heightUnit')}
              value={draft.heightCm}
              onChange={(value) => patch({ heightCm: value })}
            />
            <NumberField
              id="weight"
              label={t('weight')}
              unit={t('weightUnit')}
              value={draft.weightKg}
              onChange={(value) => patch({ weightKg: value })}
            />
          </div>

          <ChoiceGroup
            legend={t('gender')}
            options={[
              { value: 'MALE', label: tp('genderMale') },
              { value: 'FEMALE', label: tp('genderFemale') },
              { value: 'OTHER', label: tp('genderOther') },
              { value: 'UNDISCLOSED', label: tp('genderUndisclosed') },
            ]}
            selected={draft.gender}
            onSelect={(value) => patch({ gender: value as Draft['gender'] })}
          />

          <ChoiceGroup
            legend={t('activity')}
            options={ACTIVITY_LEVELS.map((level) => ({
              value: level,
              label: t(`activity${level}`),
            }))}
            selected={draft.activityLevel}
            onSelect={(value) => patch({ activityLevel: value as Draft['activityLevel'] })}
            stacked
          />
        </div>
      )}

      {/* ── Step 2: household — drives B4 */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{t('householdHint')}</p>
          <Counter
            label={t('adults')}
            value={draft.householdAdults}
            min={1}
            max={20}
            onChange={(value) => patch({ householdAdults: value })}
          />
          <Counter
            label={t('children')}
            value={draft.householdChildren}
            min={0}
            max={20}
            onChange={(value) => patch({ householdChildren: value })}
          />
        </div>
      )}

      {/* ── Step 3: health */}
      {step === 3 && (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium">{t('conditions')}</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('conditionsHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MEDICAL_CONDITIONS.map((code) => (
                <Chip
                  key={code}
                  label={t(`condition${code}`)}
                  selected={draft.medicalConditions.includes(code)}
                  onClick={() => toggleCondition(code)}
                />
              ))}
            </div>
          </fieldset>

          <TextField
            id="medications"
            label={t('medications')}
            placeholder={t('medicationsPlaceholder')}
            value={draft.medications}
            onChange={(value) => patch({ medications: value })}
          />
        </div>
      )}

      {/* ── Step 4: allergies — S4, the hard constraint */}
      {step === 4 && (
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium">{t('allergies')}</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('allergiesHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALLERGENS.map((allergen) => (
                <Chip
                  key={allergen.code}
                  label={t(`allergen${allergen.code}`)}
                  selected={draft.allergies.includes(allergen.code)}
                  onClick={() => toggleAllergen(allergen.code)}
                />
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="allergy-other" className="text-sm font-medium">
              {t('allergyOther')}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="allergy-other"
                value={allergyText}
                onChange={(event) => setAllergyText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addFreeTextAllergy();
                  }
                }}
                placeholder={t('allergyOtherPlaceholder')}
                className="input-3d h-12 min-w-0 flex-1 rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addFreeTextAllergy}
                className="h-12 shrink-0 rounded-[var(--radius)] border border-primary px-4 text-sm font-semibold text-primary"
              >
                {t('allergyAdd')}
              </button>
            </div>
          </div>

          {/* Free-text entries are shown back as removable chips: an allergy
              typed by mistake must be easy to take off again. */}
          {draft.allergies.filter((a) => !ALLERGENS.some((x) => x.code === a)).length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {draft.allergies
                .filter((a) => !ALLERGENS.some((x) => x.code === a))
                .map((custom) => (
                  <li key={custom}>
                    <button
                      type="button"
                      onClick={() =>
                        patch({ allergies: draft.allergies.filter((a) => a !== custom) })
                      }
                      className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
                    >
                      {custom}
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Step 5: preferences */}
      {step === 5 && (
        <div className="space-y-5">
          <ChoiceGroup
            legend={t('diet')}
            options={DIETARY_PREFERENCES.map((diet) => ({ value: diet, label: t(`diet${diet}`) }))}
            selected={draft.dietaryPreference}
            onSelect={(value) => patch({ dietaryPreference: value as Draft['dietaryPreference'] })}
            stacked
          />

          <fieldset>
            <legend className="text-sm font-medium">{t('dislikes')}</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('dislikesHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dislikeOptions.map((option) => (
                <Chip
                  key={option.id}
                  label={option.name}
                  selected={draft.dislikedProductIds.includes(option.id)}
                  onClick={() =>
                    patch({
                      dislikedProductIds: draft.dislikedProductIds.includes(option.id)
                        ? draft.dislikedProductIds.filter((id) => id !== option.id)
                        : [...draft.dislikedProductIds, option.id],
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {/* ── Step 6: goal */}
      {step === 6 && (
        <div className="space-y-5">
          <ChoiceGroup
            legend={t('goal')}
            options={HEALTH_GOALS.map((goal) => ({ value: goal, label: t(`goal${goal}`) }))}
            selected={draft.goal}
            onSelect={(value) => patch({ goal: value as Draft['goal'] })}
            stacked
          />

          <TextField
            id="notes"
            label={t('notes')}
            placeholder={t('notesPlaceholder')}
            value={draft.notes}
            onChange={(value) => patch({ notes: value })}
            multiline
          />
        </div>
      )}

      {/* ── Step 7: consent — S2, mandatory */}
      {step === 7 && (
        <div className="space-y-4">
          <MedicalDisclaimer />

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-4">
            <input
              type="checkbox"
              checked={draft.consentGiven}
              onChange={(event) => patch({ consentGiven: event.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-sm leading-relaxed">{ts('consentCheckbox')}</span>
          </label>

          {!draft.consentGiven && (
            <p className="text-xs text-muted-foreground">{t('consentRequired')}</p>
          )}

          {/* S3 — if the answers tripped a red flag, say so BEFORE they wait a
              minute for a plan. B8: nothing is blocked. */}
          {hasRedFlagAnswers(draft) && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[var(--radius)] border border-warning/40 bg-[#FDF3E3] px-4 py-3"
            >
              <Stethoscope className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <p className="text-xs leading-relaxed text-[#8A5A2B]">{t('doctorNotice')}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius)] bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="h-12 flex-1 rounded-[var(--radius)] border border-border text-sm font-medium"
          >
            {tc('back')}
          </button>
        )}

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
          >
            {tc('next')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            disabled={!draft.consentGiven || busy}
            className="h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? t('saving') : t('finish')}
          </button>
        )}
      </div>
      </div>
      </main>
    </>
  );
}

/**
 * A client-side preview of S3, purely so the customer is warned before waiting.
 * The authoritative check runs on the server in `assessSafety`; this one being
 * wrong changes nothing about whether the plan is flagged.
 */
function hasRedFlagAnswers(draft: Draft): boolean {
  const flagged = [
    'DIABETES_TYPE_1',
    'KIDNEY_DISEASE',
    'PREGNANCY',
    'BREASTFEEDING',
    'CANCER_TREATMENT',
    'RECENT_SURGERY',
    'EATING_DISORDER',
  ];
  if (draft.medicalConditions.some((code) => flagged.includes(code))) return true;

  const age = Number(draft.age);
  if (draft.age && Number.isFinite(age) && (age < 18 || age > 75)) return true;

  return /insulin|इन्सुलिन/i.test(draft.medications);
}

// ─────────────────────────────────────────────────────────────
// Field primitives — R10: every target clears 44px.
// ─────────────────────────────────────────────────────────────

export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
        className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-3 text-center text-base outline-none focus:border-primary"
      />
      <p className="mt-1 text-center text-[10px] text-muted-foreground">{unit}</p>
    </div>
  );
}

export function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  multiline,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value.slice(0, 1000))}
          className="input-3d mt-1.5 w-full resize-none rounded-[var(--radius)] border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value.slice(0, 500))}
          className="input-3d mt-1.5 h-12 w-full rounded-[var(--radius)] border border-border/60 bg-background px-3 text-base outline-none focus:border-primary"
        />
      )}
    </div>
  );
}

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'min-h-11 rounded-full border px-3.5 text-sm transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground font-semibold'
          : 'border-border bg-background text-muted-foreground',
      )}
    >
      {label}
    </button>
  );
}

export function ChoiceGroup({
  legend,
  options,
  selected,
  onSelect,
  stacked,
}: {
  legend: string;
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
  stacked?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className={cn('mt-2 gap-2', stacked ? 'grid' : 'flex flex-wrap')}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(selected === option.value ? '' : option.value)}
            aria-pressed={selected === option.value}
            className={cn(
              'min-h-11 rounded-[var(--radius)] border px-4 text-sm transition-colors',
              stacked ? 'text-left' : '',
              selected === option.value
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-background px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`${label} −`}
          className="grid size-11 place-items-center rounded-full border border-border text-lg"
        >
          −
        </button>
        <span className="min-w-8 text-center text-lg font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`${label} +`}
          className="grid size-11 place-items-center rounded-full border border-border text-lg"
        >
          +
        </button>
      </div>
    </div>
  );
}
