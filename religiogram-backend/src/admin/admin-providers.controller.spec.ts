import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminProvidersController } from './admin-providers.controller';
import { ProviderEntity, ProviderStatus } from '../service-providers/entities/provider.entity';
import { AdminAuditService } from './admin-audit.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const PROV_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockProviderRepo = {
  findAndCount:  jest.fn().mockResolvedValue([[], 0]),
  findOneOrFail: jest.fn().mockResolvedValue({ id: PROV_UUID, status: ProviderStatus.PendingReview }),
  update:        jest.fn().mockResolvedValue(undefined),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminProvidersController', () => {
  let ctrl: AdminProvidersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminProvidersController],
      providers: [
        { provide: getRepositoryToken(ProviderEntity), useValue: mockProviderRepo },
        { provide: AdminAuditService,                  useValue: mockAuditService },
      ],
    }).compile();

    ctrl = module.get<AdminProvidersController>(AdminProvidersController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns paginated shape', async () => {
      mockProviderRepo.findAndCount.mockResolvedValueOnce([[{ id: PROV_UUID }], 1]);
      const result = await ctrl.list(undefined, 1, 20);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
    });

    it('filters by status when provided', async () => {
      mockProviderRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.list(ProviderStatus.PendingReview, 1, 20);
      const [{ where }] = mockProviderRepo.findAndCount.mock.calls[0];
      expect(where).toEqual({ status: ProviderStatus.PendingReview });
    });
  });

  // ── getOne() ──────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to providerRepo.findOneOrFail with id', async () => {
      const result = await ctrl.getOne(PROV_UUID);
      expect(mockProviderRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: PROV_UUID } });
      expect(result).toHaveProperty('id');
    });
  });

  // ── moderate() ────────────────────────────────────────────────────────────

  describe('moderate()', () => {
    it('approves provider and sets approvedAt', async () => {
      const dto = { action: 'approve' as const, reason: undefined, adminId: 'admin-1' };
      const result = await ctrl.moderate(PROV_UUID, dto);
      expect(mockProviderRepo.update).toHaveBeenCalledWith(
        PROV_UUID,
        expect.objectContaining({ status: ProviderStatus.Approved }),
      );
      const [, update] = mockProviderRepo.update.mock.calls[0];
      expect(update).toHaveProperty('approvedAt');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'provider.approve' }),
      );
      expect(result.newStatus).toBe(ProviderStatus.Approved);
    });

    it('rejects provider with reason', async () => {
      const dto = { action: 'reject' as const, reason: 'Fake documents', adminId: 'admin-2' };
      await ctrl.moderate(PROV_UUID, dto);
      const [, update] = mockProviderRepo.update.mock.calls[0];
      expect(update.status).toBe(ProviderStatus.Rejected);
      expect(update.rejectionReason).toBe('Fake documents');
    });

    it('suspends provider', async () => {
      const dto = { action: 'suspend' as const, adminId: 'admin-3' };
      await ctrl.moderate(PROV_UUID, dto);
      const [, update] = mockProviderRepo.update.mock.calls[0];
      expect(update.status).toBe(ProviderStatus.Suspended);
    });

    it('logs audit with actionType provider.{action}', async () => {
      const dto = { action: 'ban' as const, reason: 'Repeated violations', adminId: 'admin-4' };
      await ctrl.moderate(PROV_UUID, dto);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'provider.ban' }),
      );
    });

    it('returns {success:true, providerId, newStatus}', async () => {
      const dto = { action: 'approve' as const, adminId: 'admin-5' };
      const result = await ctrl.moderate(PROV_UUID, dto);
      expect(result).toEqual(
        expect.objectContaining({ success: true, providerId: PROV_UUID }),
      );
    });
  });
});
