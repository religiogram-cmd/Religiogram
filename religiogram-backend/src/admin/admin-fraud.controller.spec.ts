import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminFraudController } from './admin-fraud.controller';
import { FraudSignal } from '../fraud/entities/fraud-signal.entity';
import { AdminAuditService } from './admin-audit.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFraudRepo = {
  findAndCount:  jest.fn().mockResolvedValue([[], 0]),
  findOneOrFail: jest.fn().mockResolvedValue({ id: 'sig-1', isResolved: false }),
  update:        jest.fn().mockResolvedValue(undefined),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const SIG_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminFraudController', () => {
  let ctrl: AdminFraudController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminFraudController],
      providers: [
        { provide: getRepositoryToken(FraudSignal), useValue: mockFraudRepo },
        { provide: AdminAuditService,               useValue: mockAuditService },
      ],
    }).compile();

    ctrl = module.get<AdminFraudController>(AdminFraudController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns paginated result', async () => {
      mockFraudRepo.findAndCount.mockResolvedValueOnce([[{ id: SIG_UUID }], 1]);
      const result = await ctrl.list(undefined, 1, 20);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
    });

    it('filters isResolved=true when resolved="true"', async () => {
      mockFraudRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list('true', 1, 20);
      const [{ where }] = mockFraudRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ isResolved: true });
    });

    it('filters isResolved=false when resolved="false"', async () => {
      mockFraudRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list('false', 1, 20);
      const [{ where }] = mockFraudRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ isResolved: false });
    });

    it('uses empty where when resolved absent', async () => {
      mockFraudRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list(undefined, 1, 20);
      const [{ where }] = mockFraudRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({});
    });
  });

  // ── getOne() ──────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to fraudRepo.findOneOrFail with id', async () => {
      const result = await ctrl.getOne(SIG_UUID);
      expect(mockFraudRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: SIG_UUID } });
      expect(result).toHaveProperty('id');
    });
  });

  // ── override() ────────────────────────────────────────────────────────────

  describe('override()', () => {
    it('marks signal as resolved and logs audit for false_positive', async () => {
      const dto = { adminId: 'admin-1', verdict: 'false_positive' as const, overrideNote: 'Not fraud' };
      const result = await ctrl.override(SIG_UUID, dto);
      expect(mockFraudRepo.update).toHaveBeenCalledWith(
        SIG_UUID,
        expect.objectContaining({ isResolved: true, resolvedById: 'admin-1' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'fraud.override.false_positive' }),
      );
      expect(result).toEqual({ success: true, signalId: SIG_UUID, verdict: 'false_positive' });
    });

    it('logs confirmed verdict in audit actionType', async () => {
      const dto = { adminId: 'admin-2', verdict: 'confirmed' as const, overrideNote: 'Confirmed fraud' };
      await ctrl.override(SIG_UUID, dto);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'fraud.override.confirmed' }),
      );
    });
  });
});
