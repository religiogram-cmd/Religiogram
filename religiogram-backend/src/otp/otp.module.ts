import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { OtpService } from './otp.service';
import { SmsProviderService } from './sms-provider.service';
import { SmsProcessor } from './sms.processor';
import { SMS_QUEUE } from './sms.queue.constants';
import { CostLockModule } from '../common/cost-lock/cost-lock.module';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: SMS_QUEUE }),
    CostLockModule,
  ],
  providers: [OtpService, SmsProviderService, SmsProcessor],
  exports: [OtpService],
})
export class OtpModule {}
