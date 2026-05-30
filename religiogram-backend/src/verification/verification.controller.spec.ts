import { Test, TestingModule } from '@nestjs/testing';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockVerificationService = {
  createSubmission: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'draft' }),
  addDocument:      jest.fn().mockResolvedValue({ id: 'doc-1' }),
  submit:           jest.fn().mockResolvedValue({ id: 'sub-1', status: 'pending' }),
  getByProvider:    jest.fn().mockResolvedValue([]),
  getPendingQueue:  jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getSubmission:    jest.fn().mockResolvedValue({ id: 'sub-1' }),
  approve:          jest.fn().mockResolvedValue({ id: 'sub-1', status: 'approved' }),
  reject:           jest.fn().mockResolvedValue({ id: 'sub-1', status: 'rejected' }),
  requestMoreInfo:  jest.fn().mockResolvedValue({ id: 'sub-1', status: 'more_info' }),
};

function fakeUser(id = 'user-1', role = 'advisor'): any { return { id, role }; }

const SUB_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('VerificationController', () => {
  let ctrl: VerificationController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerificationController],
      providers: [{ provide: VerificationService, useValue: mockVerificationService }],
    }).compile();

    ctrl = module.get<VerificationController>(VerificationController);
  });

  // ── createSubmission() ─────────────────────────────────────────────────────

  describe('createSubmission()', () => {
    it('delegates to verificationService.createSubmission with userId', async () => {
      const result = await ctrl.createSubmission(fakeUser());
      expect(mockVerificationService.createSubmission).toHaveBeenCalledWith('user-1');
      expect(result.status).toBe('draft');
    });
  });

  // ── addDocument() ──────────────────────────────────────────────────────────

  describe('addDocument()', () => {
    it('delegates to verificationService.addDocument with submission id and doc fields', async () => {
      const dto: any = {
        type: 'aadhaar',
        s3Key: 'kyc/user-1/aadhaar.pdf',
        s3Bucket: 'religiogram-kyc',
        contentHash: 'abc123',
      };
      await ctrl.addDocument(SUB_UUID, dto);
      expect(mockVerificationService.addDocument).toHaveBeenCalledWith(
        SUB_UUID, 'aadhaar', 'kyc/user-1/aadhaar.pdf', 'religiogram-kyc', 'abc123',
      );
    });
  });

  // ── submit() ───────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('delegates to verificationService.submit with submissionId and userId', async () => {
      const result = await ctrl.submit(SUB_UUID, fakeUser());
      expect(mockVerificationService.submit).toHaveBeenCalledWith(SUB_UUID, 'user-1');
      expect(result.status).toBe('pending');
    });
  });

  // ── getMySubmissions() ─────────────────────────────────────────────────────

  describe('getMySubmissions()', () => {
    it('delegates to verificationService.getByProvider with userId', async () => {
      await ctrl.getMySubmissions(fakeUser());
      expect(mockVerificationService.getByProvider).toHaveBeenCalledWith('user-1');
    });
  });

  // ── getPendingQueue() ──────────────────────────────────────────────────────

  describe('getPendingQueue()', () => {
    it('delegates with page and limit', async () => {
      await ctrl.getPendingQueue(2, 10);
      expect(mockVerificationService.getPendingQueue).toHaveBeenCalledWith(2, 10);
    });
  });

  // ── getSubmission() ────────────────────────────────────────────────────────

  describe('getSubmission()', () => {
    it('delegates to verificationService.getSubmission with id', async () => {
      const result = await ctrl.getSubmission(SUB_UUID);
      expect(mockVerificationService.getSubmission).toHaveBeenCalledWith(SUB_UUID);
      expect(result.id).toBe('sub-1');
    });
  });

  // ── approve() ──────────────────────────────────────────────────────────────

  describe('approve()', () => {
    it('delegates to verificationService.approve with submissionId and adminId', async () => {
      const result = await ctrl.approve(SUB_UUID, fakeUser('admin-1', 'admin'));
      expect(mockVerificationService.approve).toHaveBeenCalledWith(SUB_UUID, 'admin-1');
      expect(result.status).toBe('approved');
    });
  });

  // ── reject() ───────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('delegates to verificationService.reject with submissionId, adminId, reason', async () => {
      const dto: any = { reason: 'Document unclear' };
      await ctrl.reject(SUB_UUID, fakeUser('admin-1', 'admin'), dto);
      expect(mockVerificationService.reject).toHaveBeenCalledWith(
        SUB_UUID, 'admin-1', 'Document unclear',
      );
    });
  });

  // ── requestMoreInfo() ──────────────────────────────────────────────────────

  describe('requestMoreInfo()', () => {
    it('delegates to verificationService.requestMoreInfo with submissionId, adminId, note', async () => {
      const dto: any = { note: 'Please upload front + back scan' };
      await ctrl.requestMoreInfo(SUB_UUID, fakeUser('admin-1', 'admin'), dto);
      expect(mockVerificationService.requestMoreInfo).toHaveBeenCalledWith(
        SUB_UUID, 'admin-1', 'Please upload front + back scan',
      );
    });
  });
});
