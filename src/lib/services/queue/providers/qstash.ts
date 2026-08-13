import { env } from '@/lib/env';
import type {
  EnqueueOptions,
  EnqueueResult,
  JobHandler,
  JobName,
  QueueProvider,
} from '../types';
import { QueueProviderError } from '../types';

/**
 * Upstash QStash over plain REST — no vendor SDK (R1, R11).
 *
 * QStash calls back over HTTP, so handlers do not run in this process. The
 * callback route (`/api/queue/[job]`) is what invokes the registered handler;
 * `register` here only keeps the map that route reads.
 *
 * `Upstash-Deduplication-Id` gives us R5 idempotency at the queue level.
 */

const BASE_URL = 'https://qstash.upstash.io/v2/publish';

export class QStashProvider implements QueueProvider {
  readonly name = 'qstash';

  private handlers = new Map<JobName, JobHandler<never>>();

  constructor(
    private readonly token: string = process.env.QSTASH_TOKEN ?? '',
    private readonly callbackBaseUrl: string = env.appUrl,
  ) {}

  register<T>(job: JobName, handler: JobHandler<T>): void {
    this.handlers.set(job, handler as JobHandler<never>);
  }

  handlerFor(job: JobName): JobHandler<never> | undefined {
    return this.handlers.get(job);
  }

  async enqueue<T>(opts: EnqueueOptions<T>): Promise<EnqueueResult> {
    if (!this.token) {
      throw new QueueProviderError('QSTASH_TOKEN is not set.');
    }

    const target = `${this.callbackBaseUrl.replace(/\/$/, '')}/api/queue/${opts.job}`;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.token}`,
      'Upstash-Deduplication-Id': opts.dedupeKey,
    };
    if (opts.delaySeconds && opts.delaySeconds > 0) {
      headers['Upstash-Delay'] = `${opts.delaySeconds}s`;
    }

    const res = await fetch(`${BASE_URL}/${encodeURIComponent(target)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(opts.payload),
    });

    if (!res.ok) {
      throw new QueueProviderError(`QStash publish failed with status ${res.status}`);
    }

    const json = (await res.json()) as { messageId?: string; deduplicated?: boolean };

    return {
      jobId: json.messageId ?? opts.dedupeKey,
      enqueued: json.deduplicated !== true,
    };
  }
}
