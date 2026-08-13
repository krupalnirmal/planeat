import type {
  EnqueueOptions,
  EnqueueResult,
  JobHandler,
  JobName,
  QueueProvider,
} from './types';

/**
 * R2 — the in-process queue. Jobs run inline, immediately, in the same
 * request. That is exactly what we want through P6: the whole app works end to
 * end with no external queue, and tests are synchronous.
 *
 * `dedupeKey` is enforced here rather than in each handler, so running the
 * daily-order cron twice is harmless by construction (R5).
 */

export class MockQueueProvider implements QueueProvider {
  readonly name = 'mock';

  private handlers = new Map<JobName, JobHandler<never>>();
  private seen = new Set<string>();
  private counter = 0;

  /** Everything that was accepted, for test assertions. */
  private processed: Array<{ job: JobName; payload: unknown; at: Date }> = [];

  register<T>(job: JobName, handler: JobHandler<T>): void {
    this.handlers.set(job, handler as JobHandler<never>);
  }

  async enqueue<T>(opts: EnqueueOptions<T>): Promise<EnqueueResult> {
    if (this.seen.has(opts.dedupeKey)) {
      return { jobId: opts.dedupeKey, enqueued: false };
    }
    this.seen.add(opts.dedupeKey);
    this.counter += 1;

    const handler = this.handlers.get(opts.job) as JobHandler<T> | undefined;
    if (handler) {
      // Inline execution: a throw here surfaces in the caller, which is the
      // behaviour we want in development and tests.
      await handler(opts.payload);
    }

    this.processed.push({ job: opts.job, payload: opts.payload, at: new Date() });
    return { jobId: `mock_job_${this.counter}`, enqueued: true };
  }

  jobs(): readonly { job: JobName; payload: unknown; at: Date }[] {
    return this.processed;
  }

  clear(): void {
    this.seen.clear();
    this.processed = [];
    this.counter = 0;
  }
}
