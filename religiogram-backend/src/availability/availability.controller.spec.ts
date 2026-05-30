import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAvailabilityService = {
  setWeeklySlots:    jest.fn().mockResolvedValue({ saved: 3 }),
  addOverride:       jest.fn().mockResolvedValue({ id: 'ov-1' }),
  getMySchedule:     jest.fn().mockResolvedValue({ slots: [], overrides: [] }),
  getAvailableSlots: jest.fn().mockResolvedValue([
    { start: '10:00', end: '10:30', available: true },
  ]),
};

/** Simulate req.user as set by JwtAuthGuard */
function fakeReq(userId = 'user-1', providerId?: string): any {
  return { user: { id: userId, providerId } };
}

const PROVIDER_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AvailabilityController', () => {
  let ctrl: AvailabilityController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [{ provide: AvailabilityService, useValue: mockAvailabilityService }],
    }).compile();

    ctrl = module.get<AvailabilityController>(AvailabilityController);
  });

  // ── setWeeklySlots() ───────────────────────────────────────────────────────

  describe('setWeeklySlots()', () => {
    it('uses providerId from req.user when present', async () => {
      const slots = [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }];
      const dto = { slots };
      await ctrl.setWeeklySlots(fakeReq('user-1', 'prov-99'), dto as any);
      expect(mockAvailabilityService.setWeeklySlots).toHaveBeenCalledWith('prov-99', slots);
    });

    it('falls back to user.id when providerId is absent', async () => {
      const slots = [{ dayOfWeek: 2, startTime: '10:00', endTime: '18:00' }];
      await ctrl.setWeeklySlots(fakeReq('user-1'), { slots } as any);
      expect(mockAvailabilityService.setWeeklySlots).toHaveBeenCalledWith('user-1', slots);
    });
  });

  // ── addOverride() ──────────────────────────────────────────────────────────

  describe('addOverride()', () => {
    it('uses providerId from req.user when present', async () => {
      const dto = { date: '2025-12-25', isBlocked: true, reason: 'Holiday' };
      await ctrl.addOverride(fakeReq('user-1', 'prov-99'), dto as any);
      expect(mockAvailabilityService.addOverride).toHaveBeenCalledWith(
        'prov-99', '2025-12-25', true, 'Holiday',
      );
    });

    it('falls back to user.id when providerId is absent', async () => {
      const dto = { date: '2025-12-25', isBlocked: false, reason: undefined };
      await ctrl.addOverride(fakeReq('user-1'), dto as any);
      expect(mockAvailabilityService.addOverride).toHaveBeenCalledWith(
        'user-1', '2025-12-25', false, undefined,
      );
    });
  });

  // ── getMySchedule() ────────────────────────────────────────────────────────

  describe('getMySchedule()', () => {
    it('delegates to availabilityService.getMySchedule with provider id', async () => {
      await ctrl.getMySchedule(fakeReq('user-1', 'prov-5'));
      expect(mockAvailabilityService.getMySchedule).toHaveBeenCalledWith('prov-5');
    });
  });

  // ── getAvailableSlots() ────────────────────────────────────────────────────

  describe('getAvailableSlots()', () => {
    it('delegates with providerId and date', async () => {
      const result = await ctrl.getAvailableSlots(PROVIDER_UUID, '2025-06-01');
      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith(
        PROVIDER_UUID, '2025-06-01',
      );
      expect(result).toHaveLength(1);
    });
  });
});
