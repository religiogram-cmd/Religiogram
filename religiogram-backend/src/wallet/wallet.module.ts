import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Wallet } from './entities/wallet.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletHold } from './entities/wallet-hold.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { AlertsModule } from '../common/alerts/alerts.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, LedgerEntry, WalletBalance, WalletHold]),
    ScheduleModule,
    AlertsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletReconciliationService],
  exports: [WalletService],
})
export class WalletModule {}
