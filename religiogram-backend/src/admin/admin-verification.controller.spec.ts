import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminVerificationController } from './admin-verification.controller';
import { VerificationReviewQueue, QueueStatus } from '../verification/entities/verification-review-queue.entity';
import { VerificationSubmission } from '../verification/entities/verification-submission.entity';
import { AdminAuditService } from './admin-audit.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const QUEUE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockQueueRepo = {
  findAndCount:  jest.fn().mockResolvedValue([[], 0]),
  findOneOrFail: jest.fn().mockResolvedValue({ id: QUEUE_UUID, providerId: 'prov-1', queueStatus: QueueStatus.PENDING }),
  update:        jest.fn().mockResolvedValue(undefined),
};

const mockSubmissionRepo = {
  find: jest.fn().mockResolvedValue([]),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminVerificationController', () => {
  let ctrl: AdminVerificationController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminVerificationController],
      providers: [
        { provide: getRepositoryToken(VerificationReviewQueue),  useValue: mockQueueRepo },
        { provide: getRepositoryToken(VerificationSubmission),   useValue: mockSubmissionRepo },
        { provide: AdminAuditService,                            useValue: mockAuditService },
      ],
    }).compile();

    ctrl = module.get<AdminVerificationController>(AdminVerificationController);
  });

  // ── listQueue() ───────────────────────────────────────────────────────────

  describe('listQueue()', () => {
    it('defaults to PENDING status when none provided', async () => {
      mockQueueRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.listQueue(undefined, 1, 20);
      const [{ where }] = mockQueueRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ queueStatus: QueueStatus.PENDING });
    });

    it('filters by provided status', async () => {
      mockQueueRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.listQueue(QueueStatus.IN_REVIEW, 1, 20);
      const [{ where }] = mockQueueRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ queueStatus: QueueStatus.IN_REVIEW });
    });

    it('returns paginated shape', async () => {
      mockQueueRepo.findAndCount.mockResolvedValueOnce([[{ id: QUEUE_UUID }], 1]);
      const result = await ctrl.listQueue(undefined, 1, 20);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
    });
  });

  // ── getQueueItem() ────────────────────────────────────────────────────────

  describe('getQueueItem()', () => {
    it('returns item and submissions for providerId', async () => {
      const submissions = [{ id: 'sub-1' }];
      mockSubmissionRepo.find.mockResolvedValueOnce(submissions);

      const result = await ctrl.getQueueItem(QUEUE_UUID);
      expect(mockQueueRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: QUEUE_UUID } });
      expect(mockSubmissionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerId: 'prov-1' } }),
      );
      expect(result).toHaveProperty('item');
      expect(result).toHaveProperty('submissions');
    });
  });

  // ── assignReviewer() ──────────────────────────────────────────────────────

  describe('assignReviewer()', () => {
    it('updates status to IN_REVIEW and logs audit', async () => {
      const dto = { adminId: 'admin-1', reviewerId: 'admin-2' };
      const result = await ctrl.assignReviewer(QUEUE_UUID, dto);
      expect(mockQueueRepo.update).toHaveBeenCalledWith(
        QUEUE_UUID,
        expect.objectContaining({ queueStatus: QueueStatus.IN_REVIEW, assignedAdminId: 'admin-2' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'verification.assign' }),
      );
      expect(result).toEqual({ success: true, queueId: QUEUE_UUID });
    });
  });

  // ── approve() ─────────────────────────────────────────────────────────────

  describe('approve()', () => {
    it('updates status to APPROVED and logs audit', async () => {
      const dto = { adminId: 'admin-1', reviewNote: 'Documents verified' };
      const result = await ctrl.approve(QUEUE_UUID, dto);
      expect(mockQueueRepo.update).toHaveBeenCalledWith(
        QUEUE_UUID,
        expect.objectContaining({ queueStatus: QueueStatus.APPROVED }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'verification.approve' }),
      );
      expect(result).toEqual({ success: true, queueId: QUEUE_UUID });
    });

    it('passes null note when reviewNote absent', async () => {
      const dto = { adminId: 'admin-1' };
      await ctrl.approve(QUEUE_UUID, dto);
      const [, update] = mockQueueRepo.update.mock.calls[0];
      expect(update.notes).toBeNull();
    });
  });

  // ── reject() ──────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('updates status to REJECTED with reason and logs audit', async () => {
      const dto = { adminId: 'admin-1', reason: 'Document unclear' };
      const result = await ctrl.reject(QUEUE_UUID, dto);
      expect(mockQueueRepo.update).toHaveBeenCalledWith(
        QUEUE_UUID,
        expect.objectContaining({ queueStatus: QueueStatus.REJECTED, notes: 'Document unclear' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'verification.reject' }),
      );
      expect(result).toEqual({ success: true, queueId: QUEUE_UUID });
    });
  });
});
