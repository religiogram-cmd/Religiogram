import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Religion } from './entities/religion.entity';
import { ProviderRole } from './entities/provider-role.entity';
import { ServiceCategory } from './entities/service-category.entity';
import { CatalogService as CatalogServiceEntity } from './entities/catalog-service.entity';
import { ServiceAddOn } from './entities/service-addon.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Religion, ProviderRole, ServiceCategory, CatalogServiceEntity, ServiceAddOn])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
