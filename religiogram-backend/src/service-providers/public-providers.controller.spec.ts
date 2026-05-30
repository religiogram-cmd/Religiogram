import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PublicProvidersController } from './public-providers.controller';
import { ProviderEntity, ProviderStatus } from './entities/provider.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

function fakeProvider(id = 'prov-1'): any {
  return {
    id,
    fullName:        'Ramesh Pandit',
    city:            'Varanasi',
    religion:        'hindu',
    experienceYears: 10,
    languages:       ['hindi', 'english'],
    bio:             'Experienced priest.',
    ratingAvg:       '4.5',
    ratingCount:     25,
    services:        [],
  };
}

// Query builder mock chain
function makeQb(result: [any[], number] = [[], 0]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where:             jest.fn().mockReturnThis(),
    andWhere:          jest.fn().mockReturnThis(),
    orderBy:           jest.fn().mockReturnThis(),
    addOrderBy:        jest.fn().mockReturnThis(),
    skip:              jest.fn().mockReturnThis(),
    take:              jest.fn().mockReturnThis(),
    getManyAndCount:   jest.fn().mockResolvedValue(result),
  };
  return qb;
}

const mockProviderRepo = {
  createQueryBuilder: jest.fn(),
  findOne:            jest.fn(),
};

const PROV_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PublicProvidersController', () => {
  let ctrl: PublicProvidersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicProvidersController],
      providers: [
        { provide: getRepositoryToken(ProviderEntity), useValue: mockProviderRepo },
      ],
    }).compile();

    ctrl = module.get<PublicProvidersController>(PublicProvidersController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns paginated result with correct shape', async () => {
      const items = [fakeProvider()];
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([items, 1]));

      const result = await ctrl.list(undefined, undefined, undefined, '1', '10');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 10);
      expect(result).toHaveProperty('hasMore');
    });

    it('clamps limit to max 50', async () => {
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([[], 0]));
      const result = await ctrl.list(undefined, undefined, undefined, '1', '9999');
      expect(result.limit).toBe(50);
    });

    it('clamps limit to min 1', async () => {
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([[], 0]));
      const result = await ctrl.list(undefined, undefined, undefined, '1', '0');
      expect(result.limit).toBe(1);
    });

    it('clamps page to min 1', async () => {
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([[], 0]));
      const result = await ctrl.list(undefined, undefined, undefined, '-5', '10');
      expect(result.page).toBe(1);
    });

    it('applies religion filter when provided', async () => {
      const qb = makeQb([[], 0]);
      mockProviderRepo.createQueryBuilder.mockReturnValue(qb);
      await ctrl.list('hinduism');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('religion'),
        expect.objectContaining({ religion: 'hinduism' }),
      );
    });

    it('applies city filter when provided', async () => {
      const qb = makeQb([[], 0]);
      mockProviderRepo.createQueryBuilder.mockReturnValue(qb);
      await ctrl.list(undefined, 'Varanasi');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('city'),
        expect.anything(),
      );
    });

    it('applies search filter when provided', async () => {
      const qb = makeQb([[], 0]);
      mockProviderRepo.createQueryBuilder.mockReturnValue(qb);
      await ctrl.list(undefined, undefined, 'astro');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('full_name'),
        expect.anything(),
      );
    });

    it('serialises ratingAvg as float', async () => {
      const items = [fakeProvider()];
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([items, 1]));
      const result = await ctrl.list();
      expect(typeof result.items[0].ratingAvg).toBe('number');
    });

    it('ratingAvg is null when not set', async () => {
      const p = fakeProvider();
      p.ratingAvg = null;
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([[p], 1]));
      const result = await ctrl.list();
      expect(result.items[0].ratingAvg).toBeNull();
    });

    it('sets hasMore correctly', async () => {
      // 1 item, page=1 limit=1 → skip=0, items.length=1, total=5 → hasMore true
      const items = [fakeProvider()];
      mockProviderRepo.createQueryBuilder.mockReturnValue(makeQb([items, 5]));
      const result = await ctrl.list(undefined, undefined, undefined, '1', '1');
      expect(result.hasMore).toBe(true);
    });
  });

  // ── getOne() ──────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('returns serialised provider when found', async () => {
      mockProviderRepo.findOne.mockResolvedValueOnce(fakeProvider(PROV_UUID));
      const result = await ctrl.getOne(PROV_UUID);
      expect(mockProviderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PROV_UUID, status: ProviderStatus.Approved } }),
      );
      expect(result.id).toBe(PROV_UUID);
    });

    it('throws NotFoundException when provider not found', async () => {
      mockProviderRepo.findOne.mockResolvedValueOnce(null);
      await expect(ctrl.getOne(PROV_UUID)).rejects.toThrow(NotFoundException);
    });
  });
});
