import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { AvailabilityService } from './availability.service';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { AvailabilityOverride } from './entities/availability-override.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const PROVIDER_ID = 'prov-1';

function makeSlot(dayOfWeek: number, start: string, end: string): AvailabilitySlot {
  return {
    id: `slot-${dayOfWeek}-${start}`,
    providerId: PROVIDER_ID,
    dayOfWeek,
    startTime: start,
    endTime: end,
    isActive: true,
  } as unknown as AvailabilitySlot;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSlotsRepo = {
  find:   jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockOverridesRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find:    jest.fn().mockResolvedValue([]),
};

// QueryBuilder for checkConflict
const conflictQB: any = {
  select:     jest.fn().mockReturnThis(),
  from:       jest.fn().mockReturnThis(),
  where:      jest.fn().mockReturnThis(),
  andWhere:   jest.fn().mockReturnThis(),
  getRawOne:  jest.fn().mockResolvedValue({ cnt: '0' }),
};

const transactionEm = {
  delete:    jest.fn().mockResolvedValue(undefined),
  create:    jest.fn().mockImplementation((_entity: any, d: any) => d),
  save:      jest.fn().mockImplementation((_entity: any, d: any) => Promise.resolve(d)),
  query:     jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: any) => cb(transactionEm)),
  createQueryBuilder: jest.fn().mockReturnValue(conflictQB),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AvailabilityService', () => {
  let svc: AvailabilityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    conflictQB.getRawOne.mockResolvedValue({ cnt: '0' }); // default: no conflict

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: getRepositoryToken(AvailabilitySlot),    useValue: mockSlotsRepo },
        { provide: getRepositoryToken(AvailabilityOverride), useValue: mockOverridesRepo },
        { provide: getDataSourceToken(),                    useValue: mockDataSource },
      ],
    }).compile();

    svc = module.get<AvailabilityService>(AvailabilityService);
  });

  // ── getAvailableSlots ──────────────────────────────────────────────────────

  describe('getAvailableSlots()', () => {
    it('returns empty slots and isBlocked=true when override blocks the date', async () => {
      mockOverridesRepo.findOne.mockResolvedValueOnce({ isBlocked: true, date: '2025-10-21' });
      const result = await svc.getAvailableSlots(PROVIDER_ID, '2025-10-21');
      expect(result).toEqual({ slots: [], isBlocked: true });
      expect(mockSlotsRepo.find).not.toHaveBeenCalled();
    });

    it('returns 30-min bucket list from weekly slot when date is not blocked', async () => {
      mockOverridesRepo.findOne.mockResolvedValueOnce(null);
      // 2025-10-21 is a Tuesday (dayOfWeek = 2)
      mockSlotsRepo.find.mockResolvedValueOnce([makeSlot(2, '09:00', '10:00')]);

      const result = await svc.getAvailableSlots(PROVIDER_ID, '2025-10-21');
      expect(result.isBlocked).toBe(false);
      expect(result.slots).toEqual(['09:00', '09:30']); // two 30-min buckets in 1h window
    });

    it('returns empty slots when no weekly schedule exists for that day', async () => {
      mockOverridesRepo.findOne.mockResolvedValueOnce(null);
      mockSlotsRepo.find.mockResolvedValueOnce([]); // no slots for this day

      const result = await svc.getAvailableSlots(PROVIDER_ID, '2025-10-21');
      expect(result.slots).toHaveLength(0);
      expect(result.isBlocked).toBe(false);
    });

    it('generates multiple buckets across a 2-hour window', async () => {
      mockOverridesRepo.findOne.mockResolvedValueOnce(null);
      mockSlotsRepo.find.mockResolvedValueOnce([makeSlot(2, '10:00', '12:00')]);

      const result = await svc.getAvailableSlots(PROVIDER_ID, '2025-10-21');
      expect(result.slots).toEqual(['10:00', '10:30', '11:00', '11:30']);
    });
  });

  // ── checkConflict ──────────────────────────────────────────────────────────

  describe('checkConflict()', () => {
    it('returns false when no conflicting bookings exist', async () => {
      conflictQB.getRawOne.mockResolvedValueOnce({ cnt: '0' });
      const conflict = await svc.checkConflict(PROVIDER_ID, new Date(), 60);
      expect(conflict).toBe(false);
    });

    it('returns true when a conflicting booking exists', async () => {
      conflictQB.getRawOne.mockResolvedValueOnce({ cnt: '1' });
      const conflict = await svc.checkConflict(PROVIDER_ID, new Date(), 60);
      expect(conflict).toBe(true);
    });

    it('builds correct query with providerId and time window', async () => {
      conflictQB.getRawOne.mockResolvedValueOnce({ cnt: '0' });
      const at = new Date('2025-10-21T10:00:00Z');
      await svc.checkConflict(PROVIDER_ID, at, 90);

      expect(conflictQB.where).toHaveBeenCalledWith(
        'b.provider_id = :providerId',
        { providerId: PROVIDER_ID },
      );
      expect(conflictQB.andWhere).toHaveBeenCalledWith(
        'b.scheduled_at < :slotEnd',
        expect.objectContaining({ slotEnd: expect.any(Date) }),
      );
    });
  });

  // ── setWeeklySlots ─────────────────────────────────────────────────────────

  describe('setWeeklySlots()', () => {
    it('deletes existing slots and inserts new ones atomically', async () => {
      const slots = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '10:00', endTime: '14:00' },
      ];

      transactionEm.save.mockResolvedValueOnce(slots);
      await svc.setWeeklySlots(PROVIDER_ID, slots);

      expect(transactionEm.delete).toHaveBeenCalledWith(
        AvailabilitySlot, { providerId: PROVIDER_ID },
      );
      expect(transactionEm.create).toHaveBeenCalledTimes(2);
      expect(transactionEm.save).toHaveBeenCalledWith(
        AvailabilitySlot, expect.any(Array),
      );
    });
  });

  // ── addOverride ────────────────────────────────────────────────────────────

  describe('addOverride()', () => {
    it('acquires advisory lock and upserts override', async () => {
      transactionEm.save.mockResolvedValueOnce({
        id: 'ov-1', providerId: PROVIDER_ID, date: '2025-10-31', isBlocked: true,
      });

      const result = await svc.addOverride(PROVIDER_ID, '2025-10-31', true, 'Diwali holiday');

      // Advisory lock called first
      expect(transactionEm.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`${PROVIDER_ID}:2025-10-31`],
      );
      expect(transactionEm.delete).toHaveBeenCalledWith(
        AvailabilityOverride, { providerId: PROVIDER_ID, date: '2025-10-31' },
      );
      expect(result.isBlocked).toBe(true);
    });
  });

  // ── getMySchedule ──────────────────────────────────────────────────────────

  describe('getMySchedule()', () => {
    it('returns both slots and overrides for the provider', async () => {
      mockSlotsRepo.find.mockResolvedValueOnce([makeSlot(1, '09:00', '17:00')]);
      mockOverridesRepo.find.mockResolvedValueOnce([
        { id: 'ov-1', date: '2025-10-31', isBlocked: true },
      ]);

      const schedule = await svc.getMySchedule(PROVIDER_ID);
      expect(schedule.slots).toHaveLength(1);
      expect(schedule.overrides).toHaveLength(1);
    });
  });
});
