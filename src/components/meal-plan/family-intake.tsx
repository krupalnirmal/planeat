'use client';

import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MedicalDisclaimer } from '@/components/meal-plan/medical-disclaimer';
import { Chip, ChoiceGroup, NumberField, TextField } from '@/components/meal-plan/intake-wizard';
import { ApiClientError, api, qs } from '@/lib/api/client';
import { DIETARY_PREFERENCES } from '@/lib/meal-plan/taxonomy';

/**
 * Doc §8 — "Number of Family Members" → "Enter Each Member One by One"
 * (progress: "Member 2 of 4", never a giant all-members-at-once form) →
 * §C family-level preferences. Each member is saved to the server as their
 * own step finishes (`POST /api/health-profile/family-members`), so losing
 * the tab midway never loses an already-completed member.
 */

const MEMBER_COUNTS = [1, 2, 3, 4, 5, 6] as const;
const SPICE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

interface MemberDraft {
  name: string;
  age: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
  allergies: string[];
  dislikedProductIds: string[];
}

const EMPTY_MEMBER: MemberDraft = { name: '', age: '', gender: '', allergies: [], dislikedProductIds: [] };

type Phase = 'count' | 'members' | 'preferences';

export function FamilyIntake({
  dislikeOptions,
  onBack,
  onDraftReady,
}: {
  dislikeOptions: Array<{ id: string; name: string }>;
  onBack: () => void;
  onDraftReady: (draftId: string) => void;
}) {
  const t = useTranslations('mealPlan.family');
  const tp = useTranslations('profile');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const tm = useTranslations('mealPlan');
  const ts = useTranslations('safety');
  const locale = useLocale();

  const [phase, setPhase] = useState<Phase>('count');
  const [memberCount, setMemberCount] = useState(2);
  const [memberIndex, setMemberIndex] = useState(0);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_MEMBER);
  const [allergyText, setAllergyText] = useState('');

  const [spicePreference, setSpicePreference] = useState<'' | (typeof SPICE_LEVELS)[number]>('MEDIUM');
  const [dietaryPreference, setDietaryPreference] =
    useState<(typeof DIETARY_PREFERENCES)[number]>('VEG');
  const [breakfastStyle, setBreakfastStyle] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startMembers() {
    setMembers([]);
    setMemberIndex(0);
    setDraft(EMPTY_MEMBER);
    setPhase('members');
  }

  const saveMember = useMutation({
    mutationFn: (member: MemberDraft) =>
      api.post('/api/health-profile/family-members', {
        name: member.name.trim(),
        age: member.age ? Number(member.age) : null,
        gender: member.gender || null,
        allergies: member.allergies,
        dislikedProductIds: member.dislikedProductIds,
      }),
    onSuccess: () => {
      const nextMembers = [...members, draft];
      setMembers(nextMembers);
      setAllergyText('');

      if (memberIndex + 1 < memberCount) {
        setMemberIndex(memberIndex + 1);
        setDraft(EMPTY_MEMBER);
      } else {
        setPhase('preferences');
      }
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : te('generic')),
  });

  const saveProfile = useMutation({
    mutationFn: () => {
      // A rough adult/child split for B4's serving-size formula — members
      // under 12 count as a child serving, same threshold the household-
      // count fields already implied before named members existed.
      const adults = members.filter((m) => !m.age || Number(m.age) >= 12).length || 1;
      const children = members.filter((m) => m.age && Number(m.age) < 12).length;

      return api.put<{ flaggedForReview: boolean }>('/api/health-profile', {
        planType: 'FAMILY',
        householdAdults: adults,
        householdChildren: children,
        dietaryPreference,
        familyPreferences: { spicePreference: spicePreference || null, breakfastStyle: breakfastStyle || null },
        medicalConditions: [],
        allergies: [],
        likedProductIds: [],
        dislikedProductIds: [],
        consentGiven: true,
      });
    },
    onSuccess: () => generate.mutate(),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : te('generic')),
  });

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

  const busy = saveMember.isPending || saveProfile.isPending || generate.isPending;

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

  function toggleAllergen(text: string) {
    setDraft((current) => ({
      ...current,
      allergies: current.allergies.includes(text)
        ? current.allergies.filter((a) => a !== text)
        : [...current.allergies, text],
    }));
  }

  function addFreeTextAllergy() {
    const value = allergyText.trim();
    if (value.length === 0 || draft.allergies.includes(value)) return;
    toggleAllergen(value);
    setAllergyText('');
  }

  function backHandler() {
    if (phase === 'count') return onBack();
    if (phase === 'members' && memberIndex === 0) return setPhase('count');
    if (phase === 'members') return setMemberIndex(memberIndex - 1);
    return setPhase('members');
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <button
          type="button"
          onClick={backHandler}
          aria-label={tc('back')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          {phase === 'members' && (
            <p className="text-xs text-muted-foreground">
              {t('memberProgress', { current: memberIndex + 1, total: memberCount })}
            </p>
          )}
          <h1 className="truncate text-base font-bold">
            {phase === 'count' && t('countTitle')}
            {phase === 'members' && t('memberTitle')}
            {phase === 'preferences' && t('preferencesTitle')}
          </h1>
        </div>
      </header>

      <main className="pb-2">
        <div className="bg-card px-4 py-4">
          {phase === 'count' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">{t('countHint')}</p>
              <div className="grid grid-cols-3 gap-2">
                {MEMBER_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMemberCount(count)}
                    aria-pressed={memberCount === count}
                    className={`min-h-12 rounded-[var(--radius)] border text-sm font-bold ${
                      memberCount === count
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {count === 6 ? '6+' : count}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={startMembers}
                className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground"
              >
                {tc('next')}
              </button>
            </div>
          )}

          {phase === 'members' && (
            <div className="space-y-5">
              <TextField
                id="member-name"
                label={t('memberName')}
                placeholder={t('memberNamePlaceholder')}
                value={draft.name}
                onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="member-age"
                  label={t('memberAge')}
                  unit={t('memberAgeUnit')}
                  value={draft.age}
                  onChange={(value) => setDraft((current) => ({ ...current, age: value }))}
                />
                <ChoiceGroup
                  legend={tp('genderLabel')}
                  options={[
                    { value: 'MALE', label: tp('genderMale') },
                    { value: 'FEMALE', label: tp('genderFemale') },
                  ]}
                  selected={draft.gender}
                  onSelect={(value) => setDraft((current) => ({ ...current, gender: value as MemberDraft['gender'] }))}
                />
              </div>

              <fieldset>
                <legend className="text-sm font-medium">{t('memberAllergies')}</legend>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={allergyText}
                    onChange={(event) => setAllergyText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addFreeTextAllergy();
                      }
                    }}
                    placeholder={t('memberAllergiesPlaceholder')}
                    className="input-3d h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={addFreeTextAllergy}
                    className="h-11 shrink-0 rounded-[var(--radius)] border border-primary px-3 text-sm font-semibold text-primary"
                  >
                    {t('memberAllergiesAdd')}
                  </button>
                </div>
                {draft.allergies.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {draft.allergies.map((allergy) => (
                      <li key={allergy}>
                        <button
                          type="button"
                          onClick={() => toggleAllergen(allergy)}
                          className="flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
                        >
                          {allergy}
                          <X className="size-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium">{t('memberDislikes')}</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {dislikeOptions.map((option) => (
                    <Chip
                      key={option.id}
                      label={option.name}
                      selected={draft.dislikedProductIds.includes(option.id)}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          dislikedProductIds: current.dislikedProductIds.includes(option.id)
                            ? current.dislikedProductIds.filter((id) => id !== option.id)
                            : [...current.dislikedProductIds, option.id],
                        }))
                      }
                    />
                  ))}
                </div>
              </fieldset>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  saveMember.mutate(draft);
                }}
                disabled={draft.name.trim().length === 0 || busy}
                className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? tc('loading') : tc('next')}
              </button>
            </div>
          )}

          {phase === 'preferences' && (
            <div className="space-y-5">
              <ChoiceGroup
                legend={t('spicePreference')}
                options={SPICE_LEVELS.map((level) => ({ value: level, label: t(`spice${level}`) }))}
                selected={spicePreference}
                onSelect={(value) => setSpicePreference(value as typeof spicePreference)}
              />

              <ChoiceGroup
                legend={t('dietaryPreference')}
                options={DIETARY_PREFERENCES.map((diet) => ({
                  value: diet,
                  label: t(`diet${diet}`),
                }))}
                selected={dietaryPreference}
                onSelect={(value) => setDietaryPreference(value as typeof dietaryPreference)}
                stacked
              />

              <TextField
                id="breakfast-style"
                label={t('breakfastStyle')}
                placeholder={t('breakfastStylePlaceholder')}
                value={breakfastStyle}
                onChange={setBreakfastStyle}
              />

              <MedicalDisclaimer />

              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-4">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(event) => setConsentGiven(event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                />
                <span className="text-sm leading-relaxed">{ts('consentCheckbox')}</span>
              </label>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  saveProfile.mutate();
                }}
                disabled={!consentGiven || busy}
                className="h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? tc('loading') : t('finish')}
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
