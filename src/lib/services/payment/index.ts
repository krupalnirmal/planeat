import { env } from '@/lib/env';
import { MockPaymentProvider } from './mock';
import { RazorpayProvider } from './providers/razorpay';
import type { PaymentProvider } from './types';

export * from './types';
export { MockPaymentProvider } from './mock';

/**
 * P1 — three-stage rollout: mock (P0–P2) → Razorpay test (P3 onward, all
 * demos) → Razorpay live (before real customers). All three are the same
 * `PAYMENT_PROVIDER` switch; only the keys change.
 *
 * P5 — Cashfree is the documented fallback if Razorpay activation is refused,
 * then PhonePe PG. Do not add Stripe: card-only in India, no UPI.
 */

let cached: PaymentProvider | null = null;
let cachedKey = '';

function build(name: string): PaymentProvider {
  switch (name) {
    case 'razorpay':
      return new RazorpayProvider();
    case 'mock':
      return new MockPaymentProvider();
    case 'cashfree':
      throw new Error(
        'PAYMENT_PROVIDER=cashfree is the documented fallback but is not implemented yet. ' +
          'Add src/lib/services/payment/providers/cashfree.ts implementing PaymentProvider.',
      );
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Expected one of: mock, razorpay.`);
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (cached && cachedKey === env.providers.payment) return cached;
  cached = build(env.providers.payment);
  cachedKey = env.providers.payment;
  return cached;
}

export function setPaymentProviderForTesting(provider: PaymentProvider | null): void {
  cached = provider;
  cachedKey = provider ? '__test__' : '';
}
