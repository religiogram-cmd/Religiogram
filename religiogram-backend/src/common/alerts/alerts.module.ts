import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlertsService } from './alerts.service';

/**
 * Global so any service can inject AlertsService without re-importing.
 * The module registers HttpModule internally so alert posts don't collide
 * with other HttpModule configurations.
 */
@Global()
@Module({
  imports: [HttpModule.register({ timeout: 3_000, maxRedirects: 0 })],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
