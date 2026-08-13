/**
 * The queue port.
 *
 * Background work that must not block a request: AI meal-plan generation,
 * notification fan-out, image processing. In P0–P6 this runs inline against
 * the mock; QStash or Cloudflare Queues slot in behind the same interface
 * when a job starts taking longer than a request may.
 *
 * R5 — every job payload carries a `dedupeKey`. Running a job twice must be
 * harmless, so the queue drops a duplicate key rather than relying on the
 * handler to be careful.
 */

export type JobName =
  | 'meal-plan.generate'
  | 'meal-plan.swap-suggestions'
  | 'notification.send'
  | 'smart-list.parse'
  | 'order.generate-daily'
  | 'payment.reconcile';

export interface EnqueueOptions<T = unknown> {
  job: JobName;
  payload: T;
  /** R5 — same key within the retention window enqueues exactly once. */
  dedupeKey: string;
  /** Delay before the job becomes eligible to run. */
  delaySeconds?: number;
}

export interface EnqueueResult {
  jobId: string;
  /** False when `dedupeKey` had already been seen. */
  enqueued: boolean;
}

export type JobHandler<T = unknown> = (payload: T) => Promise<void>;

export interface QueueProvider {
  readonly name: string;

  enqueue<T>(opts: EnqueueOptions<T>): Promise<EnqueueResult>;

  /**
   * Registers the function that runs a job. The mock calls it inline; a
   * hosted queue calls it from an HTTP callback route.
   */
  register<T>(job: JobName, handler: JobHandler<T>): void;
}

export class QueueProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueProviderError';
  }
}
