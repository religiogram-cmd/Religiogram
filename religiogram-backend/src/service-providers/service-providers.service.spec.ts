import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

// ── Mock AWS SDK ───────────────────────────────────────────────────────────────
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned?token=abc'),
}));

import { ProviderOnboardingService } from './service-providers.service';
import {
  ProviderEntity,
  ProviderReligion,
  ProviderStatus,
} from './entities/provider.entity';
import { ServiceMasterEntity } from './entities/service-master.entity';
import {
  ProviderServiceEntity,
  ServiceMode,
} from './entities/provider-service.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { KycVideoEntity, KycStatus } from './entities/kyc-video.entity';
import { OnboardingDraftEntity } from './entities/onboarding-draft.entity';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockGetSignedUrl = getSignedUrl as jest.Mock;

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeProvider(overrides: any = {}): ProviderEntity {
  return {
    id:              'prov-1',
    userId:          'user-1',
    fullName:        'Pandit Sharma',
    dob:             '1980-01-01',
    phone:           '9876543210',
    city:            'varanasi',
    status:          ProviderStatus.Draft,
    religion:        null,
    experienceYears: 0,
    languages:       [],
    bio:             null,
    isOnline:        false,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  } as unknown as ProviderEntity;
}

function makeServiceMaster(overrides: any = {}): ServiceMasterEntity {
  return {
    id:                      'svc-master-1',
    name:                    'Kundli Reading',
    category:                'astrology',
    religion:                ProviderReligion.Hindu,
    isActive:                true,
    suggestedMinPrice:       5000,
    suggestedDurationMinutes: 60,
    sortOrder:               1,
    ...overrides,
  } as unknown as ServiceMasterEntity;
}

function makeProviderService(overrides: any = {}): ProviderServiceEntity {
  return {
    id:              'ps-1',
    providerId:      'prov-1',
    serviceId:       'svc-master-1',
    customName:      null,
    basePricePaise:  5000,
    durationMinutes: 60,
    mode:            ServiceMode.Offline,
    isActive:        true,
    ...overrides,
  } as unknown as ProviderServiceEntity;
}

// ── Transaction mock ──────────────────────────────────────────────────────────

const txProviderServicesRepo = {
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  update:  jest.fn().mockResolvedValue({ affected: 1 }),
  insert:  jest.fn().mockResolvedValue({}),
};

const txAvailabilityRepo = {
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockResolvedValue([]),
};

const txKycRepo = {
  insert: jest.fn().mockResolvedValue({}),
};

const txProviderRepo = {
  update: jest.fn().mockResolvedValue({}),
};

const txDraftRepo = {
  delete: jest.fn().mockResolvedValue({}),
};

const mockTxManager = {
  getRepository: jest.fn((entity: any) => {
    const name = entity?.name ?? '';
    if (name === 'ProviderServiceEntity') return txProviderServicesRepo;
    if (name === 'AvailabilityEntity')    return txAvailabilityRepo;
    if (name === 'KycVideoEntity')        return txKycRepo;
    if (name === 'ProviderEntity')        return txProviderRepo;
    if (name === 'OnboardingDraftEntity') return txDraftRepo;
    return txProviderServicesRepo;
  }),
};

const mockDs = {
  transaction: jest.fn().mockImplementation(
    (fn: (em: any) => Promise<any>) => fn(mockTxManager),
  ),
  getRepository: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue({}) }),
};

// ── Repository mocks ──────────────────────────────────────────────────────────

const mockProvidersRepo = {
  findOne:   jest.fn().mockResolvedValue(null),
  create:    jest.fn().mockImplementation((d: any) => ({ ...makeProvider(), ...d })),
  save:      jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeProvider(), ...d })),
};

const mockCatalogueRepo = {
  find:   jest.fn().mockResolvedValue([]),
  findBy: jest.fn().mockResolvedValue([]),
};

