/**
 * The push port.
 *
 * B16 — push is the SECONDARY channel. Reach in this segment is genuinely
 * poor, so nothing important may depend on push alone; WhatsApp carries the
 * load and in-app notifications are the durable record.
 */

export interface PushTarget {
  /** FCM registration token, or a Web Push endpoint for the PWA. */
  token: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Deep link opened on tap, e.g. /mr/orders/ord_123. */
  url?: string;
  imageUrl?: string;
  /** Arbitrary key/values delivered to the service worker. */
  data?: Record<string, string>;
  /** Collapses older notifications with the same key. */
  collapseKey?: string;
}

export interface PushResult {
  accepted: number;
  failed: number;
  /** Tokens the provider reported as permanently invalid — delete them. */
  invalidTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  send(targets: PushTarget[], message: PushMessage): Promise<PushResult>;
}

export class PushProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushProviderError';
  }
}
