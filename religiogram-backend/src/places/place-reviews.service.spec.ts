import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceReview } from './entities/place-review.entity';
import { Temple } from '../temples/entities/temple.entity';
import { RedisService } from '../redis/redis.service';

// ── QB factory ────────────────────────────────────────────────────────────────

function makeReviewQB(getManyAndCount = jest.fn().mockResolvedValue([[], 0])) {
  const qb: any = {
    leftJoinAndSelect:  jest.fn().mockReturnThis(),
    where:              jest.fn().mockReturnThis(),
    andWhere:           jest.fn().mockReturnThis(),
    orderBy:            jest.fn().mockReturnThis(),
    addOrderBy:         jest.fn().mockReturnThis(),
    skip:               jest.fn().mockReturnThis(),
    take:               jest.fn().mockReturnThis(),
    select:             jest.fn().mockReturnThis(),
    addSelect:          jest.fn().mockReturnThis(),
    groupBy:            jest.fn().mockReturnThis(),
    getManyAndCount,
    getRawMany:         jest.fn().mockResolvedValue([]),
    update:             jest.fn().mockReturnThis(),
    set:                jest.fn().mockReturnThis(),
    increment:          jest.fn().mockReturnThis(),
    execute:            jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeReview(overrides: any = {}) {
  return {
    id:           'review-1',
    placeId:      'place-1',
    userId:       'user-1',
    rating:       4,
    body:         'Great place',
    helpfulCount: 0,
    isHidden:     false,
    visitDate:    null,
    photoUrls:    [],
    createdAt:    new Date(),
    user:         { id: 'user-1', profile: { name: 'Test User', profileImageUrl: null } },
    ...overrides,
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let reviewQB = makeReviewQB();

const mockReviewRepo = {
  createQueryBuilder: jest.fn(() => reviewQB),
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeReview(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeReview(), ...d })),
  delete:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockTempleRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 'place-1', ratingAvg: 4.2, ratingCount: 10 }),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlaceReviewsService', () => {
  let svc: PlaceReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    reviewQB = makeReviewQB();
    mockReviewRepo.createQueryBuilder.mockReturnValue(reviewQB);
    mockReviewRepo.findOne.mockResolvedValue(null);
    mockTempleRepo.findOne.mockResolvedValue({ id: 'place-1', ratingAvg: 4.2, ratingCount: 10 });
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceReviewsService,
        { provide: getRepositoryToken(PlaceReview), useValue: mockReviewRepo },
        { provide: getRepositoryToken(Temple),      useValue: mockTempleRepo },
        { provide: RedisService,                    useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<PlaceReviewsService>(PlaceReviewsService);
  });

  // ── listReviews ────────────────────────────────────────────────────────────

  describe('listReviews()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      mockTempleRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.listReviews('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns cached data when Redis has a hit', async () => {
      const cached = JSON.stringify({
        reviews: [], total: 0, ratingAvg: 4.0, ratingCount: 5,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 3 },
      });
      mockRedis.get.mockResolvedValueOnce(cached);
      const result = await svc.listReviews('place-1');
      expect(result.ratingAvg).toBe(4.0);
      expect(mockReviewRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns page of reviews from DB on cache miss', async () => {
      const review = makeReview();
      reviewQB.getManyAndCount.mockResolvedValueOnce([[review], 1]);
      const result = await svc.listReviews('place-1');
      expect(result.total).toBe(1);
      expect(result.reviews).toHaveLength(1);
    });

    it('writes result to Redis cache after DB fetch', async () => {
      reviewQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.listReviews('place-1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('place_reviews:place-1'),
        expect.any(String),
        'EX',
        180, // CACHE_TTL = 3 * 60
      );
    });

    it('clamps limit to 50 maximum', async () => {
      reviewQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.listReviews('place-1', { limit: 200 });
      expect(reviewQB.take).toHaveBeenCalledWith(50);
    });
  });

  // ── upsertReview ───────────────────────────────────────────────────────────

  describe('upsertReview()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      mockTempleRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.upsertReview('bad-place', 'user-1', { rating: 4 })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid rating (0)', async () => {
      await expect(svc.upsertReview('place-1', 'user-1', { rating: 0 })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid rating (6)', async () => {
      await expect(svc.upsertReview('place-1', 'user-1', { rating: 6 })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for more than 5 photos', async () => {
      await expect(svc.upsertReview('place-1', 'user-1', {
        rating: 4,
        photoUrls: ['a', 'b', 'c', 'd', 'e', 'f'],
      })).rejects.toThrow(BadRequestException);
    });

    it('creates a new review when user has no existing review', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);
      await svc.upsertReview('place-1', 'user-1', { rating: 5, body: 'Excellent' });
      expect(mockReviewRepo.save).toHaveBeenCalled();
    });

    it('updates the existing review when user already reviewed the place', async () => {
      const existing = makeReview({ rating: 3 });
      mockReviewRepo.findOne.mockResolvedValueOnce(existing);
      await svc.upsertReview('place-1', 'user-1', { rating: 5 });
      expect(mockReviewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5 }),
      );
    });
  });

  // ── getMyReview ────────────────────────────────────────────────────────────

  describe('getMyReview()', () => {
    it('returns null when user has no review', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);
      expect(await svc.getMyReview('place-1', 'user-1')).toBeNull();
    });

    it('returns DTO when review exists', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview());
      const result = await svc.getMyReview('place-1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.rating).toBe(4);
    });
  });
});
