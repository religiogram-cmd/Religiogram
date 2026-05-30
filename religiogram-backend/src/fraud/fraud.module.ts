import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudSignal } from './entities/fraud-signal.entity';
import { FraudService } from './fraud.service';
import { FraudController } from './fraud.controller';
import { RiskScoringService } from './risk-scoring.service';

@Module({
  imports: [TypeOrmModule.forFeature([FraudSignal])],
  providers: [FraudService, RiskScoringService],
  controllers: [FraudController],
  exports: [FraudService, RiskScoringService],
})
export class FraudModule {}
