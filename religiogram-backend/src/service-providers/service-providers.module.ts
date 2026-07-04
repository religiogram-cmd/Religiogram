import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProviderEntity } from './entities/provider.entity';
import { ServiceMasterEntity } from './entities/service-master.entity';
import { ProviderServiceEntity } from './entities/provider-service.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { KycVideoEntity } from './entities/kyc-video.entity';
import { OnboardingDraftEntity } from './entities/onboarding-draft.entity';
import { ProviderBankAccount } from './entities/provider-bank-account.entity';
import { SpecialisationEntity } from './entities/specialisation.entity';
import { CatalogService } from '../catalog/entities/catalog-service.entity';
import { ServiceCategory } from '../catalog/entities/service-category.entity';

import { ProvidersController } from './providers.controller';
import { ServicesCatalogueController } from './services.controller';
import { PublicProvidersController } from './public-providers.controller';
import { DiscoveryController } from './discovery.controller';
import { ProviderOnboardingV2Controller } from './onboarding-v2.controller';
import {
  PublicSpecialisationsController,
  AdminSpecialisationsController,
} from './specialisations.controller';
import { AdminRankingController } from './admin-ranking.controller';
import { RankingService } from './ranking.service';
import { ProviderOnboardingService } from './service-providers.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ServiceMasterEntity,
      ProviderServiceEntity,
      AvailabilityEntity,
      KycVideoEntity,
      OnboardingDraftEntity,
      ProviderBankAccount,
      SpecialisationEntity,
      CatalogService,
      ServiceCategory,
      Booking,
    ]),
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [
    ProvidersController,
    ServicesCatalogueController,
    PublicProvidersController,
    DiscoveryController,
    ProviderOnboardingV2Controller,
    PublicSpecialisationsController,
    AdminSpecialisationsController,
    AdminRankingController,
  ],
  providers: [ProviderOnboardingService, RankingService],
  exports: [ProviderOnboardingService, RankingService, TypeOrmModule],
})
export class ServiceProvidersModule {}
