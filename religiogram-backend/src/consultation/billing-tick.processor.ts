import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE } from '../common/queues/queue.constants';
import { ConsultationBillingService } from './consultation-billing.service';

export interface BillingTickJobData {
  sessionId: string;
}

/**
 * BillingTickProcessor — processes per-minute consultation billing ticks.
 *
 * This processor is driven by a BullMQ repeatable job scheduled by
 * ConsultationBillingService.startBilling(). It replaces the previous
 * in-process setInterval approach, which did not survive pod restarts.
 *
 * Each execution calls billing.tick(sessionId) which:
 *   1. Reads billing state from Redis
 *   2. Debits the user's wallet for one minute
 *   3. Persists a SessionBillingTick row + updates ConsultationSession.total_charge
 *
 * The repeatable job is removed by ConsultationBillingService.stopBilling().
 */
@Processor(QUEUE.CONSULTATION_BILLING)
export class BillingTickProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingTickProcessor.name);

  constructor(private readonly billing: ConsultationBillingService) {
    super();
  }

  async process(job: Job<BillingTickJobData>): Promise<void> {
    const { sessionId } = job.data;
    this.logger.debug(`Processing billing tick for session=${sessionId}`);
    await this.billing.tick(sessionId);
  }
}
