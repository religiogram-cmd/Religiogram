import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminDisputesController } from './admin-disputes.controller';
import { Dispute, DisputeStatus } from '../dispute/entities/dispute.entity';
import { AdminAuditService } from './admin-audit.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDisputeRepo = {
  findAndCount:  jest.fn().mockResolvedValue([[], 0]),
  findOneOrFail: jest.fn().mockResolvedValue({ id: 'disp-1', status: DisputeStatus.RAISED }),
  update:        jest.fn().mockResolvedValue(undefined),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const DISP_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminDisputesController', () => {
  let ctrl: AdminDisputesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDisputesController],
      providers: [
        { provide: getRepositoryToken(Dispute), useValue: mockDisputeRepo },
        { provide: AdminAuditService,           useValue: mockAuditService },
      ],
    }).compile();

    ctrl = module.get<AdminDisputesController>(AdminDisputesController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns paginated shape', async () => {
      mockDisputeRepo.findAndCount.mockResolvedValueOnce([[{ id: DISP_UUID }], 1]);
      const result = await ctrl.list(undefined, 1, 20);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
    });

    it('filters by status when provided', async () => {
      mockDisputeRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list(DisputeStatus.RAISED, 1, 20);
      const [{ where }] = mockDisputeRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ status: DisputeStatus.RAISED });
    });

    it('uses empty where clause when no status', async () => {
      mockDisputeRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list(undefined, 1, 20);
      const [{ where }] = mockDisputeRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({});
    });
  });

  // ── getOne() ──────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to disputeRepo.findOneOrFail with id', async () => {
      const result = await ctrl.getOne(DISP_UUID);
      expect(mockDisputeRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: DISP_UUID } });
      expect(result).toHaveProperty('id');
    });
  });

  // ── assign() ──────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('updates dispute status and logs audit', async () => {
      const dto = { adminId: 'admin-1', assigneeId: 'admin-2' };
      const result = await ctrl.assign(DISP_UUID, dto);
      expect(mockDisputeRepo.update).toHaveBeenCalledWith(
        DISP_UUID,
        expect.objectContaining({ status: DisputeStatus.UNDER_INVESTIGATION }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'dispute.assign', targetId: DISP_UUID }),
      );
      expect(result).toEqual({ success: true, disputeId: DISP_UUID, assignedTo: 'admin-2' });
    });
  });

  // ── resolve() ─────────────────────────────────────────────────────────────

  describe('resolve()', () => {
    it('maps "resolved_for_user" to RESOLVED_FOR_USER status', async () => {
      const dto = {
        adminId: 'admin-1',
        resolution: 'resolved_for_user' as const,
        resolutionNote: 'Refund issued',
        refundAmountPaise: 50000,
      };
      const result = await ctrl.resolve(DISP_UUID, dto);
      expect(mockDisputeRepo.update).toHaveBeenCalledWith(
        DISP_UUID,
        expect.objectContaining({ status: DisputeStatus.RESOLVED_FOR_USER }),
      );
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(result.resolution).toBe('resolved_for_user');
    });

    it('maps "closed" to CLOSED status', async () => {
      const dto = {
        adminId: 'admin-1',
        resolution: 'closed' as const,
        resolutionNote: 'No merit',
      };
      await ctrl.resolve(DISP_UUID, dto);
      const [, update] = mockDisputeRepo.update.mock.calls[0];
      expect(update.status).toBe(DisputeStatus.CLOSED);
    });

    it('defaults refundAmountPaise to 0 when absent', async () => {
      const dto = {
        adminId: 'admin-1',
        resolution: 'resolved_for_provider' as const,
        resolutionNote: 'Provider was correct',
      };
      await ctrl.resolve(DISP_UUID, dto);
      const [, update] = mockDisputeRepo.update.mock.calls[0];
      expect(update.refundAmountPaise).toBe(0);
    });
  });

  // ── escalate() ────────────────────────────────────────────────────────────

  describe('escalate()', () => {
    it('updates to ESCALATED and logs audit', async () => {
      const dto = { adminId: 'admin-1', escalationNote: 'Needs senior review' };
      const result = await ctrl.escalate(DISP_UUID, dto);
      expect(mockDisputeRepo.update).toHaveBeenCalledWith(
        DISP_UUID,
        expect.objectContaining({ status: DisputeStatus.ESCALATED }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'dispute.escalate' }),
      );
      expect(result).toEqual({ success: true, disputeId: DISP_UUID });
    });
  });
});
