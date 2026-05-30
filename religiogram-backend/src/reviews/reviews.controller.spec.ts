import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReviewsService = {
  create:     jest.fn().mockResolvedValue({ id: 'rev-1' }),
  list:       jest.fn().mockResolvedValue({ items: [], total: 0 }),
  delete:     jest.fn().mockResolvedValue(undefined),
  markHelpful: jest.fn().mockResolvedValue(undefined),
  adminHide:  jest.fn().mockResolvedValue(undefined),
};

function fakeUser(id = 'user-1'): any { return { id }; }

const REVIEW_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ReviewsController', () => {
  let ctrl: ReviewsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: mockReviewsService }],
    }).compile();

    ctrl = module.get<ReviewsController>(ReviewsController);
  });

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('delegates to reviewsService.create with userId and dto', async () => {
      const dto: any = { reviewableType: 'temple', reviewableId: 'temple-1', rating: 5, comment: 'Great!' };
      const result = await ctrl.create(fakeUser(), dto);
      expect(mockReviewsService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result.id).toBe('rev-1');
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to reviewsService.list with the query dto', async () => {
      const dto: any = { reviewableType: 'temple', reviewableId: 'temple-1', limit: 20, offset: 0 };
      await ctrl.list(dto);
      expect(mockReviewsService.list).toHaveBeenCalledWith(dto);
    });
  });

  // ── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('delegates to reviewsService.delete with userId and reviewId', async () => {
      await ctrl.delete(fakeUser(), REVIEW_UUID);
      expect(mockReviewsService.delete).toHaveBeenCalledWith('user-1', REVIEW_UUID);
    });
  });

  // ── markHelpful() ──────────────────────────────────────────────────────────

  describe('markHelpful()', () => {
    it('delegates to reviewsService.markHelpful with reviewId', async () => {
      await ctrl.markHelpful(REVIEW_UUID);
      expect(mockReviewsService.markHelpful).toHaveBeenCalledWith(REVIEW_UUID);
    });
  });

  // ── adminHide() ────────────────────────────────────────────────────────────

  describe('adminHide()', () => {
    it('delegates to reviewsService.adminHide with reviewId', async () => {
      await ctrl.adminHide(REVIEW_UUID);
      expect(mockReviewsService.adminHide).toHaveBeenCalledWith(REVIEW_UUID);
    });
  });
});
