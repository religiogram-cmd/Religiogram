import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingStatus } from './entities/booking.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockBookingsService = {
  createBooking:       jest.fn().mockResolvedValue({ id: 'booking-1', status: 'pending' }),
  getMyBookings:       jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  getProviderBookings: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  getBookingById:      jest.fn().mockResolvedValue({ id: 'booking-1' }),
  updateBooking:       jest.fn().mockResolvedValue({ id: 'booking-1', status: 'cancelled' }),
  cancelBooking:       jest.fn().mockResolvedValue({ success: true }),
  startBooking:        jest.fn().mockResolvedValue({ id: 'booking-1', status: 'in_progress' }),
  completeBooking:     jest.fn().mockResolvedValue({ id: 'booking-1', status: 'completed' }),
};

const seekerUser  = { id: 'user-1', role: 'seeker' };
const advisorUser = { id: 'user-2', role: 'advisor' };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('BookingsController', () => {
  let ctrl: BookingsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: mockBookingsService },
      ],
    }).compile();

    ctrl = module.get<BookingsController>(BookingsController);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('delegates to bookingsService.createBooking with dto and user', async () => {
      const dto = { providerId: 'prov-1', serviceId: 'svc-1', scheduledAt: '2025-01-01T10:00:00Z' };
      const result = await ctrl.create(dto as any, seekerUser as any);
      expect(mockBookingsService.createBooking).toHaveBeenCalledWith(dto, seekerUser);
      expect(result.status).toBe('pending');
    });
  });

  // ── getMyBookings ──────────────────────────────────────────────────────────

  describe('getMyBookings()', () => {
    it('delegates to bookingsService.getMyBookings with userId, cursor, limit, status', async () => {
      const result = await ctrl.getMyBookings(seekerUser as any, 'cursor-abc', 10, BookingStatus.CONFIRMED);
      expect(mockBookingsService.getMyBookings).toHaveBeenCalledWith(
        'user-1', 'cursor-abc', 10, BookingStatus.CONFIRMED,
      );
      expect(result).toHaveProperty('data');
    });

    it('passes undefined cursor and status when omitted', async () => {
      await ctrl.getMyBookings(seekerUser as any, undefined, 20, undefined);
      expect(mockBookingsService.getMyBookings).toHaveBeenCalledWith(
        'user-1', undefined, 20, undefined,
      );
    });
  });

  // ── getProviderBookings ────────────────────────────────────────────────────

  describe('getProviderBookings()', () => {
    it('delegates to bookingsService.getProviderBookings', async () => {
      const result = await ctrl.getProviderBookings(advisorUser as any, undefined, 20, undefined);
      expect(mockBookingsService.getProviderBookings).toHaveBeenCalledWith(
        'user-2', undefined, 20, undefined,
      );
      expect(result).toHaveProperty('data');
    });
  });

  // ── getOne ─────────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to bookingsService.getBookingById with id and user', async () => {
      const result = await ctrl.getOne('booking-1', seekerUser as any);
      expect(mockBookingsService.getBookingById).toHaveBeenCalledWith('booking-1', seekerUser);
      expect(result.id).toBe('booking-1');
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('delegates to bookingsService.updateBooking with id, dto, user', async () => {
      const dto = { status: 'cancelled' };
      const result = await ctrl.updateStatus('booking-1', dto as any, seekerUser as any);
      expect(mockBookingsService.updateBooking).toHaveBeenCalledWith('booking-1', dto, seekerUser);
      expect(result.status).toBe('cancelled');
    });
  });

  // ── cancelBooking ──────────────────────────────────────────────────────────

  describe('cancelBooking()', () => {
    it('delegates to bookingsService.cancelBooking with id, userId, role, reason', async () => {
      const dto = { reason: 'changed_mind' };
      await ctrl.cancelBooking('booking-1', dto as any, seekerUser as any);
      expect(mockBookingsService.cancelBooking).toHaveBeenCalledWith(
        'booking-1', 'user-1', 'seeker', 'changed_mind',
      );
    });

    it('uses "user_request" as default reason when reason is omitted', async () => {
      await ctrl.cancelBooking('booking-1', {} as any, seekerUser as any);
      expect(mockBookingsService.cancelBooking).toHaveBeenCalledWith(
        'booking-1', 'user-1', 'seeker', 'user_request',
      );
    });
  });

  // ── startBooking ───────────────────────────────────────────────────────────

  describe('startBooking()', () => {
    it('delegates with GPS coordinates when provided', async () => {
      const result = await ctrl.startBooking(
        'booking-1', { lat: 25.31, lng: 83.01 }, advisorUser as any,
      );
      expect(mockBookingsService.startBooking).toHaveBeenCalledWith(
        'booking-1', advisorUser, 25.31, 83.01,
      );
      expect(result.status).toBe('in_progress');
    });

    it('passes undefined coords when GPS not provided', async () => {
      await ctrl.startBooking('booking-1', {}, advisorUser as any);
      expect(mockBookingsService.startBooking).toHaveBeenCalledWith(
        'booking-1', advisorUser, undefined, undefined,
      );
    });
  });

  // ── completeBooking ────────────────────────────────────────────────────────

  describe('completeBooking()', () => {
    it('delegates to bookingsService.completeBooking with id and userId', async () => {
      const result = await ctrl.completeBooking('booking-1', advisorUser as any);
      expect(mockBookingsService.completeBooking).toHaveBeenCalledWith('booking-1', 'user-2');
      expect(result.status).toBe('completed');
    });
  });
});
