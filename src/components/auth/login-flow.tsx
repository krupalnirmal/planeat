'use client';

import { ArrowLeft, Leaf, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@/i18n/navigation';
import { useInvalidateSession } from '@/hooks/use-session';
import { CART_QUERY_KEY } from '@/hooks/use-cart';
import { ApiClientError, api } from '@/lib/api/client';
import { WHATSAPP_FALLBACK_SECONDS } from '@/lib/auth/otp-constants';
import { useGuestCart } from '@/stores/cart';
import { cn } from '@/lib/utils';

/**
 * M1 — phone → OTP → (new user) profile.
 *
 * Two steps in one component on purpose: the phone number has to survive the
 * transition, and the OTP screen needs a "change number" path back. Routing
 * between two pages would put that state in the URL or in storage for no gain.
 */

interface SendResult {
  sent: boolean;
  expiresAt: string;
  resendAfterSeconds: number;
  whatsappFallbackAfterSeconds: number;
  devCode: string | null;
}

interface VerifyResult {
  user: { id: string; phone: string; name: string | null; role: string };
  isNewUser: boolean;
}

export function LoginFlow({ collageImages = [] }: { collageImages?: string[] }) {
  const t = useTranslations('auth');
  const ta = useTranslations('app');
  const te = useTranslations('errors');
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  const next = searchParams.get('next') ?? '/';

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const otpInputRef = useRef<HTMLInputElement>(null);

  // One interval drives both the resend cooldown and the 30-second WhatsApp
  // fallback offer, so they can never drift apart.
  useEffect(() => {
    if (step !== 'otp') return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  function messageFor(err: unknown): string {
    if (!(err instanceof ApiClientError)) return te('generic');
    const reason =
      err.details && typeof err.details === 'object' && 'reason' in err.details
        ? String((err.details as { reason: unknown }).reason)
        : null;

    switch (reason) {
      case 'COOLDOWN':
      case 'HOURLY_LIMIT':
        return t('tooManyRequests');
      case 'TOO_MANY_ATTEMPTS':
        return t('tooManyAttempts');
      case 'EXPIRED':
      case 'NOT_FOUND':
        return t('expiredOtp');
      case 'MISMATCH':
        return t('invalidOtp');
      default:
        return err.code === 'VALIDATION_FAILED' ? t('invalidPhone') : err.message;
    }
  }

  async function sendCode(channel: 'sms' | 'whatsapp' = 'sms') {
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<SendResult>('/api/auth/otp/send', { phone, channel });
      setDevCode(result.devCode);
      setSecondsLeft(result.resendAfterSeconds);
      setElapsed(0);
      setCode('');
      setStep('otp');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(submitted: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<VerifyResult>('/api/auth/otp/verify', {
        phone,
        code: submitted,
      });

      // M3 — hand the guest's localStorage cart over before anything else
      // navigates. Somebody who spent ten minutes filling a cart and then hit
      // the login wall must not find it empty on the other side.
      const guestLines = useGuestCart.getState().lines;
      if (guestLines.length > 0) {
        try {
          await api.post('/api/cart/merge', { lines: guestLines });
          useGuestCart.getState().clear();
        } catch {
          // A failed merge must not block the login itself; the lines stay in
          // localStorage and the next add-to-cart will carry them over.
        }
      }

      await invalidateSession();
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });

      router.replace(
        result.isNewUser ? `/profile/complete?next=${encodeURIComponent(next)}` : next,
      );
    } catch (err) {
      setError(messageFor(err));
      setCode('');
      otpInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const phoneValid = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));

  if (step === 'phone') {
    return (
      <main className="flex min-h-dvh flex-col">
        {/* The product wall, exactly as the reference opens: real stock,
            faded out at the bottom so the card below sits on clean white. */}
        {collageImages.length > 0 && (
          <div aria-hidden className="relative h-[38dvh] shrink-0 overflow-hidden">
            <div className="grid grid-cols-4 gap-2 p-2">
              {collageImages.map((src, index) => (
                <div
                  key={index}
                  className="aspect-square overflow-hidden rounded-2xl bg-secondary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-cover" />
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}

        <div className="flex flex-1 flex-col px-6 pb-6">
          {/* B17 — the catalogue is public, so a customer who lands here by
              accident must have a way back out that is not the OS back button. */}
          <div className="flex justify-end pt-2">
            <Link
              href="/"
              className="rounded-full bg-card px-4 py-2 text-[13px] font-bold shadow-sm"
            >
              {t('skipLogin')}
            </Link>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {/* The wordmark itself, not a coloured tile — same treatment as
                the header (D-198). */}
            <div className="flex items-center gap-1.5">
              <Leaf className="size-9 -rotate-12 text-primary" aria-hidden />
              <p className="text-4xl font-black tracking-tight">
                <span className="text-primary-dark">Plan</span>
                <span className="text-primary">eat</span>
              </p>
            </div>

            <h1 className="mt-6 text-[28px] leading-tight font-black text-balance">
              {ta('tagline')}
            </h1>
            <p className="mt-2 text-[17px] font-bold text-muted-foreground">
              {t('loginOrSignup')}
            </p>

            <form
              className="mt-7 w-full"
              onSubmit={(event) => {
                event.preventDefault();
                if (phoneValid && !busy) void sendCode('sms');
              }}
            >
              <div className="input-3d flex h-14 items-center gap-3 rounded-[var(--radius)] border border-border/60 bg-card px-4 focus-within:border-foreground">
                <span className="text-base font-bold">+91</span>
                <span aria-hidden className="h-6 w-px bg-border" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder={t('phonePlaceholder')}
                  aria-label={t('phoneLabel')}
                  className="min-w-0 flex-1 bg-transparent text-base tracking-wide outline-none"
                />
              </div>

              {error && <p className="mt-2 text-left text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={!phoneValid || busy}
                className="mt-4 h-14 w-full rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground transition-colors disabled:bg-muted-foreground/45 disabled:text-white"
              >
                {busy ? t('sending') : t('continue')}
              </button>
            </form>
          </div>

          {/* Plain text, not links: the Terms and Privacy pages are M11 work
              that has not shipped, and a link to a 404 is worse than none. */}
          <p className="mt-6 border-t border-border pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            {t('termsNote')}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="px-5 py-8">
      <button
        type="button"
        onClick={() => {
          setStep('phone');
          setError(null);
        }}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('changeNumber')}
      </button>

      <h1 className="text-xl font-bold">{t('otpTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('otpSubtitle', { phone })}</p>

      <form
        className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 6 && !busy) void verify(code);
          }}
        >
          <label htmlFor="otp" className="text-sm font-medium">
            {t('otpLabel')}
          </label>
          <input
            id="otp"
            ref={otpInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              // Auto-submit on the sixth digit: on a phone, making somebody
              // reach for a button after typing the last digit is friction for
              // its own sake.
              if (digits.length === 6 && !busy) void verify(digits);
            }}
            className={cn(
              'input-3d mt-1.5 h-14 w-full rounded-[var(--radius)] border border-border/60 bg-card text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary',
              error && 'border-danger',
            )}
          />

          {devCode && (
            <p className="mt-2 rounded-[var(--radius)] bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">
              {t('devOtpHint', { code: devCode })}
            </p>
          )}

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={code.length !== 6 || busy}
            className="mt-6 h-12 w-full rounded-[var(--radius)] bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? t('verifying') : t('verify')}
          </button>

          <div className="mt-4 flex flex-col items-center gap-3">
            {secondsLeft > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('resendIn', { seconds: secondsLeft })}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void sendCode('sms')}
                disabled={busy}
                className="text-sm font-semibold text-primary"
              >
                {t('resend')}
              </button>
            )}

            {/* B16 — SMS delivery in this segment is unreliable, so WhatsApp is
                offered as soon as waiting starts to feel like failure. */}
            {elapsed >= WHATSAPP_FALLBACK_SECONDS && (
              <button
                type="button"
                onClick={() => void sendCode('whatsapp')}
                disabled={busy}
                className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium"
              >
                <MessageCircle className="size-4 text-primary" aria-hidden />
                {t('resendWhatsapp')}
              </button>
            )}
        </div>
      </form>
    </main>
  );
}