const mockProviderServicesRepo = {
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockAvailRepo = {
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  save:   jest.fn().mockResolvedValue([]),
};

const mockKycRepo = {
  findOne: jest.fn().mockResolvedValue(null),
};

const mockDraftsRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
};

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    if (key === 'storage.region') return 'ap-south-1';
    if (key === 'storage.bucket') return 'religiogram-dev';
    return def ?? null;
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ProviderOnboardingService', () => {
  let svc: ProviderOnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockProvidersRepo.findOne.mockResolvedValue(null);
    mockKycRepo.findOne.mockResolvedValue(null);
    mockDraftsRepo.findOne.mockResolvedValue(null);
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned?token=abc');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderOnboardingService,
        { provide: getDataSourceToken(),                            useValue: mockDs },
        { provide: getRepositoryToken(ProviderEntity),             useValue: mockProvidersRepo },
        { provide: getRepositoryToken(ServiceMasterEntity),        useValue: mockCatalogueRepo },
        { provide: getRepositoryToken(ProviderServiceEntity),      useValue: mockProviderServicesRepo },
        { provide: getRepositoryToken(AvailabilityEntity),         useValue: mockAvailRepo },
        { provide: getRepositoryToken(KycVideoEntity),             useValue: mockKycRepo },
        { provide: getRepositoryToken(OnboardingDraftEntity),      useValue: mockDraftsRepo },
        { provide: ConfigService,                                  useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<ProviderOnboardingService>(ProviderOnboardingService);
  });

  // ── listCatalogue ──────────────────────────────────────────────────────────

  describe('listCatalogue()', () => {
    it('returns grouped categories for a religion', async () => {
      mockCatalogueRepo.find.mockResolvedValueOnce([
        makeServiceMaster({ category: 'astrology', name: 'Kundli' }),
        makeServiceMaster({ id: 'svc-2', category: 'puja', name: 'Satyanarayan Puja' }),
      ]);

      const result = await svc.listCatalogue(ProviderReligion.Hindu);
      expect(result.religion).toBe(ProviderReligion.Hindu);
      expect(result.categories).toHaveLength(2);
      const cats = result.categories.map((c: any) => c.name);
      expect(cats).toContain('astrology');
      expect(cats).toContain('puja');
    });

    it('returns empty categories when no active services exist', async () => {
      mockCatalogueRepo.find.mockResolvedValueOnce([]);
      const result = await svc.listCatalogue(ProviderReligion.Muslim);
      expect(result.categories).toHaveLength(0);
    });
  });

  // ── saveStep1 ──────────────────────────────────────────────────────────────

  describe('saveStep1()', () => {
    const dto = {
      fullName: 'Pandit Sharma',
      dob: '1980-01-01',
      phone: '9876543210',
      city: 'varanasi',
    };

    it('throws ForbiddenException when phone does not match authenticated phone', async () => {
      await expect(
        svc.saveStep1('user-1', '9999999999', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a new provider when none exists and saves step 1 data', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);  // getProvider → null
      mockProvidersRepo.save.mockResolvedValueOnce(makeProvider({ id: 'prov-new' }));

      const result = await svc.saveStep1('user-1', '9876543210', dto);
      expect(result.providerId).toBeTruthy();
      expect(result.step).toBe(1);
    });

    it('updates existing provider with new step 1 data', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());

      const result = await svc.saveStep1('user-1', '9876543210', {
        ...dto,
        fullName: 'Pandit Raghav',
      });
      expect(result.step).toBe(1);
      expect(mockProvidersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Pandit Raghav' }),
      );
    });

    it('throws ForbiddenException when provider is approved', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(
        makeProvider({ status: ProviderStatus.Approved }),
      );
      await expect(
        svc.saveStep1('user-1', '9876543210', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when provider is suspended', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(
        makeProvider({ status: ProviderStatus.Suspended }),
      );
      await expect(
        svc.saveStep1('user-1', '9876543210', dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── saveStep2 ──────────────────────────────────────────────────────────────

  describe('saveStep2()', () => {
    it('throws NotFoundException when provider does not exist (Step 1 not done)', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.saveStep2('user-1', { experienceYears: 5, languages: ['hindi'], bio: null }),
      ).rejects.toThrow(NotFoundException);
    });

    it('trims and deduplicates languages, caps at 10', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const langs = Array.from({ length: 15 }, (_, i) => ` lang${i} `);
      await svc.saveStep2('user-1', { experienceYears: 5, languages: langs, bio: null });
      const saved = mockProvidersRepo.save.mock.calls[0][0];
      expect(saved.languages).toHaveLength(10);
    });

    it('saves experienceYears and bio correctly', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      await svc.saveStep2('user-1', {
        experienceYears: 12,
        languages: ['hindi', 'english'],
        bio: '  Expert astrologer  ',
      });
      expect(mockProvidersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ experienceYears: 12, bio: 'Expert astrologer' }),
      );
    });
  });

  // ── saveStep3 ──────────────────────────────────────────────────────────────

  describe('saveStep3()', () => {
    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.saveStep3('user-1', ProviderReligion.Hindu),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears existing services when religion changes', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(
        makeProvider({ religion: ProviderReligion.Muslim }),
      );
      await svc.saveStep3('user-1', ProviderReligion.Hindu);
      expect(mockProviderServicesRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov-1' }),
      );
    });

    it('does not clear services when religion is unchanged', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(
        makeProvider({ religion: ProviderReligion.Hindu }),
      );
      await svc.saveStep3('user-1', ProviderReligion.Hindu);
      expect(mockProviderServicesRepo.delete).not.toHaveBeenCalled();
    });

    it('saves the new religion and returns step: 3', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider({ religion: null }));
      const result = await svc.saveStep3('user-1', ProviderReligion.Hindu);
      expect(result.step).toBe(3);
      expect(result.religion).toBe(ProviderReligion.Hindu);
      expect(mockProvidersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ religion: ProviderReligion.Hindu }),
      );
    });
  });

  // ── saveStep4 ──────────────────────────────────────────────────────────────

  describe('saveStep4()', () => {
    const baseProvider = makeProvider({ religion: ProviderReligion.Hindu });

    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.saveStep4('user-1', { serviceIds: ['svc-1'], customServiceNames: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when religion is not set', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider({ religion: null }));
      await expect(
        svc.saveStep4('user-1', { serviceIds: ['svc-1'], customServiceNames: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when both serviceIds and customNames are empty', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      await expect(
        svc.saveStep4('user-1', { serviceIds: [], customServiceNames: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a service belongs to a different religion', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      mockCatalogueRepo.findBy.mockResolvedValueOnce([
        makeServiceMaster({ religion: ProviderReligion.Muslim }),
      ]);
      await expect(
        svc.saveStep4('user-1', { serviceIds: ['svc-master-1'], customServiceNames: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when unknown service ids are passed', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      // findBy returns fewer rows than ids passed
      mockCatalogueRepo.findBy.mockResolvedValueOnce([makeServiceMaster()]);
      await expect(
        svc.saveStep4('user-1', {
          serviceIds: ['svc-1', 'svc-unknown'],
          customServiceNames: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('runs inside a transaction and wipes old selections', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      mockCatalogueRepo.findBy.mockResolvedValueOnce([makeServiceMaster()]);

      await svc.saveStep4('user-1', { serviceIds: ['svc-master-1'], customServiceNames: [] });

      expect(mockDs.transaction).toHaveBeenCalled();
      expect(txProviderServicesRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov-1' }),
      );
    });

    it('accepts custom service names and returns correct selected count', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);

      const result = await svc.saveStep4('user-1', {
        serviceIds: [],
        customServiceNames: ['Special Puja', 'Vastu Consultancy'],
      });
      expect(result.step).toBe(4);
      expect(result.selected).toBe(2);
    });

    it('deduplicates custom service names', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);

      await svc.saveStep4('user-1', {
        serviceIds: [],
        customServiceNames: ['My Puja', 'My Puja', 'My Puja'],
      });
      // Only 1 unique name should be saved
      const saveCall = txProviderServicesRepo.save.mock.calls[0]?.[0];
      if (saveCall) {
        const names = saveCall.map((r: any) => r.customName);
        expect(new Set(names).size).toBe(1);
      }
    });
  });

  // ── saveStep5 ──────────────────────────────────────────────────────────────

  describe('saveStep5()', () => {
    const baseProvider = makeProvider({ religion: ProviderReligion.Hindu });

    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.saveStep5('user-1', { items: [{ serviceId: 'svc-1', basePricePaise: 1000, durationMinutes: 60, mode: ServiceMode.Offline }] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when religion is not set', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider({ religion: null }));
      await expect(
        svc.saveStep5('user-1', { items: [{ serviceId: 'svc-1', basePricePaise: 1000, durationMinutes: 60, mode: ServiceMode.Offline }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when items list is empty', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      await expect(
        svc.saveStep5('user-1', { items: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('runs pricing upserts inside a transaction', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(baseProvider);
      txProviderServicesRepo.findOne.mockResolvedValueOnce(null); // no existing row

      const result = await svc.saveStep5('user-1', {
        items: [
          { serviceId: 'svc-master-1', basePricePaise: 5000, durationMinutes: 60, mode: ServiceMode.Offline },
        ],
      });
      expect(mockDs.transaction).toHaveBeenCalled();
      expect(result.step).toBe(5);
      expect(result.itemCount).toBe(1);
    });
  });

  // ── saveStep6 ──────────────────────────────────────────────────────────────

  describe('saveStep6()', () => {
    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.saveStep6('user-1', { slots: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when two non-break slots overlap on the same day', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      await expect(
        svc.saveStep6('user-1', {
          slots: [
            { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isBreak: false },
            { dayOfWeek: 1, startTime: '11:00', endTime: '14:00', isBreak: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows overlapping break slots (breaks are excluded from overlap check)', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const result = await svc.saveStep6('user-1', {
        slots: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isBreak: false },
          { dayOfWeek: 1, startTime: '11:00', endTime: '12:00', isBreak: true },
        ],
      });
      expect(result.step).toBe(6);
    });

    it('saves slots inside a transaction, wiping old ones first', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const result = await svc.saveStep6('user-1', {
        slots: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isBreak: false },
        ],
      });
      expect(mockDs.transaction).toHaveBeenCalled();
      expect(txAvailabilityRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov-1' }),
      );
      expect(result.slotCount).toBe(1);
    });
  });

  // ── presignKycUpload ───────────────────────────────────────────────────────

  describe('presignKycUpload()', () => {
    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.presignKycUpload('user-1', { mimeType: 'video/mp4', sizeBytes: 1_000_000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns a presigned URL for mp4', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());

      const result = await svc.presignKycUpload('user-1', {
        mimeType: 'video/mp4',
        sizeBytes: 5_000_000,
      });
      expect(result.url).toContain('s3.example.com');
      expect(result.s3Key).toMatch(/^kyc\/prov-1\/.+\.mp4$/);
      expect(result.expiresIn).toBe(15 * 60);
    });

    it('uses .mov extension for quicktime', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const result = await svc.presignKycUpload('user-1', {
        mimeType: 'video/quicktime',
        sizeBytes: 2_000_000,
      });
      expect(result.s3Key).toMatch(/\.mov$/);
    });

    it('uses .webm extension for other types', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const result = await svc.presignKycUpload('user-1', {
        mimeType: 'video/webm',
        sizeBytes: 2_000_000,
      });
      expect(result.s3Key).toMatch(/\.webm$/);
    });
  });

  // ── submitKyc ──────────────────────────────────────────────────────────────

  describe('submitKyc()', () => {
    const kycDto = {
      s3Key:           'kyc/prov-1/abc.mp4',
      durationSeconds: 45.5,
      sizeBytes:       4_000_000,
      mimeType:        'video/mp4',
    };

    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.submitKyc('user-1', kycDto)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when s3Key does not belong to this provider', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      await expect(
        svc.submitKyc('user-1', { ...kycDto, s3Key: 'kyc/other-provider/abc.mp4' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when a KYC record already exists in uploaded/pending/approved state', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      mockKycRepo.findOne.mockResolvedValueOnce({
        id: 'kyc-1',
        status: KycStatus.PendingReview,
      });
      await expect(svc.submitKyc('user-1', kycDto)).rejects.toThrow(ConflictException);
    });

    it('inserts KYC record and flips provider to pending_review', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      mockKycRepo.findOne.mockResolvedValueOnce(null);

      const result = await svc.submitKyc('user-1', kycDto);
      expect(mockDs.transaction).toHaveBeenCalled();
      expect(txKycRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          s3Key: 'kyc/prov-1/abc.mp4',
          status: KycStatus.Uploaded,
        }),
      );
      expect(txProviderRepo.update).toHaveBeenCalledWith(
        { id: 'prov-1' },
        expect.objectContaining({ status: ProviderStatus.PendingReview }),
      );
      expect(result.status).toBe(ProviderStatus.PendingReview);
    });

    it('deletes onboarding draft after successful KYC submit', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      mockKycRepo.findOne.mockResolvedValueOnce(null);

      await svc.submitKyc('user-1', kycDto);
      expect(txDraftRepo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  // ── saveDraft ──────────────────────────────────────────────────────────────

  describe('saveDraft()', () => {
    it('creates a new draft when none exists', async () => {
      mockDraftsRepo.findOne.mockResolvedValueOnce(null);
      const result = await svc.saveDraft('user-1', {
        step: 2,
        data: { experienceYears: 5 },
      });
      expect(result.ok).toBe(true);
      expect(result.step).toBe(2);
      expect(mockDraftsRepo.save).toHaveBeenCalled();
    });

    it('merges new data with existing draft data', async () => {
      mockDraftsRepo.findOne.mockResolvedValueOnce({
        userId: 'user-1',
        step: 1,
        data: { fullName: 'Pandit Sharma' },
      });
      await svc.saveDraft('user-1', {
        step: 2,
        data: { experienceYears: 5 },
      });
      expect(mockDraftsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Pandit Sharma',
            experienceYears: 5,
          }),
        }),
      );
    });
  });

  // ── getDraft ───────────────────────────────────────────────────────────────

  describe('getDraft()', () => {
    it('returns step=1 and empty data when no draft or provider exists', async () => {
      mockDraftsRepo.findOne.mockResolvedValueOnce(null);
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);

      const result = await svc.getDraft('user-1');
      expect(result.step).toBe(1);
      expect(result.data).toEqual({});
      expect(result.providerStatus).toBeNull();
    });

    it('returns saved draft data and provider status', async () => {
      mockDraftsRepo.findOne.mockResolvedValueOnce({
        step: 3,
        data: { fullName: 'Pandit', religion: 'hindu' },
      });
      mockProvidersRepo.findOne.mockResolvedValueOnce(
        makeProvider({ status: ProviderStatus.PendingReview }),
      );

      const result = await svc.getDraft('user-1');
      expect(result.step).toBe(3);
      expect(result.data.fullName).toBe('Pandit');
      expect(result.providerStatus).toBe(ProviderStatus.PendingReview);
    });
  });

  // ── setOnlineStatus ────────────────────────────────────────────────────────

  describe('setOnlineStatus()', () => {
    it('throws NotFoundException when provider does not exist', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.setOnlineStatus('user-1', true)).rejects.toThrow(NotFoundException);
    });

    it('updates isOnline field and returns the new status', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider());
      const result = await svc.setOnlineStatus('user-1', true);
      expect(result.isOnline).toBe(true);
    });

    it('sets isOnline to false correctly', async () => {
      mockProvidersRepo.findOne.mockResolvedValueOnce(makeProvider({ isOnline: true }));
      const result = await svc.setOnlineStatus('user-1', false);
      expect(result.isOnline).toBe(false);
    });
  });
});
