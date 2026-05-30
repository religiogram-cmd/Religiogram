import { Test, TestingModule } from '@nestjs/testing';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFraudService = {
  getSignals:      jest.fn().mockResolvedValue([]),
  getHighRiskUsers: jest.fn().mockResolvedValue([]),
  resolveSignal:   jest.fn().mockResolvedValue({ id: 'sig-1', resolved: true }),
};

function fakeAdmin(id = 'admin-1'): any { return { id, role: 'admin' }; }

const SIG_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FraudController', () => {
  let ctrl: FraudController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FraudController],
      providers: [{ provide: FraudService, useValue: mockFraudService }],
    }).compile();

    ctrl = module.get<FraudController>(FraudController);
  });

  // ── getSignals() ──────────────────────────────────────────────────────────

  describe('getSignals()', () => {
    it('passes userId and undefined resolved when both absent', async () => {
      await ctrl.getSignals(undefined, undefined);
      expect(mockFraudService.getSignals).toHaveBeenCalledWith(undefined, undefined);
    });

    it('parses resolved=true to boolean true', async () => {
      await ctrl.getSignals('user-1', 'true');
      expect(mockFraudService.getSignals).toHaveBeenCalledWith('user-1', true);
    });

    it('parses resolved=false to boolean false', async () => {
      await ctrl.getSignals(undefined, 'false');
      expect(mockFraudService.getSignals).toHaveBeenCalledWith(undefined, false);
    });

    it('passes undefined for unrecognised resolved string', async () => {
      await ctrl.getSignals(undefined, 'maybe');
      expect(mockFraudService.getSignals).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  // ── getHighRiskUsers() ────────────────────────────────────────────────────

  describe('getHighRiskUsers()', () => {
    it('delegates to fraudService.getHighRiskUsers', async () => {
      await ctrl.getHighRiskUsers();
      expect(mockFraudService.getHighRiskUsers).toHaveBeenCalled();
    });
  });

  // ── resolveSignal() ───────────────────────────────────────────────────────

  describe('resolveSignal()', () => {
    it('delegates with id and admin.id', async () => {
      const result = await ctrl.resolveSignal(SIG_UUID, fakeAdmin('admin-7'));
      expect(mockFraudService.resolveSignal).toHaveBeenCalledWith(SIG_UUID, 'admin-7');
      expect(result).toHaveProperty('resolved', true);
    });
  });
});
