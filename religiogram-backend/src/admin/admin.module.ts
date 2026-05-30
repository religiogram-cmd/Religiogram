import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { DisputeModule } from "../dispute/dispute.module";

import { AdminOpsController } from "./admin-ops.controller";
import { AdminTemplesController } from "./admin-temples.controller";
import { AdminTemplesService } from "./admin-temples.service";
import { AdminProvidersController } from "./admin-providers.controller";
import { AdminWalletController } from "./admin-wallet.controller";
import { AdminDisputesController } from "./admin-disputes.controller";
import { AdminFraudController } from "./admin-fraud.controller";
import { AdminVerificationController } from "./admin-verification.controller";
import { AdminAnalyticsController } from "./admin-analytics.controller";
import { AdminAuditService } from "./admin-audit.service";
import { AdminPaymentsController } from "./admin-payments.controller";
import { AdminProviderVerificationController } from "./admin-provider-verification.controller";
import { KycVideoEntity } from "../service-providers/entities/kyc-video.entity";
import { QUEUE } from "../common/queues/queue.constants";
import { RedisModule } from "../redis/redis.module";
import { PartmanModule } from "../common/partman/partman.module";

import { Temple } from "../temples/entities/temple.entity";
import { Admin } from "./entities/admin.entity";
import { AdminActionLog } from "./entities/admin-action-log.entity";

import { ProviderEntity } from "../service-providers/entities/provider.entity";
import { Wallet } from "../wallet/entities/wallet.entity";
import { LedgerEntry } from "../wallet/entities/ledger-entry.entity";
import { WalletBalance } from "../wallet/entities/wallet-balance.entity";
import { Dispute } from "../dispute/entities/dispute.entity";
import { FraudSignal } from "../fraud/entities/fraud-signal.entity";
import { VerificationReviewQueue } from "../verification/entities/verification-review-queue.entity";
import { VerificationSubmission } from "../verification/entities/verification-submission.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingsModule } from "../bookings/bookings.module";
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE.WEBHOOK_RETRY }),
    RedisModule,
    PartmanModule,
    WalletModule,
    DisputeModule,
    BookingsModule,
    TypeOrmModule.forFeature([
      Temple,
      Admin,
      AdminActionLog,
      ProviderEntity,
      Wallet,
      LedgerEntry,
      Dispute,
      FraudSignal,
      VerificationReviewQueue,
      VerificationSubmission,
      Booking,
      KycVideoEntity,
      WalletBalance,
    ]),
  ],
  controllers: [
    AdminOpsController,
    AdminTemplesController,
    AdminProvidersController,
    AdminWalletController,
    AdminDisputesController,
    AdminFraudController,
    AdminVerificationController,
    AdminAnalyticsController,
    AdminPaymentsController,
    AdminProviderVerificationController,
  ],
  providers: [AdminTemplesService, AdminAuditService],
  exports: [TypeOrmModule, AdminAuditService],
})
export class AdminModule {}
