import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { HttpModule } from "@nestjs/axios";
import { Payment } from "./entities/payment.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingsModule } from "../bookings/bookings.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService, PAYMENT_WEBHOOK_QUEUE } from "./payments.service";
import { PaymentWebhookProcessor } from "./payment-webhook.processor";
import { WebhookRetryProcessor } from "./webhook-retry.processor";
import { QUEUE } from "../common/queues/queue.constants";
import { PaymentPollingService } from "./payment-polling.service";
import { RedisModule } from "../redis/redis.module";
import { WalletModule } from "../wallet/wallet.module";
import { AlertsModule } from "../common/alerts/alerts.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Booking]),
    BullModule.registerQueue({ name: PAYMENT_WEBHOOK_QUEUE }),
    BullModule.registerQueue({ name: QUEUE.WEBHOOK_RETRY }),
    ScheduleModule.forRoot(),
    HttpModule,
    RedisModule,
    AlertsModule,
    forwardRef(() => BookingsModule),
    forwardRef(() => WalletModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentWebhookProcessor, WebhookRetryProcessor, PaymentPollingService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
