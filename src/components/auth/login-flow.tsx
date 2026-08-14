'use client';

import { ArrowLeft, Check, Leaf, MessageCircle, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
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

const OTP_LENGTH = 6;
const FEATURE_KEYS = ['featureFreshHandpicked', 'featureNoPreservatives', 'featureOnTime'] as const;

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

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function LoginFlow() {
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

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // One interval drives both the resend cooldown and the WhatsApp fallback
  // offer (B16), so they can never drift apart.
  useEffect(() => {
    if (step !== 'otp') return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step === 'otp') otpRefs.current[0]?.focus();
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
      otpRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function setDigit(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');

    // The OS SMS-autofill picker drops the whole code into whichever box is
    // focused rather than one digit at a time — spread it from there instead
    // of treating it as a single (invalid) character.
    if (digits.length > 1) {
      const merged = (code.slice(0, index) + digits).slice(0, OTP_LENGTH);
      setCode(merged);
      if (merged.length === OTP_LENGTH && !busy) void verify(merged);
      else otpRefs.current[Math.min(merged.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    const chars = code.split('');
    chars[index] = digits;
    const next6 = chars.join('').slice(0, OTP_LENGTH);
    setCode(next6);
    if (digits && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (next6.length === OTP_LENGTH && !busy) void verify(next6);
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length === 0) return;
    event.preventDefault();
    setCode(pasted);
    if (pasted.length === OTP_LENGTH && !busy) void verify(pasted);
    else otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  const phoneValid = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));

  if (step === 'phone') {
    return (
      <main className="flex min-h-dvh flex-col px-6 pt-6 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Leaf className="size-7 -rotate-12 text-primary" aria-hidden />
            <p className="text-2xl font-black tracking-tight">
              <span className="text-primary-dark">Plan</span>
              <span className="text-primary">eat</span>
            </p>
          </div>

          {/* B17 — the catalogue is public, so a customer who lands here by
              accident must have a way back out that is not the OS back button. */}
          <Link
            href="/"
            className="rounded-full bg-card px-4 py-2 text-[13px] font-bold shadow-sm"
          >
            {t('skipLogin')}
          </Link>
        </div>

        <h1 className="mt-6 text-[26px] leading-tight font-black text-balance">{ta('tagline')}</h1>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/promo/veg-basket-hero.jpg"
          alt=""
          aria-hidden
          className="mx-auto mt-6 w-full max-w-[260px]"
        />

        <ul className="mt-6 space-y-2.5">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-tint-green text-primary">
                <Check className="size-3.5" aria-hidden />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (phoneValid && !busy) void sendCode('sms');
          }}
        >
          <div className="input-3d flex h-12 items-center gap-3 rounded-[var(--radius)] border border-border/60 bg-card px-4 focus-within:border-foreground">
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
            className="mt-4 h-12 w-full rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground transition-colors disabled:bg-muted-foreground/45 disabled:text-white"
          >
            {busy ? t('sending') : t('sendOtp')}
          </button>
        </form>

        {/* Plain text, not links: the Terms and Privacy pages are M11 work
            that has not shipped, and a link to a 404 is worse than none. */}
        <p className="mt-auto border-t border-border pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          {t('termsNote')}
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-accent-faint px-3 py-3">
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          aria-label={t('changeNumber')}
          className="grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="text-base font-bold">{t('otpTitle')}</h1>
      </header>

      <main className="px-5 py-6">
        <p className="text-sm text-muted-foreground">
          {t('otpSubtitle', { phone })}{' '}
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setError(null);
            }}
            className="font-bold text-primary"
          >
            {t('otpChangeLink')}
          </button>
        </p>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === OTP_LENGTH && !busy) void verify(code);
          }}
        >
          <div
            role="group"
            aria-label={t('otpLabel')}
            onPaste={handleOtpPaste}
            className="flex justify-between gap-2"
          >
            {Array.from({ length: OTP_LENGTH }).map((_, index) => (
              <input
                key={index}
                ref={(el) => {
                  otpRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={t('otpDigitAria', { position: index + 1 })}
                value={code[index] ?? ''}
                onChange={(event) => setDigit(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                className={cn(
                  'input-3d h-12 w-full max-w-12 rounded-[var(--radius)] border border-border/60 bg-card text-center text-xl font-bold outline-none focus:border-primary',
                  error && 'border-danger',
                )}
              />
            ))}
          </div>

          {devCode && (
            <p className="mt-2 rounded-[var(--radius)] bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">
              {t('devOtpHint', { code: devCode })}
            </p>
          )}

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          <div className="mt-3 text-center">
            {secondsLeft > 0 ? (
              <p className="text-sm font-semibold text-muted-foreground">
                {t('resendIn', { time: formatCountdown(secondsLeft) })}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void sendCode('sms')}
                disabled={busy}
                className="text-sm font-bold text-primary"
              >
                {t('resend')}
              </button>
            )}
          </div>

          {/* B16 — SMS delivery in this segment is unreliable, so an
              alternate channel is offered as soon as waiting starts to feel
              like failure. WhatsApp, not a voice call: that is the channel
              this app actually has wired up end to end. */}
          {elapsed >= WHATSAPP_FALLBACK_SECONDS && (
            <div className="mt-4 rounded-[var(--radius)] bg-tint-green p-3.5 text-center">
              <p className="text-xs font-medium text-muted-foreground">{t('otpFallbackBody')}</p>
              <button
                type="button"
                onClick={() => void sendCode('whatsapp')}
                disabled={busy}
                className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-card text-sm font-bold shadow-sm"
              >
                <MessageCircle className="size-4 text-primary" aria-hidden />
                {t('resendWhatsapp')}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== OTP_LENGTH || busy}
            className="mt-6 h-12 w-full rounded-[var(--radius)] bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? t('verifying') : t('verify')}
          </button>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden />
            {t('otpSecuredFooter')}
          </p>
        </form>
      </main>
    </>
  );
}
