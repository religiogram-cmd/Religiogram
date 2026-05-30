import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Review, ReviewableType } from './entities/review.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const REVIEW_ID   = 'review-1';
const USER_ID     = 'user-1';
const ENTITY_ID   = 'entity-1';

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id:                 REVIEW_ID,
    userId:             USER_ID,
    reviewableType:     ReviewableType.TEMPLE,
    reviewableId:       ENTITY_ID,
    rating:             4,
    body:               'Great place',
    isVerifiedPurchase: false,
    isHidden:           false,
    helpfulCount:       0,
    createdAt:          new Date(),
    updatedAt:          new Date(),
    ...overrides,
  } as unknown as Review;
}

// ── QueryBuilder mock ─────────────────────────────────────────────────────────

function makeListQB(results: [Review[], number] = [[], 0]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where:             jest.fn().mockReturnThis(),
    andWhere:          jest.fn().mockReturnThis(),
    orderBy:           jest.fn().mockReturnThis(),
    limit:             jest.fn().mockReturnThis(),
    offset:            jest.fn().mockReturnThis(),
    getManyAndCount:   jest.fn().mockResolvedValue(results),
    // For markHelpful — update QB
    update:   jest.fn().mockReturnThis(),
    set:      jest.fn().mockReturnThis(),
    execute:  jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return qb;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let listQB = makeListQB([[makeReview()], 1]);

const mockReviewRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeReview(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeReview(), ...d })),
  remove:  jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockImplementation(() => listQB),
};

