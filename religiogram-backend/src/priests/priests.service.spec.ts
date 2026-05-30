import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PriestsService } from './priests.service';
import { ProviderEntity as Provider } from '../service-providers/entities/provider.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { SortBy } from './dto/query-priests.dto';

// ── stubs ─────────────────────────────────────────────────────────────────────

const PROVIDER_ID = 'provider-1';

function makeProvider(overrides: any = {}): Provider {
  return {
    id:              PROVIDER_ID,
    isActive:        true,
    isVerified:      true,
    isOnline:        false,
    religion:        'hindu',
    city:            'varanasi',
    bio:             'Expert in Vedic rituals',
    basePrice:       500,
    experienceYears: 10,
    averageRating:   4.7,
    ratingAvg:       4.7,
    ratingCount:     50,
    latitude:        25.32,
    longitude:       83.01,
    services:        ['Puja & Havans', 'Weddings'],
    user:            { id: 'user-1', name: 'Pandit Ji' } as any,
    ...overrides,
  } as unknown as Provider;
}

// ── QueryBuilder mock ─────────────────────────────────────────────────────────

function makeQB(providers: Provider[] = [makeProvider()], total = 1) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where:             jest.fn().mockReturnThis(),
    andWhere:          jest.fn().mockReturnThis(),
    addSelect:         jest.fn().mockReturnThis(),
    setParameters:     jest.fn().mockReturnThis(),
    having:            jest.fn().mockReturnThis(),
    orderBy:           jest.fn().mockReturnThis(),
    skip:              jest.fn().mockReturnThis(),
    take:              jest.fn().mockReturnThis(),
    limit:             jest.fn().mockReturnThis(),
    getCount:          jest.fn().mockResolvedValue(total),
    getMany:           jest.fn().mockResolvedValue(providers),
  };
  return qb;
}

let findAllQB = makeQB();
let onlineQB  = makeQB([makeProvider({ isOnline: true })]);

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockProviderRepo = {
  findOne:            jest.fn().mockResolvedValue(makeProvider()),
  createQueryBuilder: jest.fn().mockImplementation(() => findAllQB),
};

