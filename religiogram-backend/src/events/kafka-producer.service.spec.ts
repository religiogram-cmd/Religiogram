import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';

// ── Mock kafkajs ───────────────────────────────────────────────────────────────

const mockProducerSend = jest.fn().mockResolvedValue(undefined);
const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockProducerDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect:    mockProducerConnect,
      disconnect: mockProducerDisconnect,
      send:       mockProducerSend,
    }),
  })),
  CompressionTypes: { Snappy: 2 },
}));

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    if (key === 'KAFKA_BROKERS') return 'localhost:9092';
    return def ?? null;
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('KafkaProducerService', () => {
  let svc: KafkaProducerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProducerConnect.mockResolvedValue(undefined);
    mockProducerSend.mockResolvedValue(undefined);
    mockProducerDisconnect.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaProducerService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<KafkaProducerService>(KafkaProducerService);
  });

  // ── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('connects the Kafka producer on init', async () => {
      await svc.onModuleInit();
      expect(mockProducerConnect).toHaveBeenCalledTimes(1);
    });

    it('does not throw when Kafka connection fails (non-fatal)', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('Kafka unreachable'));
      await expect(svc.onModuleInit()).resolves.not.toThrow();
    });

    it('marks connected=false when connection fails', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('Kafka down'));
      await svc.onModuleInit();
      expect((svc as any).connected).toBe(false);
    });
  });

  // ── onModuleDestroy ────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('disconnects producer when connected', async () => {
      await svc.onModuleInit(); // connects
      await svc.onModuleDestroy();
      expect(mockProducerDisconnect).toHaveBeenCalledTimes(1);
    });

    it('skips disconnect when not connected', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('down'));
      await svc.onModuleInit(); // fails → connected=false
      await svc.onModuleDestroy();
      expect(mockProducerDisconnect).not.toHaveBeenCalled();
    });
  });

  // ── publish ────────────────────────────────────────────────────────────────

  describe('publish()', () => {
    beforeEach(async () => {
      await svc.onModuleInit(); // connects → connected=true
    });

    it('publishes event to the correct topic', async () => {
      await svc.publish('booking.events', { eventType: 'BOOKING_CREATED', bookingId: 'bk-1' });
      const [callArgs] = mockProducerSend.mock.calls[0];
      expect(callArgs.topic).toBe('booking.events');
    });

    it('serializes the event as JSON in the message value', async () => {
      await svc.publish('payment.events', { eventType: 'PAYMENT_CAPTURED', userId: 'u-1' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      const parsed = JSON.parse(msg.value as string);
      expect(parsed.eventType).toBe('PAYMENT_CAPTURED');
    });

    it('adds publishedAt timestamp to the message', async () => {
      await svc.publish('wallet.events', { eventType: 'WALLET_DEBITED', userId: 'u-1' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      const parsed = JSON.parse(msg.value as string);
      expect(parsed.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets event-type header', async () => {
      await svc.publish('fraud.events', { eventType: 'FRAUD_DETECTED', userId: 'u-1' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      expect(msg.headers?.['event-type']).toBe('FRAUD_DETECTED');
    });

    it('uses userId as message key when present', async () => {
      await svc.publish('user.events', { eventType: 'USER_UPDATED', userId: 'user-xyz' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      expect(msg.key).toBe('user-xyz');
    });

    it('uses bookingId as message key when userId is absent', async () => {
      await svc.publish('booking.events', { eventType: 'BOOKING_CONFIRMED', bookingId: 'bk-99' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      expect(msg.key).toBe('bk-99');
    });

    it('falls back to "global" key when no ID field present', async () => {
      await svc.publish('system.events', { eventType: 'MAINTENANCE_START' });
      const [{ messages: [msg] }] = mockProducerSend.mock.calls[0];
      expect(msg.key).toBe('global');
    });

    it('skips send (no-op) when not connected', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('down'));
      await svc.onModuleInit(); // fails → connected=false
      jest.clearAllMocks();

      await svc.publish('topic', { eventType: 'TEST' });
      expect(mockProducerSend).not.toHaveBeenCalled();
    });

    it('does not throw when producer.send fails (non-fatal)', async () => {
      mockProducerSend.mockRejectedValueOnce(new Error('Kafka leader election'));
      await expect(
        svc.publish('topic', { eventType: 'SOME_EVENT' }),
      ).resolves.not.toThrow();
    });
  });
});
