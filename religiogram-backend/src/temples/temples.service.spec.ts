import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TemplesService } from './temples.service';
import { Temple } from './entities/temple.entity';
import { RedisService } from '../redis/redis.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

const TEMPLE_ID = 'temple-1';

function makeTemple(overrides: any = {}): Temple {
  return {
    id:          TEMPLE_ID,
    name:        'Shri Ram Mandir',
    city:        'ayodhya',
    state:       'Uttar Pradesh',
    address:     '123 Ram Path',
    lat:         26.79,
    lng:         82.19,
    ratingAvg:   4.5,
    ratingCount: 100,
    hours:       '06:00–22:00',
    deity:       'Ram',
    isVerified:  true,
    imageUrl:    'https://cdn.example.com/temple.jpg',
    ...overrides,
  } as unknown as Temple;
}

function makeNearbyRow(overrides: any = {}) {
  return {
    id:           TEMPLE_ID,
    name:         'Shri Ram Mandir',
    city:         'ayodhya',
    state:        'Uttar Pradesh',
    address:      '123 Ram Path',
    lat:          '26.79',
    lng:          '82.19',
    rating_avg:   '4.50',
    rating_count: 100,
    hours:        '06:00–22:00',
    deity:        'Ram',
    is_verified:  true,
    image_url:    'https://cdn.example.com/temple.jpg',
    distance_m:   500,
    ...overrides,
  };
}

// ── QueryBuilder mock ─────────────────────────────────────────────────────────

function makeQB(result: any = [makeTemple()], total = 1) {
  const qb: any = {
    select:        jest.fn().mockReturnThis(),
    where:         jest.fn().mockReturnThis(),
    andWhere:      jest.fn().mockReturnThis(),
    orderBy:       jest.fn().mockReturnThis(),
    addOrderBy:    jest.fn().mockReturnThis(),
    skip:          jest.fn().mockReturnThis(),
    take:          jest.fn().mockReturnThis(),
    limit:         jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([result, total]),
    getMany:       jest.fn().mockResolvedValue(result),
    getRawMany:    jest.fn().mockResolvedValue(result.map ? result : [result]),
  };
  return qb;
}

let listQB = makeQB();

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockTemplesRepo = {
  findOne:            jest.fn().mockResolvedValue(makeTemple()),
  query:              jest.fn().mockResolvedValue([makeNearbyRow()]),
  createQueryBuilder: jest.fn().mockImplementation(() => listQB),
};

