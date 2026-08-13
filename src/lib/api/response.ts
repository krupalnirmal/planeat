import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

/**
 * PART 9 — every API response is `{ success, data, error }`. No exceptions,
 * so the client never has to guess at the shape.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_SERVICEABLE: 'NOT_SERVICEABLE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  ALLERGEN_VIOLATION: 'ALLERGEN_VIOLATION',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * BigInt does not survive JSON.stringify (R4 keeps money in BigInt), so every
 * payload is walked once and BigInts are emitted as strings. The client parses
 * them back with `paise()`.
 */
function serialise(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiSuccess<unknown> = { success: true, data: serialise(data), error: null };
  return NextResponse.json(body, init);
}

export function fail(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  const body: ApiFailure = {
    success: false,
    data: null,
    error: { code, message, details: details === undefined ? undefined : serialise(details) },
  };
  return NextResponse.json(body, { status });
}

export const badRequest = (message = 'Bad request', details?: unknown) =>
  fail(ERROR_CODES.BAD_REQUEST, message, 400, details);

export const unauthorized = (message = 'Login required') =>
  fail(ERROR_CODES.UNAUTHORIZED, message, 401);

export const forbidden = (message = 'Not allowed') => fail(ERROR_CODES.FORBIDDEN, message, 403);

export const notFound = (message = 'Not found') => fail(ERROR_CODES.NOT_FOUND, message, 404);

export const conflict = (message = 'Conflict', details?: unknown) =>
  fail(ERROR_CODES.CONFLICT, message, 409, details);

export const rateLimited = (message = 'Too many requests') =>
  fail(ERROR_CODES.RATE_LIMITED, message, 429);

export const internal = (message = 'Something went wrong') =>
  fail(ERROR_CODES.INTERNAL, message, 500);

/** R9 — every input is Zod-validated; this renders the failure consistently. */
export function validationFailed(error: ZodError): NextResponse {
  return fail(ERROR_CODES.VALIDATION_FAILED, 'Invalid input', 422, {
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}
