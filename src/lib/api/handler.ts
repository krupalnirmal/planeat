import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { ensureFreshSession } from '@/lib/auth/session';
import { ERROR_CODES, type ErrorCode, fail, internal, validationFailed } from './response';

/**
 * A thrown ApiError is the normal way a route says "stop, and tell the client
 * this". It keeps guard clauses (`requireUser()`, `assertServiceable()`) usable
 * deep inside helpers without every caller having to thread a response back up.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static unauthorized(message = 'Login required') {
    return new ApiError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = 'Not allowed') {
    return new ApiError(ERROR_CODES.FORBIDDEN, message, 403);
  }
  static notFound(message = 'Not found') {
    return new ApiError(ERROR_CODES.NOT_FOUND, message, 404);
  }
  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(ERROR_CODES.BAD_REQUEST, message, 400, details);
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError(ERROR_CODES.CONFLICT, message, 409, details);
  }
  static rateLimited(message = 'Too many requests', details?: unknown) {
    return new ApiError(ERROR_CODES.RATE_LIMITED, message, 429, details);
  }
  static notServiceable(message = 'We do not deliver there yet', details?: unknown) {
    return new ApiError(ERROR_CODES.NOT_SERVICEABLE, message, 422, details);
  }
}

/**
 * Wraps a route handler so every failure leaves as `{ success, data, error }`
 * rather than as an unhandled 500 with a stack trace in the body.
 *
 * Also silently renews an expired access token from the refresh token
 * before the handler runs (`ensureFreshSession`, src/lib/auth/session.ts) —
 * every route goes through here, so this is the one place that fixes "page
 * reload after 15 minutes looks like a logout" for the whole app at once,
 * without every route needing to catch-and-retry on a 401 itself (which
 * would also double-read a POST body that `parseJson` already consumed).
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      await ensureFreshSession();
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.code, error.message, error.status, error.details);
      }
      if (error instanceof ZodError) {
        return validationFailed(error);
      }
      console.error('[api] unhandled error', error);
      return internal();
    }
  };
}

/** R9 — every API input is Zod-validated. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw ApiError.badRequest('Expected a JSON body');
  }
  return schema.parse(body);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) raw[key] = value;
  return schema.parse(raw);
}

/** The caller's IP, for rate limiting and audit logs. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
