import { Test, TestingModule } from '@nestjs/testing';
import { PayoutService } from './payout.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProviderEarning, EarningStatus, ReferenceType } from './entities/provider-earning.entity';
import { PayoutBatch, BatchStatus } from './entities/payout-batch.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const PROVIDER_ID = 'prov-uuid-001';
const REF_ID      = 'booking-ref-001';

const makeEarningRepo = () => ({
  create:  jest.fn().mockImplementation((d: any) => ({ id: 'earn-1', ...d })),
  save:    jest.fn().mockImplementation(async (d: any) => d),
  find:    jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  update:  jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    select:    jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    update:    jest.fn().mockReturnThis(),
    set:       jest.fn().mockReturnThis(),
    where:     jest.fn().mockReturnThis(),
    andWhere:  jest.fn().mockReturnThis(),
    execute:   jest.fn().mockResolvedValue({ affected: 1 }),
    getRawOne: jest.fn().mockResolvedValue({ total: '0', count: '0' }),
  }),
});

const makeBatchRepo = () => ({
  create:    jest.fn().mockImplementation((d: any) => ({ id: 'batch-1', ...d })),
  save:      jest.fn().mockImplementation(async (d: any) => d),
  findOne:   jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  manager: { query: jest.fn().mockResolvedValue([]) },
});

async function buildService(earningRepo: any, batchRepo: any): Promise<PayoutService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PayoutService,
      { provide: getRepositoryToken(ProviderEarning), useValue: earningRepo },
      { provide: getRepositoryToken(PayoutBatch),     useValue: batchRepo },
      { provide: EmailService, useValue: { sendPayoutNotification: jest.fn().mockResolvedValue(undefined) } },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(10), getOrThrow: jest.fn().mockReturnValue(10) } },
    ],
  }).compile();
  return module.get<PayoutService>(PayoutService);
}

describe('PayoutService', () => {
  let service:     PayoutService;
  let earningRepo: ReturnType<typeof makeEarningRepo>;
  let batchRepo:   ReturnType<typeof makeBatchRepo>;

  beforeEach(async () => {
    earningRepo = makeEarningRepo();
    batchRepo   = makeBatchRepo();
    service     = await buildService(earningRepo, batchRepo);
  });

  // ── recordEarning ─────────────────────────────────────────────────────────

  describe('recordEarning', () => {
    it('creates and saves an earning record with correct net paise', async () => {
      const result = await service.recordEarning(PROVIDER_ID, REF_ID, 'booking', 10000, 1000, 100);
      expect(earningRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        providerId:       PROVIDER_ID,
        referenceId:      REF_ID,
        grossAmountPaise: 10000,
        platformFeePaise: 1000,
        tdsDeductedPaise: 100,
        netAmountPaise:   8900,
        status:           EarningStatus.PENDING,
      });
    });

    it('throws BadRequestException when net amount would be negative', async () => {
      await expect(
        service.recordEarning(PROVIDER_ID, REF_ID, 'booking', 100, 90, 20),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── scheduleBatch ─────────────────────────────────────────────────────────

  describe('scheduleBatch', () => {
    it('creates batch summing all pending earnings', async () => {
      const earnings = [
        { id: 'e1', netAmountPaise: 5000, status: EarningStatus.PENDING, referenceType: ReferenceType.BOOKING },
        { id: 'e2', netAmountPaise: 3900, status: EarningStatus.PENDING, referenceType: ReferenceType.BOOKING },
      ];
      earningRepo.find.mockResolvedValue(earnings);
      const result = await service.scheduleBatch(PROVIDER_ID);
      expect(batchRepo.save).toHaveBeenCalled();
      expect(result.totalAmountPaise).toBe(8900);
    });

    it('throws BadRequestException when no pending earnings', async () => {
      earningRepo.find.mockResolvedValue([]);
      await expect(service.scheduleBatch(PROVIDER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ── processBatch ──────────────────────────────────────────────────────────

  describe('processBatch', () => {
    const BATCH_ID   = 'batch-uuid-001';
    const mockBatch  = {
      id:               BATCH_ID,
      providerId:       PROVIDER_ID,
      totalAmountPaise: 8900,
      status:           BatchStatus.SCHEDULED,
      utrNumber:        null,
      processedAt:      null,
      gatewayPayoutId:  null,
      failureReason:    null,
    };

    it('transitions SCHEDULED → COMPLETED with UTR', async () => {
      batchRepo.findOne.mockResolvedValue({ ...mockBatch });
      const result = await service.processBatch(BATCH_ID);
      expect(result.status).toBe(BatchStatus.COMPLETED);
      expect(result.utrNumber).toBeTruthy();
    });

    it('throws NotFoundException for unknown batch', async () => {
      batchRepo.findOne.mockResolvedValue(null);
      await expect(service.processBatch(BATCH_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for already COMPLETED batch', async () => {
      batchRepo.findOne.mockResolvedValue({ ...mockBatch, status: BatchStatus.COMPLETED });
      await expect(service.processBatch(BATCH_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
