/**
 * Unit tests — BookingsService state machine
 *
 * Covers the real service signatures:
 *   createBooking(dto, user)
 *   confirmBooking(bookingId, userId?, walletService?)
 *   completeBooking(bookingId, actorId)
 *   cancelBooking(bookingId, actorId, actorRole, reason)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus, BookingType } from './entities/booking.entity';
import { BookingEvent } from './entities/booking-event.entity';
import { EmailService } from '../email/email.service';
import { WalletService } from '../wallet/wallet.service';

// ── helpers ───────────────────────────────────────────────────────────────────

const repo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
});

/** DataSource mock where the transactional callback receives a fake EntityManager */
const buildDs = (emOverrides: Record<string, any> = {}) => ({
  transaction: jest.fn(async (cb: any) => {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),    // default: no conflict
      ...emOverrides.qb,
    };
    const em = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (e: any) => ({ ...e, id: e.id ?? 'gen-uuid' })),
      create: jest.fn((_: any, data: any) => ({ ...data })),
      createQueryBuilder: jest.fn(() => qb),
      ...emOverrides.em,
    };
    return cb(em);
  }),
});

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  userId: 'user-1',
  providerId: 'provider-1',
  status: BookingStatus.PENDING,
  type: BookingType.OFFLINE,
  scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  amountInr: 1100,
  amountPaise: 110000,
  durationMinutes: 60,
  ...overrides,
} as Booking);

// ── test suite ────────────────────────────────────────────────────────────────

describe('BookingsService — state machine', () => {
  let service: BookingsService;
  let bookingRepo: ReturnType<typeof repo>;
  let eventRepo: ReturnType<typeof repo>;
  let ds: ReturnType<typeof buildDs>;

  const setup = async (dsOverrides = {}) => {
    bookingRepo = repo();
    eventRepo   = repo();
    ds = buildDs(dsOverrides);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking),      useValue: bookingRepo },
        { provide: getRepositoryToken(BookingEvent), useValue: eventRepo   },
        { provide: getDataSourceToken(),             useValue: ds          },
        { provide: EmailService, useValue: { sendBookingConfirmation: jest.fn().mockResolvedValue(undefined), sendBookingCancellation: jest.fn().mockResolvedValue(undefined) } },
        { provide: WalletService, useValue: { credit: jest.fn().mockResolvedValue(undefined), debit: jest.fn().mockResolvedValue({ success: true }), hold: jest.fn().mockResolvedValue(undefined), releaseHold: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  };

  beforeEach(() => setup());
  afterEach(() => jest.clearAllMocks());

  // ── createBooking ───────────────────────────────────────────────────────────

  describe('createBooking', () => {
    it('creates a PENDING booking when slot is free', async () => {
      // Default ds has getCount() = 0 (no conflict)
      await expect(
        service.createBooking(
          {
            providerId:      'provider-1',
            scheduledAt:     new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            serviceType:     'puja',
            amountInr:       1100,
            durationMinutes: 60,
          } as any,
          { userId: 'user-1', role: 'user', email: 'u@t.com' } as any,
        ),
      ).resolves.not.toThrow();

      expect(ds.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when provider slot is taken', async () => {
      await setup({
        qb: { getCount: jest.fn().mockResolvedValue(1) },  // overlap exists
      });

      await expect(
        service.createBooking(
          {
            providerId:      'provider-1',
            scheduledAt:     new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            serviceType:     'puja',
            amountInr:       1100,
            durationMinutes: 60,
          } as any,
          { userId: 'user-1', role: 'user', email: 'u@t.com' } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── confirmBooking ──────────────────────────────────────────────────────────

  describe('confirmBooking', () => {
    it('transitions PENDING → CONFIRMED', async () => {
      const booking = makeBooking();
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CONFIRMED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      const result = await service.confirmBooking('booking-1', 'user-1');

      expect(bookingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: BookingStatus.CONFIRMED }),
      );
    });

    it('returns booking unchanged when already CONFIRMED (idempotent)', async () => {
      const confirmed = makeBooking({ status: BookingStatus.CONFIRMED });
      bookingRepo.findOne.mockResolvedValue(confirmed);

      const result = await service.confirmBooking('booking-1', 'user-1');
      // Service logs warning and returns without re-saving
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── completeBooking ─────────────────────────────────────────────────────────

  describe('completeBooking', () => {
    it('transitions CONFIRMED → COMPLETED', async () => {
      const booking = makeBooking({ status: BookingStatus.CONFIRMED });
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.COMPLETED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      await service.completeBooking('booking-1', 'provider-1');

      expect(bookingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: BookingStatus.COMPLETED }),
      );
    });
  });

  // ── cancelBooking ───────────────────────────────────────────────────────────

  describe('cancelBooking', () => {
    it('allows user to cancel a PENDING booking (full refund >48h)', async () => {
      const booking = makeBooking({
        userId: 'user-1',
        status: BookingStatus.PENDING,
        scheduledAt: new Date(Date.now() + 96 * 60 * 60 * 1000), // 4 days out
        amountPaise: 110000,
      });
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      const { booking: cancelled, refundPaise } = await service.cancelBooking(
        'booking-1', 'user-1', 'user', 'changed mind',
      );

      expect(cancelled.status).toBe(BookingStatus.CANCELLED);
      expect(refundPaise).toBe(110000);  // full refund >48h
    });

    it('gives 50% refund when 24–48h before slot', async () => {
      const booking = makeBooking({
        userId: 'user-1',
        status: BookingStatus.CONFIRMED,
        scheduledAt: new Date(Date.now() + 36 * 60 * 60 * 1000), // 36h
        amountPaise: 110000,
      });
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      const { refundPaise } = await service.cancelBooking(
        'booking-1', 'user-1', 'user', 'plans changed',
      );

      expect(refundPaise).toBe(55000);  // 50%
    });

    it('gives 0 refund when <24h before slot', async () => {
      const booking = makeBooking({
        userId: 'user-1',
        status: BookingStatus.CONFIRMED,
        scheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000),  // 6h
        amountPaise: 110000,
      });
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      const { refundPaise } = await service.cancelBooking(
        'booking-1', 'user-1', 'user', 'emergency',
      );

      expect(refundPaise).toBe(0);
    });

    it('gives full refund when provider cancels (any time)', async () => {
      const booking = makeBooking({
        status: BookingStatus.CONFIRMED,
        scheduledAt: new Date(Date.now() + 1 * 60 * 60 * 1000),  // only 1h out
        amountPaise: 110000,
      });
      bookingRepo.findOne.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED });
      eventRepo.create.mockImplementation((_: any, d: any) => d);
      eventRepo.save.mockResolvedValue({});

      const { refundPaise } = await service.cancelBooking(
        'booking-1', 'provider-1', 'provider', 'emergency',
      );

      expect(refundPaise).toBe(110000); // provider always gives full refund
    });
  });
});
