import type { PushMessage, PushProvider, PushResult, PushTarget } from './types';

/** R2 — deterministic push mock. Tokens starting with `invalid_` are rejected. */

export interface SentPush {
  target: PushTarget;
  message: PushMessage;
  at: Date;
}

export class MockPushProvider implements PushProvider {
  readonly name = 'mock';

  private sent: SentPush[] = [];

  async send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    const invalidTokens: string[] = [];
    let accepted = 0;

    for (const target of targets) {
      if (target.token.startsWith('invalid_')) {
        invalidTokens.push(target.token);
        continue;
      }
      this.sent.push({ target, message, at: new Date() });
      accepted += 1;
    }

    if (process.env.NODE_ENV !== 'test' && accepted > 0) {
      console.info(`[MockPush] ${accepted} × "${message.title}"`);
    }

    return { accepted, failed: invalidTokens.length, invalidTokens };
  }

  outbox(): readonly SentPush[] {
    return this.sent;
  }

  clear(): void {
    this.sent = [];
  }
}
