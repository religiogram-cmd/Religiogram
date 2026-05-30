import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * Global so controllers/services across all modules can inject
 * FeatureFlagsService without adding imports to every module.
 * Depends on RedisModule + AlertsModule being registered globally.
 */
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
