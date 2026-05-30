import { Global, Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { DomainEventPublisher } from './domain-event-publisher';

/**
 * EventsModule — global module that provides the Kafka producer and the
 * typed domain-event publisher to every other module in the application.
 *
 * Marked @Global so that any module can inject KafkaProducerService or
 * DomainEventPublisher without explicitly importing EventsModule.
 * Import it once in AppModule and it is available everywhere.
 */
@Global()
@Module({
  providers: [KafkaProducerService, DomainEventPublisher],
  exports: [KafkaProducerService, DomainEventPublisher],
})
export class EventsModule {}
