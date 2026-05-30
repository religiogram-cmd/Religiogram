import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, CompressionTypes } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka!: Kafka;
  private producer!: Producer;
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.config.get<string[]>('kafka.brokers', ['localhost:9092']);
    this.kafka = new Kafka({
      clientId: 'religiogram-api',
      brokers,
      retry: { initialRetryTime: 300, retries: 8 },
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (err: any) {
      this.logger.warn(
        `Kafka producer connection failed (non-fatal): ${err.message}`,
      );
      // Non-fatal: app continues without Kafka in dev environments
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  /**
   * Returns true if the producer is connected.
   * Used by /health/ready to surface Kafka liveness as a 'degraded' signal.
   */
  ping(): boolean {
    return this.connected;
  }

  async publish<T extends { eventType: string }>(
    topic: string,
    event: T,
  ): Promise<void> {
    if (!this.connected) {
      this.logger.debug(
        `Kafka not connected, skipping event: ${event.eventType}`,
      );
      return;
    }
    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.Snappy,
        messages: [
          {
            key: this.extractKey(event),
            value: JSON.stringify({
              ...event,
              publishedAt: new Date().toISOString(),
            }),
            headers: {
              'event-type': event.eventType,
              source: 'religiogram-api',
            },
          },
        ],
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to publish event ${event.eventType}: ${err.message}`,
      );
      // Non-fatal: main business logic must not fail because of Kafka
    }
  }

  private extractKey(event: any): string {
    return (
      event.userId ??
      event.providerId ??
      event.sessionId ??
      event.bookingId ??
      'global'
    );
  }
}
