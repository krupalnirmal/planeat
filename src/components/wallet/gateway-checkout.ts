/**
 * The ONE place in the browser bundle that knows about a specific payment
 * gateway's checkout widget.
 *
 * R1 keeps vendor SDKs inside `src/lib/services/**`, but that rule is about
 * server-side imports; the gateway's checkout is a script the browser loads at
 * runtime. Confining it to this file gives the same property: swapping to
 * Cashfree means rewriting this file and nothing else. The API response it
 * consumes is already provider-neutral (`gatewayOrderId`, `publicKey`).
 *
 * Critically, `onSuccess` here means "the widget closed and claimed success".
 * It updates the UI and nothing more. The wallet is credited only by a
 * signature-verified webhook (P2) — this callback can be tampered with, and it
 * does not fire at all when the app closes or the network drops mid-payment.
 */

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export interface GatewayCheckoutOptions {
  gatewayOrderId: string;
  publicKey: string;
  amountPaise: string;
  currency: string;
  appName: string;
  description: string;
  prefill?: { name?: string; contact?: string };
  /** The widget reported success. Purely a UI signal. */
  onSuccess: () => void;
  onDismiss: () => void;
  onFailure: (message: string) => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  // Cached: the widget script is ~100 KB and a customer may open the top-up
  // sheet several times in one session.
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Not in a browser'));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let the next attempt retry rather than caching the failure forever.
      scriptPromise = null;
      reject(new Error('Could not load the payment gateway'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function openGatewayCheckout(options: GatewayCheckoutOptions): Promise<void> {
  await loadScript(RAZORPAY_SCRIPT);

  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Payment gateway is unavailable');

  const instance = new Razorpay({
    key: options.publicKey,
    amount: Number(options.amountPaise),
    currency: options.currency,
    name: options.appName,
    description: options.description,
    order_id: options.gatewayOrderId,
    prefill: options.prefill,
    theme: { color: '#16A34A' },
    handler: () => options.onSuccess(),
    modal: { ondismiss: () => options.onDismiss() },
  });

  instance.on('payment.failed', (response) => {
    const description =
      typeof response === 'object' &&
      response !== null &&
      'error' in response &&
      typeof (response as { error?: { description?: unknown } }).error?.description === 'string'
        ? ((response as { error: { description: string } }).error.description)
        : 'Payment failed';
    options.onFailure(description);
  });

  instance.open();
}
