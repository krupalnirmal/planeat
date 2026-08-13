import { NextResponse } from 'next/server';
import { clientIp, route } from '@/lib/api/handler';
import { getPaymentProvider } from '@/lib/services/payment';
import { handlePaymentWebhook, recordRejectedWebhook } from '@/lib/wallet/webhook';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/razorpay — P2, the source of truth for the wallet.
 *
 * Three things this route must get right, all of them non-obvious:
 *
 * 1. **Read the RAW body.** The HMAC is over the exact bytes the gateway sent.
 *    `await request.json()` then `JSON.stringify` round-trips key order and
 *    whitespace, and the signature stops matching. `request.text()` first,
 *    always.
 *
 * 2. **A bad signature is a 400 and a logged security event**, never a
 *    fallback to trusting the body.
 *
 * 3. **Acknowledge anything we understood**, even events for payments we do
 *    not recognise. A non-2xx makes the gateway retry for hours; a test event
 *    fired from their dashboard should not turn into a retry storm.
 *
 * This route deliberately does not use the `{ success, data, error }` envelope
 * for its 2xx: the gateway only reads the status code, and returning a plain
 * body keeps the acknowledgement unambiguous.
 */
export const POST = route(async (request: Request) => {
  const rawBody = await request.text();

  // Razorpay signs with this header. Kept here rather than in the provider
  // because it is a transport detail of the HTTP request, not of the gateway
  // API — the provider is handed the raw body and the signature, and decides
  // what to do with them.
  const signature =
    request.headers.get('x-razorpay-signature') ??
    request.headers.get('x-webhook-signature') ??
    '';

  const provider = getPaymentProvider();
  const event = await provider.verifyWebhook({ rawBody, signature });

  if (!event) {
    await recordRejectedWebhook(
      signature ? 'signature mismatch' : 'missing signature header',
      clientIp(request),
    );
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
  }

  const outcome = await handlePaymentWebhook(event);

  return NextResponse.json({ ok: true, action: outcome.action }, { status: 200 });
});
