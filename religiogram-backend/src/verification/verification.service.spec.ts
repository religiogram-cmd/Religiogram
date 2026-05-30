import { Test, TestingModule } from '@nestjs/testing';
import { VerificationService } from './verification.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VerificationSubmission, VerificationStatus } from './entities/verification-submission.entity';
import { VerificationDocument, DocType } from './entities/verification-document.entity';
import { AdminReviewNote } from './entities/admin-review-note.entity';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const PROVIDER_ID  = 'prov-uuid-001';
const ADMIN_ID     = 'admin-uuid-001';
const SUB_ID       = 'sub-uuid-001';
const MOCK_USER    = { id: PROVIDER_ID, email: 'provider@test.com', name: 'Pandit Ji' };

const makeSubmission = (overrides = {}) => ({
  id:          SUB_ID,
  providerId:  PROVIDER_ID,
  status:      VerificationStatus.DRAFT,
  version:     1,
  documents:   [],
  notes:       [],
  submittedAt: null,
  reviewedAt:  null,
  reviewerId:  null,
  rejectionReason: null,
  ...overrides,
});

const makeSubmissionRepo = () => ({
  create:   jest.fn().mockImplementation((d: any) => d),
  save:     jest.fn().mockImplementation(async (d: any) => d),
  findOne:  jest.fn(),
  find:     jest.fn().mockResolvedValue([]),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
});

const makeDocRepo = () => ({
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockImplementation(async (d: any) => d),
});

const makeNoteRepo = () => ({
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockImplementation(async (d: any) => d),
});

async function buildService(
  submissionRepo: any, docRepo: any, noteRepo: any,
  emailService: any, usersService: any,
): Promise<VerificationService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VerificationService,
      { provide: getRepositoryToken(VerificationSubmission), useValue: submissionRepo },
      { provide: getRepositoryToken(VerificationDocument),   useValue: docRepo },
      { provide: getRepositoryToken(AdminReviewNote),        useValue: noteRepo },
      { provide: EmailService,                               useValue: emailService },
      { provide: UsersService,                               useValue: usersService },
    ],
  }).compile();
  return module.get<VerificationService>(VerificationService);
}

describe('VerificationService', () => {
  let service:         VerificationService;
  let submissionRepo:  ReturnType<typeof makeSubmissionRepo>;
  let docRepo:         ReturnType<typeof makeDocRepo>;
  let noteRepo:        ReturnType<typeof makeNoteRepo>;
  let emailService:    any;
  let usersService:    any;

  beforeEach(async () => {
    submissionRepo = makeSubmissionRepo();
    docRepo        = makeDocRepo();
    noteRepo       = makeNoteRepo();
    emailService   = { sendKycStatus: jest.fn().mockResolvedValue(undefined) };
    usersService   = { findById: jest.fn().mockResolvedValue(MOCK_USER) };
    service        = await buildService(submissionRepo, docRepo, noteRepo, emailService, usersService);
  });

  // ── createSubmission ──────────────────────────────────────────────────────

  describe('createSubmission', () => {
    it('creates a new DRAFT submission', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await service.createSubmission(PROVIDER_ID);
      expect(submissionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: PROVIDER_ID, status: VerificationStatus.DRAFT }),
      );
    });

    it('returns existing DRAFT if one already exists (idempotent)', async () => {
      const existing = makeSubmission();
      submissionRepo.findOne.mockResolvedValue(existing);
      const result = await service.createSubmission(PROVIDER_ID);
      expect(result).toBe(existing);
      expect(submissionRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── submit ────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      const sub = makeSubmission();
      submissionRepo.findOne.mockResolvedValue(sub);
      const result = await service.submit(SUB_ID, PROVIDER_ID);
      expect(result.status).toBe(VerificationStatus.SUBMITTED);
    });

    it('throws ForbiddenException when providerId mismatches', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ providerId: 'other-provider' }));
      await expect(service.submit(SUB_ID, PROVIDER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when already SUBMITTED', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.SUBMITTED }));
      await expect(service.submit(SUB_ID, PROVIDER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── approve ───────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('transitions SUBMITTED → APPROVED', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.SUBMITTED }));
      const result = await service.approve(SUB_ID, ADMIN_ID);
      expect(result.status).toBe(VerificationStatus.APPROVED);
      expect(result.reviewerId).toBe(ADMIN_ID);
    });

    it('fires KYC approval email (fire-and-forget)', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.SUBMITTED }));
      await service.approve(SUB_ID, ADMIN_ID);
      await new Promise(r => setImmediate(r));
      expect(usersService.findById).toHaveBeenCalledWith(PROVIDER_ID);
      expect(emailService.sendKycStatus).toHaveBeenCalledWith(
        MOCK_USER.email,
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('throws BadRequestException when in DRAFT status', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.DRAFT }));
      await expect(service.approve(SUB_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── reject ────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('transitions SUBMITTED → REJECTED with reason', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.SUBMITTED }));
      const result = await service.reject(SUB_ID, ADMIN_ID, 'Blurry ID scan');
      expect(result.status).toBe(VerificationStatus.REJECTED);
      expect(result.rejectionReason).toBe('Blurry ID scan');
    });

    it('fires KYC rejection email with reason', async () => {
      submissionRepo.findOne.mockResolvedValue(makeSubmission({ status: VerificationStatus.SUBMITTED }));
      await service.reject(SUB_ID, ADMIN_ID, 'Blurry ID scan');
      await new Promise(r => setImmediate(r));
      expect(emailService.sendKycStatus).toHaveBeenCalledWith(
        MOCK_USER.email,
        expect.objectContaining({ status: 'rejected', rejectionReason: 'Blurry ID scan' }),
      );
    });
  });

  // ── getSubmission ─────────────────────────────────────────────────────────

  describe('getSubmission', () => {
    it('throws NotFoundException for unknown submission', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      await expect(service.getSubmission('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
