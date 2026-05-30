import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriestsController } from './priests.controller';
import { PriestsService } from './priests.service';
import { ProviderEntity as Provider } from '../service-providers/entities/provider.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { OpenSearchModule } from '../opensearch/opensearch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Provider, Booking]),
    CatalogModule,
    OpenSearchModule,
  ],
  controllers: [PriestsController],
  providers: [PriestsService],
  exports: [PriestsService],
})
export class PriestsModule {}
