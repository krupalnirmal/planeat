'use client';

/**
 * MSG91's OTP Widget, client-side (session 2026-10-02) — the one path that
 * sends a real SMS OTP without the client's own DLT registration, because the
 * widget rides MSG91's own already-approved DLT entity rather than the
 * client's. Trade-off: MSG91 generates and verifies the code itself, not
 * src/lib/auth/otp.ts — this module only wires the widget's JS SDK onto
 * `window`; login-flow.tsx keeps its own UI untouched.
 *
 * Server-side counterpart: POST /api/auth/otp/verify-widget calls MSG91's
 * verifyAccessToken with the token this hands back, before ever starting a
 * session — the widget's own success callback is a UI signal only, never
 * trusted directly (same P2 doctrine as the Razorpay checkout widget).
 *
 * `tokenAuth` here is meant to be public — MSG91's own docs embed it directly
 * in client-side HTML. It is not the secret server MSG91_AUTH_KEY, which
 * never leaves the server (used only by verify-widget's own fetch call).
 */

const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
const WIDGET_TOKEN = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN;
const SCRIPT_SRC = 'https://verify.msg91.com/otp-provider.js';

/** The id of a (hidden, harmless-if-unused) element the widget may render a captcha into. */
export const CAPTCHA_RENDER_ID = 'msg91-captcha-container';

export function isWidgetConfigured(): boolean {
  return Boolean(WIDGET_ID && WIDGET_TOKEN);
}

interface WidgetCallbackData {
  type?: string;
  message?: string;
}

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (
      identifier: string,
      onSuccess?: (data: WidgetCallbackData) => void,
      onFailure?: (error: unknown) => void,
    ) => void;
    verifyOtp?: (
      otp: string,
      onSuccess?: (data: WidgetCallbackData) => void,
      onFailure?: (error: unknown) => void,
    ) => void;
    retryOtp?: (
      channel: '11' | '12' | '3' | '4' | null,
      onSuccess?: (data: WidgetCallbackData) => void,
      onFailure?: (error: unknown) => void,
    ) => void;
  }
}

let initPromise: Promise<void> | null = null;

/** How long to wait for `initSendOTP`'s own internal (undocumented, async)
    bootstrap to finish exposing `window.sendOtp` before giving up. Without
    this, a failed/slow bootstrap left every call silently no-op'd via
    optional chaining — the UI just hung on "Sending…" forever with no
    error at all (found session 2026-10-03, live). */
const READY_TIMEOUT_MS = 10_000;
const READY_POLL_MS = 100;

/** Loads the widget script once (idempotent), calls initSendOTP, and waits
    for it to actually expose `window.sendOtp` before resolving. */
export function ensureWidgetReady(): Promise<void> {
  if (!isWidgetConfigured()) {
    return Promise.reject(new Error('MSG91 widget is not configured.'));
  }
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      window.initSendOTP?.({
        widgetId: WIDGET_ID,
        tokenAuth: WIDGET_TOKEN,
        exposeMethods: true,
        captchaRenderId: CAPTCHA_RENDER_ID,
        // Per-call callbacks (below) are used instead; these exist only
        // because MSG91's configuration object expects them.
        success: () => {},
        failure: () => {},
      });

      const startedAt = Date.now();
      const poll = setInterval(() => {
        if (typeof window.sendOtp === 'function') {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          clearInterval(poll);
          reject(new Error('The OTP widget did not become ready in time.'));
        }
      }, READY_POLL_MS);
    });
    script.addEventListener('error', () =>
      reject(new Error('Could not load the MSG91 widget script.')),
    );
    document.body.appendChild(script);
  });

  // A failed attempt must not stay cached — the next tap should retry from
  // scratch (a fresh script tag, a fresh initSendOTP call) instead of
  // forever replaying the same rejection.
  initPromise.catch(() => {
    initPromise = null;
  });

  return initPromise;
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error('Something went wrong. Please try again.');
}

/** `identifier` — phone with country code, no `+` (e.g. "919999999999"). */
export function widgetSendOtp(identifier: string): Promise<void> {
  return ensureWidgetReady().then(
    () =>
      new Promise<void>((resolve, reject) => {
        window.sendOtp?.(
          identifier,
          () => resolve(),
          (error) => reject(toError(error)),
        );
      }),
  );
}

/** Resolves with the signed access-token for server-side verification. */
export function widgetVerifyOtp(otp: string): Promise<string> {
  return ensureWidgetReady().then(
    () =>
      new Promise<string>((resolve, reject) => {
        window.verifyOtp?.(
          otp,
          (data) =>
            data?.message
              ? resolve(data.message)
              : reject(new Error('No access token returned.')),
          (error) => reject(toError(error)),
        );
      }),
  );
}

export function widgetRetryOtp(channel: 'sms' | 'whatsapp'): Promise<void> {
  return ensureWidgetReady().then(
    () =>
      new Promise<void>((resolve, reject) => {
        window.retryOtp?.(
          channel === 'whatsapp' ? '12' : '11',
          () => resolve(),
          (error) => reject(toError(error)),
        );
      }),
  );
}
