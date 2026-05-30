import { Test, TestingModule } from '@nestjs/testing';
import { ProvidersController } from './providers.controller';
import { ProviderOnboardingService } from './service-providers.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockOnboardingService = {
  saveStep1:          jest.fn().mockResolvedValue({ step: 1 }),
  saveStep2:          jest.fn().mockResolvedValue({ step: 2 }),
  saveStep3:          jest.fn().mockResolvedValue({ step: 3 }),
  saveStep4:          jest.fn().mockResolvedValue({ step: 4 }),
  saveStep5:          jest.fn().mockResolvedValue({ step: 5 }),
  saveStep6:          jest.fn().mockResolvedValue({ step: 6 }),
  presignKycUpload:   jest.fn().mockResolvedValue({ url: 'https://s3.example.com/presign' }),
  submitKyc:          jest.fn().mockResolvedValue({ submitted: true }),
  getDraft:           jest.fn().mockResolvedValue({ draft: {} }),
  saveDraft:          jest.fn().mockResolvedValue({ saved: true }),
  setOnlineStatus:    jest.fn().mockResolvedValue({ isOnline: true }),
};

function fakeReq(sub = 'user-1', phone = '+911234567890'): any {
  return { user: { sub, phone } };
}

function fakeReqNoSub(): any {
  return { user: {} };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ProvidersController', () => {
  let ctrl: ProvidersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvidersController],
      providers: [
        { provide: ProviderOnboardingService, useValue: mockOnboardingService },
      ],
    }).compile();

    ctrl = module.get<ProvidersController>(ProvidersController);
  });

  // ── registerStep1() ───────────────────────────────────────────────────────

  describe('registerStep1()', () => {
    it('delegates with userId, phone, dto from who(req)', async () => {
      const dto: any = { fullName: 'Ramesh Kumar' };
      await ctrl.registerStep1(fakeReq('u-1', '+911111111111'), dto);
      expect(mockOnboardingService.saveStep1).toHaveBeenCalledWith('u-1', '+911111111111', dto);
    });

    it('throws when req.user.sub absent', async () => {
      await expect(
        ctrl.registerStep1(fakeReqNoSub(), {} as any),
      ).rejects.toThrow('Missing auth context');
    });

    it('uses empty string for phone when absent from JWT', async () => {
      const dto: any = {};
      await ctrl.registerStep1({ user: { sub: 'u-2' } } as any, dto);
      expect(mockOnboardingService.saveStep1).toHaveBeenCalledWith('u-2', '', dto);
    });
  });

  // ── saveProfessional() ────────────────────────────────────────────────────

  describe('saveProfessional()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { experienceYears: 5 };
      await ctrl.saveProfessional(fakeReq('u-3'), dto);
      expect(mockOnboardingService.saveStep2).toHaveBeenCalledWith('u-3', dto);
    });
  });

  // ── setReligion() ─────────────────────────────────────────────────────────

  describe('setReligion()', () => {
    it('delegates with userId and dto.religion', async () => {
      const dto: any = { religion: 'hindu' };
      await ctrl.setReligion(fakeReq('u-4'), dto);
      expect(mockOnboardingService.saveStep3).toHaveBeenCalledWith('u-4', 'hindu');
    });
  });

  // ── selectServices() ──────────────────────────────────────────────────────

  describe('selectServices()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { serviceIds: ['svc-1'] };
      await ctrl.selectServices(fakeReq('u-5'), dto);
      expect(mockOnboardingService.saveStep4).toHaveBeenCalledWith('u-5', dto);
    });
  });

  // ── savePricing() ─────────────────────────────────────────────────────────

  describe('savePricing()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { basePricePaise: 50000 };
      await ctrl.savePricing(fakeReq('u-6'), dto);
      expect(mockOnboardingService.saveStep5).toHaveBeenCalledWith('u-6', dto);
    });
  });

  // ── saveAvailability() ────────────────────────────────────────────────────

  describe('saveAvailability()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { slots: [] };
      await ctrl.saveAvailability(fakeReq('u-7'), dto);
      expect(mockOnboardingService.saveStep6).toHaveBeenCalledWith('u-7', dto);
    });
  });

  // ── presignKyc() ──────────────────────────────────────────────────────────

  describe('presignKyc()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { docType: 'aadhaar', contentType: 'application/pdf' };
      const result = await ctrl.presignKyc(fakeReq('u-8'), dto);
      expect(mockOnboardingService.presignKycUpload).toHaveBeenCalledWith('u-8', dto);
      expect(result).toHaveProperty('url');
    });
  });

  // ── submitKyc() ───────────────────────────────────────────────────────────

  describe('submitKyc()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { s3Keys: ['kyc/u-9/aadhaar.pdf'] };
      await ctrl.submitKyc(fakeReq('u-9'), dto);
      expect(mockOnboardingService.submitKyc).toHaveBeenCalledWith('u-9', dto);
    });
  });

  // ── getDraft() ────────────────────────────────────────────────────────────

  describe('getDraft()', () => {
    it('delegates with userId', async () => {
      await ctrl.getDraft(fakeReq('u-10'));
      expect(mockOnboardingService.getDraft).toHaveBeenCalledWith('u-10');
    });
  });

  // ── saveDraft() ───────────────────────────────────────────────────────────

  describe('saveDraft()', () => {
    it('delegates with userId and dto', async () => {
      const dto: any = { step: 2, data: { experienceYears: 3 } };
      await ctrl.saveDraft(fakeReq('u-11'), dto);
      expect(mockOnboardingService.saveDraft).toHaveBeenCalledWith('u-11', dto);
    });
  });

  // ── toggleOnline() ────────────────────────────────────────────────────────

  describe('toggleOnline()', () => {
    it('delegates with userId and isOnline flag', async () => {
      await ctrl.toggleOnline(fakeReq('u-12'), { isOnline: true });
      expect(mockOnboardingService.setOnlineStatus).toHaveBeenCalledWith('u-12', true);
    });

    it('delegates with isOnline=false', async () => {
      await ctrl.toggleOnline(fakeReq('u-13'), { isOnline: false });
      expect(mockOnboardingService.setOnlineStatus).toHaveBeenCalledWith('u-13', false);
    });
  });
});
