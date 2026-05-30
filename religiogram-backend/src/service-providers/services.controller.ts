import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { ProviderOnboardingService } from './service-providers.service';
import { ProviderReligion } from './entities/provider.entity';

class CatalogueQueryDto {
  @IsEnum(ProviderReligion)
  religion!: ProviderReligion;
}

/**
 * GET /services?religion=hindu
 *
 * Public — the onboarding wizard reads the catalogue without auth so we
 * can show a preview on the marketing landing page.
 */
@Controller({ path: 'services', version: '1' })
export class ServicesCatalogueController {
  constructor(private readonly onboarding: ProviderOnboardingService) {}

  @Public()
  @Get()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  list(@Query() q: CatalogueQueryDto) {
    return this.onboarding.listCatalogue(q.religion);
  }
}
