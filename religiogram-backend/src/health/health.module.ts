import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EventsModule } from '../events/events.module';
import { OpenSearchModule } from '../opensearch/opensearch.module';

/**
 * Health module.
 * RedisService  -> global RedisModule (no import needed)
 * DataSource    -> global TypeOrmModule (no import needed)
 * KafkaProducerService -> EventsModule (imported here for readiness check)
 * ProviderIndexService -> OpenSearchModule (imported here for readiness check)
 */
@Module({
  imports: [EventsModule, OpenSearchModule],
  controllers: [HealthController],
})
export class HealthModule {}
