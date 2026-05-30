import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RefundRequest } from './entities/refund-request.entity';
import { RefundService } from './refund.service';
import { RefundProcessor } from './refund.processor';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefundRequest]),
    BullModule.registerQueue({ name: 'refunds' }),
    WalletModule,
    // M2: forwardRef to avoid circular dependency (Payments→Bookings→Refunds→Payments)
    forwardRef(() => PaymentsModule),
    FraudModule,
  ],
  providers: [RefundService, RefundProcessor],
  exports: [RefundService],
})
export class RefundModule {}
