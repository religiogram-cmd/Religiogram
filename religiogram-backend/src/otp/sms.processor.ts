import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { SmsProviderService } from './sms-provider.service';
import { SMS_QUEUE, SMS_JOB, type SendOtpJobData } from './sms.queue.constants';

/**
 * BullMQ worker — processes SMS send jobs off the main request thread.
 *
 * Why this matters at scale:
 *   MSG91 API calls take 200–800ms each. Without a queue, every /auth/send-otp
 *   request blocks a Node.js event loop tick for the full SMS round-trip.
 *   At 500 concurrent OTP requests (festival traffic spike), the thread backs up
 *   and users see timeouts — even though the OTP was already stored in Redis.
 *
 * With the queue:
 *   1. OTP is generated + stored in Redis atomically (fast, <5ms)
 *   2. Job is enqueued (<1ms)
 *   3. HTTP 200 returns immediately to the user
 *   4. This processor picks up the job and calls MSG91 in the background
 *   5. If MSG91 fails, BullMQ retries with exponential backoff (3 attempts)
 *
 * Concurrency is configurable via SMS_PROCESSOR_CONCURRENCY env var.
 * Default 100 handles ~500 OTP/sec at ~200ms per MSG91 call. Raise if MSG91
 * allows higher throughput or you add more workers. See scalability analysis
 * in PROJECT_OVERVIEW.md for the full capacity math.
 */
@Processor(SMS_QUEUE, {
  // Read from env at module load — ConfigService isn't available at
  // decorator evaluation time, so fall back to env directly.
  concurrency: parseInt(process.env.SMS_PROCESSOR_CONCURRENCY ?? '100', 10),
})
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    private readonly smsProvider: SmsProviderService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<SendOtpJobData>): Promise<void> {
    const { phone, otp } = job.data;
    const attempt = job.attemptsMade + 1;

    if (job.name !== SMS_JOB.SEND_OTP) {
      this.logger.warn(`Unknown SMS job type: ${job.name}`);
      return;
    }

    this.logger.log(
      `SMS job ${job.id} attempt ${attempt} for phone ***${phone.slice(-4)}`,
    );

    try {
      await this.smsProvider.sendOtp(phone, otp);
      this.logger.log(`SMS job ${job.id} completed on attempt ${attempt}`);
    } catch (err) {
      // Let BullMQ see the error so backoff retries happen. We only log the
      // error; BullMQ handles retry scheduling based on the job options
      // (3 attempts, exponential backoff from 2s).
      const msg = (err as Error).message ?? 'unknown error';
      this.logger.error(
        `SMS job ${job.id} attempt ${attempt} failed for ***${phone.slice(-4)}: ${msg}`,
      );
      throw err;
    }
  }
}
