import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlaceClaimsController } from './admin-place-claims.controller';
import { PlaceClaimsService } from './place-claims.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPlaceClaimsService = {
  listForAdmin: jest.fn().mockResolvedValue([]),
  approve:      jest.fn().mockResolvedValue({ id: 'claim-1', status: 'approved' }),
  reject:       jest.fn().mockResolvedValue({ id: 'claim-1', status: 'rejected' }),
  setOwner:     jest.fn().mockResolvedValue(undefined),
};

function fakeAdmin(id = 'admin-1'): any { return { id, role: 'admin' }; }

const CLAIM_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PLACE_UUID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const OWNER_UUID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminPlaceClaimsController', () => {
  let ctrl: AdminPlaceClaimsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPlaceClaimsController],
      providers: [{ provide: PlaceClaimsService, useValue: mockPlaceClaimsService }],
    }).compile();

    ctrl = module.get<AdminPlaceClaimsController>(AdminPlaceClaimsController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('defaults to "pending" when status absent', async () => {
      await ctrl.list(undefined);
      expect(mockPlaceClaimsService.listForAdmin).toHaveBeenCalledWith('pending');
    });

    it('passes valid status through', async () => {
      await ctrl.list('approved');
      expect(mockPlaceClaimsService.listForAdmin).toHaveBeenCalledWith('approved');
    });

    it('falls back to "pending" for invalid status', async () => {
      await ctrl.list('unknown_status' as any);
      expect(mockPlaceClaimsService.listForAdmin).toHaveBeenCalledWith('pending');
    });

    it('accepts all valid ClaimStatus values', async () => {
      for (const status of ['pending', 'approved', 'rejected', 'withdrawn']) {
        await ctrl.list(status as any);
        expect(mockPlaceClaimsService.listForAdmin).toHaveBeenCalledWith(status);
        mockPlaceClaimsService.listForAdmin.mockClear();
      }
    });
  });

  // ── approve() ─────────────────────────────────────────────────────────────

  describe('approve()', () => {
    it('delegates to claimsService.approve with claimId, adminId, dto', async () => {
      const dto: any = { note: 'Documents verified' };
      const result = await ctrl.approve(CLAIM_UUID, dto, fakeAdmin('admin-2'));
      expect(mockPlaceClaimsService.approve).toHaveBeenCalledWith(CLAIM_UUID, 'admin-2', dto);
      expect(result).toHaveProperty('status', 'approved');
    });
  });

  // ── reject() ──────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('delegates to claimsService.reject with claimId, adminId, dto', async () => {
      const dto: any = { note: 'Insufficient evidence' };
      const result = await ctrl.reject(CLAIM_UUID, dto, fakeAdmin('admin-3'));
      expect(mockPlaceClaimsService.reject).toHaveBeenCalledWith(CLAIM_UUID, 'admin-3', dto);
      expect(result).toHaveProperty('status', 'rejected');
    });
  });

  // ── transferOwner() ───────────────────────────────────────────────────────

  describe('transferOwner()', () => {
    it('delegates to claimsService.setOwner and returns success shape', async () => {
      const result = await ctrl.transferOwner(PLACE_UUID, { userId: OWNER_UUID });
      expect(mockPlaceClaimsService.setOwner).toHaveBeenCalledWith(PLACE_UUID, OWNER_UUID);
      expect(result).toEqual({ success: true, placeId: PLACE_UUID, ownerId: OWNER_UUID });
    });

    it('passes null userId to setOwner when not provided', async () => {
      const result = await ctrl.transferOwner(PLACE_UUID, {});
      expect(mockPlaceClaimsService.setOwner).toHaveBeenCalledWith(PLACE_UUID, null);
      expect(result.ownerId).toBeNull();
    });
  });
});
