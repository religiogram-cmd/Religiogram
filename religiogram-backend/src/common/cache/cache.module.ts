import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * CacheModule is @Global so every feature module can inject CacheService
 * without importing this module explicitly.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class AppCacheModule {}
