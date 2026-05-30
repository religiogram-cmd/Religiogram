import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderEarning } from "./entities/provider-earning.entity";
import { PayoutBatch } from "./entities/payout-batch.entity";
import { PayoutService } from "./payout.service";
import { PayoutController } from "./payout.controller";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderEarning, PayoutBatch]),
    EmailModule,
    NotificationsModule,
    RedisModule,
  ],
  controllers: [PayoutController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}
