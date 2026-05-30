import { Processor, WorkerHost } from '@nestjs/bullmq';
import { TracedWorkerHost } from '../tracing/bullmq-otel';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RefundService } from './refund.service';

@Processor('refunds')
export class RefundProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(RefundProcessor.name);

  constructor(private readonly refundService: RefundService) {
    super();
  }

  protected async tracedProcess(job: Job<{ refundId: string }>): Promise<void> {
    this.logger.log(`Processing refund job ${job.id}: refundId=${job.data.refundId}`);
    await this.refundService.processRefund(job.data.refundId);
  }
}