const mockRedis = {
  get:  jest.fn().mockResolvedValue(null),
  set:  jest.fn().mockResolvedValue('OK'),
  del:  jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TemplesService', () => {
  let svc: TemplesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    listQB = makeQB([makeTemple()], 1);
    mockTemplesRepo.findOne.mockResolvedValue(makeTemple());
    mockTemplesRepo.query.mockResolvedValue([makeNearbyRow()]);
    mockTemplesRepo.createQueryBuilder.mockImplementation(() => listQB);
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplesService,
        { provide: getRepositoryToken(Temple), useValue: mockTemplesRepo },
        { provide: RedisService,               useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<TemplesService>(TemplesService);
  });

  // ── nearby ─────────────────────────────────────────────────────────────────

  describe('nearby()', () => {
    const dto = { lat: 26.79, lng: 82.19, radiusKm: 5, limit: 10 };

    it('returns temples from PostGIS query when cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await svc.nearby(dto as any);
      expect(mockTemplesRepo.query).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].distanceM).toBe(500);
    });

    it('returns parsed cached response on cache hit', async () => {
      const cached = [{ id: 'cached-1', name: 'Cached Temple', distanceM: 100 }];
      mockRedis.get
        .mockResolvedValueOnce('0')   // getCacheVersion
        .mockResolvedValueOnce(JSON.stringify(cached)); // cache hit

      const result = await svc.nearby(dto as any);
      expect(mockTemplesRepo.query).not.toHaveBeenCalled();
      expect(result[0].id).toBe('cached-1');
    });

    it('caches result after DB query', async () => {
      await svc.nearby(dto as any);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('temples:'),
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('throws BadRequestException when neither lat/lng nor city is provided', async () => {
      await expect(
        svc.nearby({ radiusKm: 5, limit: 10 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps null rating_avg to null ratingAvg', async () => {
      mockTemplesRepo.query.mockResolvedValueOnce([
        makeNearbyRow({ rating_avg: null }),
      ]);
      const result = await svc.nearby(dto as any);
      expect(result[0].ratingAvg).toBeNull();
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns paginated items with hasMore flag', async () => {
      listQB = makeQB([makeTemple()], 25);
      mockTemplesRepo.createQueryBuilder.mockReturnValue(listQB);

      const result = await svc.list({ page: 1, limit: 20 } as any);

      expect(result.total).toBe(25);
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(1);
    });

    it('hasMore=false when on last page', async () => {
      listQB = makeQB([makeTemple()], 1);
      mockTemplesRepo.createQueryBuilder.mockReturnValue(listQB);

      const result = await svc.list({ page: 1, limit: 20 } as any);
      expect(result.hasMore).toBe(false);
    });

    it('applies search filter when dto.search is provided', async () => {
      await svc.list({ search: 'Ram' } as any);
      expect(listQB.where).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(t.name)'),
        expect.any(Object),
      );
    });

    it('applies city filter when dto.city is provided', async () => {
      await svc.list({ city: 'Ayodhya' } as any);
      expect(listQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(t.city)'),
        expect.objectContaining({ city: 'ayodhya' }),
      );
    });

    it('clamps limit to 50 max', async () => {
      await svc.list({ limit: 200 } as any);
      expect(listQB.take).toHaveBeenCalledWith(50);
    });

    it('defaults to page=1 and limit=20 when not provided', async () => {
      await svc.list({} as any);
      expect(listQB.take).toHaveBeenCalledWith(20);
      expect(listQB.skip).toHaveBeenCalledWith(0);
    });
  });

  // ── search ─────────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('returns empty array when query is empty', async () => {
      const result = await svc.search({ q: '' } as any);
      expect(result).toEqual([]);
      expect(mockTemplesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns temples matching tsvector query', async () => {
      listQB = makeQB([makeTemple()]);
      mockTemplesRepo.createQueryBuilder.mockReturnValue(listQB);

      const result = await svc.search({ q: 'ram mandir' } as any);
      expect(result).toHaveLength(1);
      expect(listQB.where).toHaveBeenCalledWith(
        expect.stringContaining('to_tsvector'),
        expect.any(Object),
      );
    });

    it('strips SQL meta characters from query', async () => {
      listQB = makeQB([makeTemple()]);
      mockTemplesRepo.createQueryBuilder.mockReturnValue(listQB);

      await svc.search({ q: "ram'; DROP TABLE temples;--" } as any);
      const [, params] = listQB.where.mock.calls[0];
      // tsQuery should not contain SQL injection chars
      expect(params.tsQuery).not.toContain(';');
      expect(params.tsQuery).not.toContain("'");
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns the temple when found', async () => {
      const result = await svc.findById(TEMPLE_ID);
      expect(result.id).toBe(TEMPLE_ID);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockTemplesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.findById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findCities ─────────────────────────────────────────────────────────────

  describe('findCities()', () => {
    it('returns sorted list of verified city slugs', async () => {
      const citiesQB = {
        ...makeQB(),
        select:   jest.fn().mockReturnThis(),
        where:    jest.fn().mockReturnThis(),
        orderBy:  jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { city: 'ayodhya' },
          { city: 'varanasi' },
        ]),
      };
      mockTemplesRepo.createQueryBuilder.mockReturnValueOnce(citiesQB);

      const result = await svc.findCities();
      expect(result).toEqual(['ayodhya', 'varanasi']);
    });
  });
});
