import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { AvailabilityOverride } from './entities/availability-override.entity';
import { ProviderSlotLock } from './entities/provider-slot-lock.entity';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AvailabilitySlot, AvailabilityOverride, ProviderSlotLock])],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService, TypeOrmModule],
})
export class AvailabilityModule {}