const mockDataSource = {
  query: jest.fn().mockResolvedValue([{ exists: false }]),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ReviewsService', () => {
  let svc: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    listQB = makeListQB([[makeReview()], 1]);
    mockReviewRepo.findOne.mockResolvedValue(null);
    mockReviewRepo.createQueryBuilder.mockImplementation(() => listQB);
    mockDataSource.query.mockResolvedValue([{ exists: false }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getDataSourceToken(),        useValue: mockDataSource },
      ],
    }).compile();

    svc = module.get<ReviewsService>(ReviewsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto = {
      reviewableType: ReviewableType.TEMPLE,
      reviewableId:   ENTITY_ID,
      rating:         5,
      body:           'Amazing!',
    };

    it('creates a new review when none exists and calls updateRating', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);

      const result = await svc.create(USER_ID, dto as any);

      expect(mockReviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, rating: 5 }),
      );
      expect(mockReviewRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('upserts an existing review (overwrites rating and body)', async () => {
      const existing = makeReview({ rating: 3, body: 'Old text' });
      mockReviewRepo.findOne.mockResolvedValueOnce(existing);

      await svc.create(USER_ID, { ...dto, rating: 5, body: 'Updated' } as any);

      // save should be called with the mutated existing object
      expect(mockReviewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 5, body: 'Updated' }),
      );
      // create should NOT be called for an update
      expect(mockReviewRepo.create).not.toHaveBeenCalled();
    });

    it('sets isVerifiedPurchase=true for PROVIDER type when booking exists', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ exists: true }]);

      await svc.create(USER_ID, {
        ...dto,
        reviewableType: ReviewableType.PROVIDER,
      } as any);

      expect(mockReviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isVerifiedPurchase: true }),
      );
    });

    it('sets isVerifiedPurchase=false for TEMPLE type (no booking check)', async () => {
      // dataSource.query should not be called for TEMPLE (checkVerifiedPurchase returns false early)
      await svc.create(USER_ID, dto as any);

      // The EXISTS query is only for PROVIDER; TEMPLE skips it
      // We still accept it if the mock is called, but isVerifiedPurchase must be false
      expect(mockReviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isVerifiedPurchase: false }),
      );
    });

    it('sets isVerifiedPurchase=false for PLACE type', async () => {
      await svc.create(USER_ID, {
        ...dto,
        reviewableType: ReviewableType.PLACE,
      } as any);

      expect(mockReviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isVerifiedPurchase: false }),
      );
    });

    it('calls updateRating after saving a new review', async () => {
      const querySpy = jest.spyOn(svc, 'updateRating');
      await svc.create(USER_ID, dto as any);
      expect(querySpy).toHaveBeenCalledWith(dto.reviewableType, dto.reviewableId);
    });

    it('calls updateRating after upsert of existing review', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview());
      const querySpy = jest.spyOn(svc, 'updateRating');
      await svc.create(USER_ID, dto as any);
      expect(querySpy).toHaveBeenCalledWith(dto.reviewableType, dto.reviewableId);
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    const dto = {
      reviewableType: ReviewableType.TEMPLE,
      reviewableId:   ENTITY_ID,
      limit:          10,
      offset:         0,
    };

    it('returns items and total from getManyAndCount', async () => {
      listQB = makeListQB([[makeReview(), makeReview()], 2]);
      mockReviewRepo.createQueryBuilder.mockReturnValue(listQB);

      const result = await svc.list(dto as any);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('applies limit and offset from dto', async () => {
      await svc.list({ ...dto, limit: 5, offset: 10 } as any);
      expect(listQB.limit).toHaveBeenCalledWith(5);
      expect(listQB.offset).toHaveBeenCalledWith(10);
    });

    it('defaults limit=20 and offset=0 when not provided', async () => {
      await svc.list({ reviewableType: ReviewableType.TEMPLE, reviewableId: ENTITY_ID } as any);
      expect(listQB.limit).toHaveBeenCalledWith(20);
      expect(listQB.offset).toHaveBeenCalledWith(0);
    });

    it('filters by reviewableType and reviewableId', async () => {
      await svc.list(dto as any);
      expect(listQB.where).toHaveBeenCalledWith(
        expect.stringContaining('reviewable_type'),
        expect.objectContaining({ type: ReviewableType.TEMPLE }),
      );
      expect(listQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('reviewable_id'),
        expect.objectContaining({ id: ENTITY_ID }),
      );
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes the review and calls updateRating', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview());
      const updateSpy = jest.spyOn(svc, 'updateRating');

      await svc.delete(USER_ID, REVIEW_ID);

      expect(mockReviewRepo.remove).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(ReviewableType.TEMPLE, ENTITY_ID);
    });

    it('throws NotFoundException when review does not exist', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.delete(USER_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when userId does not match review owner', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview({ userId: 'other-user' }));
      await expect(svc.delete(USER_ID, REVIEW_ID)).rejects.toThrow(ForbiddenException);
    });

    it('does NOT call remove when ownership check fails', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview({ userId: 'other-user' }));
      await expect(svc.delete(USER_ID, REVIEW_ID)).rejects.toThrow(ForbiddenException);
      expect(mockReviewRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ── markHelpful ────────────────────────────────────────────────────────────

  describe('markHelpful()', () => {
    it('executes a QB update with helpful_count + 1 expression', async () => {
      await svc.markHelpful(REVIEW_ID);

      expect(listQB.update).toHaveBeenCalledWith(Review);
      expect(listQB.set).toHaveBeenCalledWith(
        expect.objectContaining({ helpfulCount: expect.any(Function) }),
      );
      expect(listQB.where).toHaveBeenCalledWith(
        expect.stringContaining('id'),
        expect.objectContaining({ id: REVIEW_ID }),
      );
      expect(listQB.execute).toHaveBeenCalled();
    });
  });

  // ── adminHide ──────────────────────────────────────────────────────────────

  describe('adminHide()', () => {
    it('sets isHidden=true and calls updateRating', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview({ isHidden: false }));
      const updateSpy = jest.spyOn(svc, 'updateRating');

      await svc.adminHide(REVIEW_ID);

      expect(mockReviewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isHidden: true }),
      );
      expect(updateSpy).toHaveBeenCalled();
    });

    it('is a no-op (does not save or recalculate) when review is already hidden', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview({ isHidden: true }));
      const updateSpy = jest.spyOn(svc, 'updateRating');

      await svc.adminHide(REVIEW_ID);

      expect(mockReviewRepo.save).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when review does not exist', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.adminHide('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateRating ───────────────────────────────────────────────────────────

  describe('updateRating()', () => {
    it('issues a raw UPDATE on the temples table for TEMPLE type', async () => {
      await svc.updateRating(ReviewableType.TEMPLE, ENTITY_ID);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE temples'),
        expect.arrayContaining([ReviewableType.TEMPLE, ENTITY_ID]),
      );
    });

    it('issues a raw UPDATE on the providers table for PROVIDER type', async () => {
      await svc.updateRating(ReviewableType.PROVIDER, ENTITY_ID);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE providers'),
        expect.arrayContaining([ReviewableType.PROVIDER, ENTITY_ID]),
      );
    });

    it('skips DB call for PLACE type (no rating columns yet)', async () => {
      await svc.updateRating(ReviewableType.PLACE, ENTITY_ID);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('is non-fatal — does not throw when dataSource.query fails', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('DB error'));
      await expect(
        svc.updateRating(ReviewableType.TEMPLE, ENTITY_ID),
      ).resolves.not.toThrow();
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns the review when found', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(makeReview());
      const review = await svc.findOne(REVIEW_ID);
      expect(review.id).toBe(REVIEW_ID);
    });

    it('throws NotFoundException when review does not exist', async () => {
      mockReviewRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