const mockBookingRepo = {
  count: jest.fn().mockResolvedValue(5),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PriestsService', () => {
  let svc: PriestsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    findAllQB = makeQB();
    onlineQB  = makeQB([makeProvider({ isOnline: true })]);
    mockProviderRepo.findOne.mockResolvedValue(makeProvider());
    mockProviderRepo.createQueryBuilder.mockImplementation(() => findAllQB);
    mockBookingRepo.count.mockResolvedValue(5);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriestsService,
        { provide: getRepositoryToken(Provider), useValue: mockProviderRepo },
        { provide: getRepositoryToken(Booking),  useValue: mockBookingRepo },
      ],
    }).compile();

    svc = module.get<PriestsService>(PriestsService);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated items and total', async () => {
      findAllQB = makeQB([makeProvider()], 15);
      mockProviderRepo.createQueryBuilder.mockReturnValue(findAllQB);

      const result = await svc.findAll({} as any);

      expect(result.total).toBe(15);
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
    });

    it('applies faith filter when provided', async () => {
      await svc.findAll({ faith: 'hindu' } as any);
      expect(findAllQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('religion'),
        expect.objectContaining({ faith: 'hindu' }),
      );
    });

    it('applies city filter when provided', async () => {
      await svc.findAll({ city: 'Varanasi' } as any);
      expect(findAllQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('city'),
        expect.objectContaining({ city: 'Varanasi' }),
      );
    });

    it('applies service filter when provided', async () => {
      await svc.findAll({ service: 'Weddings' } as any);
      expect(findAllQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('services'),
        expect.objectContaining({ service: 'Weddings' }),
      );
    });

    it('applies name/bio search when provided', async () => {
      await svc.findAll({ search: 'vedic' } as any);
      expect(findAllQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('u.name'),
        expect.any(Object),
      );
    });

    it('adds distance SELECT and optional radius HAVING when lat+lng provided', async () => {
      await svc.findAll({ lat: 25.32, lng: 83.01, radiusKm: 10 } as any);
      expect(findAllQB.addSelect).toHaveBeenCalled();
      expect(findAllQB.having).toHaveBeenCalledWith(
        expect.stringContaining('distance_km'),
        expect.objectContaining({ r: 10 }),
      );
    });

    it('sorts by rating when sortBy=RATING', async () => {
      await svc.findAll({ sortBy: SortBy.RATING } as any);
      expect(findAllQB.orderBy).toHaveBeenCalledWith('p.averageRating', 'DESC');
    });

    it('sorts by price ascending when sortBy=PRICE', async () => {
      await svc.findAll({ sortBy: SortBy.PRICE } as any);
      expect(findAllQB.orderBy).toHaveBeenCalledWith('p.basePrice', 'ASC');
    });

    it('defaults page=1, limit=20 when not provided', async () => {
      await svc.findAll({} as any);
      expect(findAllQB.take).toHaveBeenCalledWith(20);
      expect(findAllQB.skip).toHaveBeenCalledWith(0);
    });

    it('calculates pages correctly', async () => {
      findAllQB = makeQB([makeProvider()], 45);
      mockProviderRepo.createQueryBuilder.mockReturnValue(findAllQB);

      const result = await svc.findAll({ page: 1, limit: 20 } as any);
      expect(result.pages).toBe(3); // ceil(45/20)
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns provider with user relation', async () => {
      const result = await svc.findOne(PROVIDER_ID);
      expect(result.id).toBe(PROVIDER_ID);
      expect(mockProviderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PROVIDER_ID },
          relations: ['user'],
        }),
      );
    });

    it('throws NotFoundException for unknown id', async () => {
      mockProviderRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getServices ────────────────────────────────────────────────────────────

  describe('getServices()', () => {
    it('returns array for a specific known faith', async () => {
      const result = await svc.getServices('hindu');
      expect(Array.isArray(result)).toBe(true);
      expect((result as string[]).length).toBeGreaterThan(0);
    });

    it('returns full catalog object when no faith is provided', async () => {
      const result = await svc.getServices();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('hindu');
      expect(result).toHaveProperty('muslim');
      expect(result).toHaveProperty('sikh');
      expect(result).toHaveProperty('christian');
    });

    it('returns full catalog for unknown faith', async () => {
      const result = await svc.getServices('jain');
      expect(typeof result).toBe('object');
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns booking counts and completion rate', async () => {
      mockBookingRepo.count
        .mockResolvedValueOnce(10)  // totalBookings
        .mockResolvedValueOnce(8);  // completedBookings

      const result = await svc.getStats(PROVIDER_ID);

      expect(result.totalBookings).toBe(10);
      expect(result.completedBookings).toBe(8);
      expect(result.completionRate).toBe(80);
    });

    it('returns completionRate=0 when totalBookings=0', async () => {
      mockBookingRepo.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await svc.getStats(PROVIDER_ID);
      expect(result.completionRate).toBe(0);
    });

    it('throws NotFoundException when provider does not exist', async () => {
      mockProviderRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getStats('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getOnlinePriests ───────────────────────────────────────────────────────

  describe('getOnlinePriests()', () => {
    it('returns only online active verified providers', async () => {
      mockProviderRepo.createQueryBuilder.mockReturnValueOnce(onlineQB);
      const result = await svc.getOnlinePriests();
      expect(onlineQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('isOnline'),
        expect.anything(),
      );
    });

    it('applies faith filter when provided', async () => {
      mockProviderRepo.createQueryBuilder.mockReturnValueOnce(onlineQB);
      await svc.getOnlinePriests('hindu');
      expect(onlineQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('religion'),
        expect.objectContaining({ faith: 'hindu' }),
      );
    });
  });
});
