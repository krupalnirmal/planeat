import { z } from 'zod';
import { ApiError, parseJson, parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireUser } from '@/lib/auth/session';
import { selectDraftOption } from '@/lib/meal-plan/draft';
import { cuidSchema, localeSchema } from '@/lib/validators/common';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ locale: localeSchema.default('mr') });

const bodySchema = z.object({
  optionId: cuidSchema,
  selected: z.boolean(),
  chosenQuantity: z.coerce.number().int().min(1).max(50_000).nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/meal-plan/draft/[id]/select — toggles one option. SINGLE
 * categories clear every sibling first (D-210's same mutual-exclusivity
 * rule); MULTIPLE categories (Vegetables) toggle independently.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireUser();
  const { id } = await context.params;
  const { locale } = parseQuery(request, querySchema);
  const input = await parseJson(request, bodySchema);

  const result = await selectDraftOption({
    userId: session.userId,
    draftId: id,
    optionId: input.optionId,
    selected: input.selected,
    chosenQuantity: input.chosenQuantity ?? null,
    locale,
  });

  if (!result.ok) throw ApiError.notFound('Draft option not found');

  return ok({ draft: result.draft });
});
