import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from './entities/dispute.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeService } from './dispute.service';
import { DisputeController } from './dispute.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Dispute, DisputeMessage]), WalletModule],
  providers: [DisputeService],
  controllers: [DisputeController],
  exports: [DisputeService],
})
export class DisputeModule {}
