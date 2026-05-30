import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EventRemindersService } from './event-reminders.service';

export const REMINDER_DISPATCH_QUEUE = 'event-reminder-dispatch';
export const REMINDER_DISPATCH_JOB = 'dispatch-due';

/**
 * Dispatcher worker — runs every minute (see EventRemindersScheduler)
 * and asks the service for any reminders whose `remind_at <= now()`.
 *
 * Why a 1-minute repeatable job instead of per-reminder delayed jobs?
 *   - Per-reminder delayed jobs would scale linearly with subscriptions:
 *     a popular event with 10k "remind me" clicks = 10k pending jobs in
 *     Redis all waiting on a single promoted_at.
 *   - A batched scan against a partial index
 *       WHERE status = 'scheduled' AND sent = false
 *     stays O(due-rows) regardless of total subscriptions. One DB round
 *     trip catches the entire minute's worth.
 *
 * Concurrency = 1. A second worker would race the first and send
 * duplicate notifications to the same user.
 */
@Processor(REMINDER_DISPATCH_QUEUE, { concurrency: 1 })
export class EventRemindersDispatcherProcessor extends WorkerHost {
  private readonly logger = new Logger(EventRemindersDispatcherProcessor.name);

  constructor(private readonly reminders: EventRemindersService) {
    super();
  }

  async process(job: Job): Promise<{ picked: number; sent: number; failed: number }> {
    this.logger.debug(`Running ${job.name} (job ${job.id})`);
    return this.reminders.dispatchDue(new Date());
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Reminder dispatch job ${job.id} failed: ${err.message}. BullMQ will retry.`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(
    job: Job,
    result: { picked: number; sent: number; failed: number },
  ): void {
    if (result.picked > 0) {
      this.logger.log(
        `Reminder batch: picked=${result.picked} sent=${result.sent} failed=${result.failed}`,
      );
    }
  }
}
