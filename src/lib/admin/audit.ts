import { db } from '@/lib/db';
import { ID_PREFIX, newId } from '@/lib/ids';

/**
 * M9 — "Audit Log: every admin action: who, what, when, before/after."
 *
 * One helper, used by every admin mutation. The alternative — each route
 * remembering to write its own row — produces an audit log with holes in it,
 * and a log with holes is worse than none: it looks complete.
 *
 * `before` and `after` are the point. "Somebody changed the delivery fee" is
 * not useful six months later; "Ravi changed it from ₹25 to ₹40 on 3 March" is.
 */

export interface AuditInput {
  actorId: string;
  /** Dotted verb: `product.update`, `order.status_change`, `settings.update`. */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * BigInt does not survive the Json column (R4), and a Date in a diff is far
 * more readable as an ISO string than as an epoch number.
 */
function serialise(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialise(entry)]));
  }
  return value;
}

/**
 * Writes the audit row. Deliberately NOT swallowing errors the way `notify`
 * does: an unlogged admin action is a gap in a financial and medical record,
 * and the caller should fail rather than proceed unrecorded.
 */
export async function audit(input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      id: newId(ID_PREFIX.auditLog),
      actorId: input.actorId,
      action: input.action.slice(0, 80),
      entityType: input.entityType.slice(0, 60),
      entityId: input.entityId.slice(0, 60),
      before: serialise(input.before) as never,
      after: serialise(input.after) as never,
      ip: input.ip ?? null,
    },
  });
}

/**
 * Only the fields that actually changed, so a diff of one price is not buried
 * in twenty unchanged columns.
 */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};

  for (const key of Object.keys(after) as Array<keyof T>) {
    const next = after[key];
    if (next === undefined) continue;
    if (String(before[key]) === String(next)) continue;
    changedBefore[key] = before[key];
    changedAfter[key] = next;
  }

  return { before: changedBefore, after: changedAfter };
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: Date;
}

export interface AuditFilter {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

export async function listAuditLog(
  filter: AuditFilter,
  { skip, take }: { skip: number; take: number },
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.action ? { action: { contains: filter.action } } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        createdAt: true,
        actor: { select: { name: true, phone: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    total,
    entries: rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorName: row.actor?.name ?? row.actor?.phone ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      ip: row.ip,
      createdAt: row.createdAt,
    })),
  };
}
