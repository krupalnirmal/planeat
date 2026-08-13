import { NextResponse } from 'next/server';
import { parseQuery, route } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { requireStoreAdmin } from '@/lib/admin/guard';
import { buildPicklist, defaultPicklistDate, picklistToCsv } from '@/lib/admin/picklist';
import { picklistQuerySchema } from '@/lib/validators/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = picklistQuerySchema.extend({
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * GET /api/admin/picklist — M9's starred screen (⭐).
 *
 *   "Aggregated 'Tomorrow — 12 kg Spinach, 8 kg Tomato…' plus per-customer
 *    packing slips. Printable + CSV. Highest-value screen — this replaces the
 *    owner's notebook."
 *
 * Defaults to TOMORROW, because the picklist is prepared the evening before —
 * that is when the 20:00 preview has gone out and the skip cutoff has passed,
 * so the list is finally stable.
 */
export const GET = route(async (request: Request) => {
  await requireStoreAdmin();
  const query = parseQuery(request, querySchema);

  const dateKey = query.date ?? defaultPicklistDate();
  const picklist = await buildPicklist(dateKey, query.locale);

  if (query.format === 'csv') {
    // Opened on a phone at the mandi, or handed to whoever is buying.
    return new NextResponse(picklistToCsv(picklist), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="picklist-${dateKey}.csv"`,
      },
    });
  }

  return ok(picklist);
});
