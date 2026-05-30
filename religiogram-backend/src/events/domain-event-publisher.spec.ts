import { DomainEventPublisher } from './domain-event-publisher';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_TOPICS } from './event-topics';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockProducer = {
  publish: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('DomainEventPublisher', () => {
  let publisher: DomainEventPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new DomainEventPublisher(
      mockProducer as unknown as KafkaProducerService,
    );
  });

  // ── helper ────────────────────────────────────────────────────────────────

  async function flushPromises(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
  }

  // ── user events ───────────────────────────────────────────────────────────

  it('publishUserRegistered → rg.users topic', async () => {
    const event: any = { type: 'UserRegistered', userId: 'u-1' };
    publisher.publishUserRegistered(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.USERS, event);
  });

  // ── provider events ───────────────────────────────────────────────────────

  it('publishProviderApproved → rg.providers topic', async () => {
    const event: any = { type: 'ProviderApproved', providerId: 'p-1' };
    publisher.publishProviderApproved(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.PROVIDERS, event);
  });

  it('publishProviderSuspended → rg.providers topic', async () => {
    const event: any = { type: 'ProviderSuspended', providerId: 'p-2' };
    publisher.publishProviderSuspended(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.PROVIDERS, event);
  });

  // ── booking events ────────────────────────────────────────────────────────

  it('publishBookingCreated → rg.bookings topic', async () => {
    const event: any = { type: 'BookingCreated', bookingId: 'bk-1' };
    publisher.publishBookingCreated(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.BOOKINGS, event);
  });

  it('publishBookingConfirmed → rg.bookings topic', async () => {
    const event: any = { type: 'BookingConfirmed', bookingId: 'bk-2' };
    publisher.publishBookingConfirmed(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.BOOKINGS, event);
  });

  it('publishBookingCancelled → rg.bookings topic', async () => {
    const event: any = { type: 'BookingCancelled', bookingId: 'bk-3' };
    publisher.publishBookingCancelled(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.BOOKINGS, event);
  });

  it('publishBookingCompleted → rg.bookings topic', async () => {
    const event: any = { type: 'BookingCompleted', bookingId: 'bk-4' };
    publisher.publishBookingCompleted(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.BOOKINGS, event);
  });

  // ── wallet events ─────────────────────────────────────────────────────────

  it('publishWalletCredited → rg.wallet topic', async () => {
    const event: any = { type: 'WalletCredited', userId: 'u-1', amountPaise: 1000 };
    publisher.publishWalletCredited(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.WALLET, event);
  });

  it('publishWalletDebited → rg.wallet topic', async () => {
    const event: any = { type: 'WalletDebited', userId: 'u-1', amountPaise: 500 };
    publisher.publishWalletDebited(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.WALLET, event);
  });

  it('publishWalletRefunded → rg.wallet topic', async () => {
    const event: any = { type: 'WalletRefunded', userId: 'u-2', amountPaise: 200 };
    publisher.publishWalletRefunded(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.WALLET, event);
  });

  // ── consultation events ───────────────────────────────────────────────────

  it('publishConsultationStarted → rg.consultations topic', async () => {
    const event: any = { type: 'ConsultationStarted', sessionId: 'sess-1' };
    publisher.publishConsultationStarted(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.CONSULTATIONS, event);
  });

  it('publishConsultationTick → rg.consultations topic', async () => {
    const event: any = { type: 'ConsultationTick', sessionId: 'sess-1', tick: 5 };
    publisher.publishConsultationTick(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.CONSULTATIONS, event);
  });

  it('publishConsultationEnded → rg.consultations topic', async () => {
    const event: any = { type: 'ConsultationEnded', sessionId: 'sess-1' };
    publisher.publishConsultationEnded(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.CONSULTATIONS, event);
  });

  // ── payment events ────────────────────────────────────────────────────────

  it('publishPaymentCaptured → rg.payments topic', async () => {
    const event: any = { type: 'PaymentCaptured', paymentId: 'pay-1' };
    publisher.publishPaymentCaptured(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.PAYMENTS, event);
  });

  it('publishPaymentFailed → rg.payments topic', async () => {
    const event: any = { type: 'PaymentFailed', paymentId: 'pay-2' };
    publisher.publishPaymentFailed(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.PAYMENTS, event);
  });

  it('publishPayoutProcessed → rg.payments topic', async () => {
    const event: any = { type: 'PayoutProcessed', payoutId: 'payout-1' };
    publisher.publishPayoutProcessed(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.PAYMENTS, event);
  });

  // ── review / fraud / social events ───────────────────────────────────────

  it('publishReviewCreated → rg.reviews topic', async () => {
    const event: any = { type: 'ReviewCreated', reviewId: 'rev-1' };
    publisher.publishReviewCreated(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.REVIEWS, event);
  });

  it('publishFraudSignal → rg.fraud topic', async () => {
    const event: any = { type: 'FraudSignalCreated', userId: 'u-3', ruleId: 'vel_otp' };
    publisher.publishFraudSignal(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.FRAUD, event);
  });

  it('publishPostPublished → rg.social topic', async () => {
    const event: any = { type: 'PostPublished', postId: 'post-1', authorId: 'u-1' };
    publisher.publishPostPublished(event);
    await flushPromises();
    expect(mockProducer.publish).toHaveBeenCalledWith(KAFKA_TOPICS.SOCIAL, event);
  });

  // ── fire-and-forget: Kafka errors are swallowed ───────────────────────────

  it('does not throw even if kafka producer rejects', async () => {
    mockProducer.publish.mockRejectedValueOnce(new Error('Kafka broker down'));
    expect(() =>
      publisher.publishUserRegistered({ type: 'UserRegistered' } as any),
    ).not.toThrow();
    // Allow the promise rejection to be handled silently
    await flushPromises();
  });
});
