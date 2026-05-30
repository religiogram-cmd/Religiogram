import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { CommissionRule } from './entities/commission-rule.entity';
import { TdsRecord } from './entities/tds-record.entity';
import { HolidaySurge } from './entities/holiday-surge.entity';
import { DiscountCode } from './entities/discount-code.entity';
import { TravelFeeRule } from './entities/travel-fee-rule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommissionRule,
      TdsRecord,
      HolidaySurge,
      DiscountCode,
      TravelFeeRule,
    ]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
