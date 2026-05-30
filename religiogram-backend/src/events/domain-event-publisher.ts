import { Injectable } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_TOPICS } from './event-topics';
import {
  BookingCreatedEvent,
  BookingConfirmedEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  WalletCreditedEvent,
  WalletDebitedEvent,
  WalletRefundedEvent,
  ConsultationStartedEvent,
  ConsultationTickEvent,
  ConsultationEndedEvent,
  PaymentCapturedEvent,
  PaymentFailedEvent,
  ReviewCreatedEvent,
  FraudSignalCreatedEvent,
  PayoutProcessedEvent,
  PostPublishedEvent,
  ProviderApprovedEvent,
  ProviderSuspendedEvent,
  UserRegisteredEvent,
} from './domain-events';

/**
 * Typed convenience wrapper around KafkaProducerService.
 * Each method maps a domain event to the correct Kafka topic.
 * All methods are fire-and-forget: errors are swallowed so that
 * Kafka unavailability never affects the primary business flow.
 */
@Injectable()
export class DomainEventPublisher {
  constructor(private readonly producer: KafkaProducerService) {}

  publishUserRegistered(event: UserRegisteredEvent): void {
    this.producer.publish(KAFKA_TOPICS.USERS, event).catch(() => {});
  }

  publishProviderApproved(event: ProviderApprovedEvent): void {
    this.producer.publish(KAFKA_TOPICS.PROVIDERS, event).catch(() => {});
  }

  publishProviderSuspended(event: ProviderSuspendedEvent): void {
    this.producer.publish(KAFKA_TOPICS.PROVIDERS, event).catch(() => {});
  }

  publishBookingCreated(event: BookingCreatedEvent): void {
    this.producer.publish(KAFKA_TOPICS.BOOKINGS, event).catch(() => {});
  }

  publishBookingConfirmed(event: BookingConfirmedEvent): void {
    this.producer.publish(KAFKA_TOPICS.BOOKINGS, event).catch(() => {});
  }

  publishBookingCancelled(event: BookingCancelledEvent): void {
    this.producer.publish(KAFKA_TOPICS.BOOKINGS, event).catch(() => {});
  }

  publishBookingCompleted(event: BookingCompletedEvent): void {
    this.producer.publish(KAFKA_TOPICS.BOOKINGS, event).catch(() => {});
  }

  publishWalletCredited(event: WalletCreditedEvent): void {
    this.producer.publish(KAFKA_TOPICS.WALLET, event).catch(() => {});
  }

  publishWalletDebited(event: WalletDebitedEvent): void {
    this.producer.publish(KAFKA_TOPICS.WALLET, event).catch(() => {});
  }

  publishWalletRefunded(event: WalletRefundedEvent): void {
    this.producer.publish(KAFKA_TOPICS.WALLET, event).catch(() => {});
  }

  publishConsultationStarted(event: ConsultationStartedEvent): void {
    this.producer.publish(KAFKA_TOPICS.CONSULTATIONS, event).catch(() => {});
  }

  publishConsultationTick(event: ConsultationTickEvent): void {
    this.producer.publish(KAFKA_TOPICS.CONSULTATIONS, event).catch(() => {});
  }

  publishConsultationEnded(event: ConsultationEndedEvent): void {
    this.producer.publish(KAFKA_TOPICS.CONSULTATIONS, event).catch(() => {});
  }

  publishPaymentCaptured(event: PaymentCapturedEvent): void {
    this.producer.publish(KAFKA_TOPICS.PAYMENTS, event).catch(() => {});
  }

  publishPaymentFailed(event: PaymentFailedEvent): void {
    this.producer.publish(KAFKA_TOPICS.PAYMENTS, event).catch(() => {});
  }

  publishReviewCreated(event: ReviewCreatedEvent): void {
    this.producer.publish(KAFKA_TOPICS.REVIEWS, event).catch(() => {});
  }

  publishFraudSignal(event: FraudSignalCreatedEvent): void {
    this.producer.publish(KAFKA_TOPICS.FRAUD, event).catch(() => {});
  }

  publishPayoutProcessed(event: PayoutProcessedEvent): void {
    this.producer.publish(KAFKA_TOPICS.PAYMENTS, event).catch(() => {});
  }

  publishPostPublished(event: PostPublishedEvent): void {
    this.producer.publish(KAFKA_TOPICS.SOCIAL, event).catch(() => {});
  }
}
