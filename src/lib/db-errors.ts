/**
 * Prisma error probes.
 *
 * Duck-typed rather than `instanceof PrismaClientKnownRequestError`: the error
 * crosses a transaction boundary and, with the generated client living outside
 * node_modules, an `instanceof` check is one bundling quirk away from silently
 * returning false. A false negative here would turn an idempotent retry into a
 * duplicate order.
 */

interface PrismaErrorShape {
  code?: unknown;
  meta?: { target?: unknown };
}

function asPrismaError(error: unknown): PrismaErrorShape | null {
  if (typeof error !== 'object' || error === null) return null;
  return error as PrismaErrorShape;
}

/** P2002 — unique constraint failed. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  const prismaError = asPrismaError(error);
  if (prismaError?.code !== 'P2002') return false;
  if (!field) return true;

  const target = prismaError.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return false;
}

/** P2025 — record required by the operation was not found. */
export function isNotFoundError(error: unknown): boolean {
  return asPrismaError(error)?.code === 'P2025';
}
