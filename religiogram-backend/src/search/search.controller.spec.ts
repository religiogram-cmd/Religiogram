import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSearchService = {
  search: jest.fn().mockResolvedValue({ temples: [], providers: [], total: 0 }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SearchController', () => {
  let ctrl: SearchController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    }).compile();

    ctrl = module.get<SearchController>(SearchController);
  });

  // ── search() ───────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('delegates to searchService.search with q, city, limit from dto', async () => {
      const dto: any = { q: 'ram mandir', city: 'Varanasi', limit: 10 };
      await ctrl.search(dto);
      expect(mockSearchService.search).toHaveBeenCalledWith('ram mandir', 'Varanasi', 10);
    });

    it('passes undefined city and limit when not provided', async () => {
      const dto: any = { q: 'shiva' };
      await ctrl.search(dto);
      expect(mockSearchService.search).toHaveBeenCalledWith('shiva', undefined, undefined);
    });

    it('returns results from searchService', async () => {
      mockSearchService.search.mockResolvedValueOnce({
        temples: [{ id: 't1', name: 'Ram Mandir' }],
        providers: [],
        total: 1,
      });
      const dto: any = { q: 'ram' };
      const result = await ctrl.search(dto);
      expect(result.total).toBe(1);
      expect(result.temples).toHaveLength(1);
    });
  });
});
