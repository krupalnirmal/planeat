import { PlanDraftProvider } from '@/components/meal-plan/plan-draft-context';

/**
 * Wraps the whole day-by-day builder wizard (`build`, `build/[day]`,
 * `build/summary`) in one `PlanDraftProvider` — Next.js keeps a layout's
 * component tree mounted across client-side navigation between its nested
 * routes, so the draft picked here survives moving between days and the
 * final weekly review without needing its own persistence layer.
 */
export default function MealPlanBuildLayout({ children }: { children: React.ReactNode }) {
  return <PlanDraftProvider>{children}</PlanDraftProvider>;
}
