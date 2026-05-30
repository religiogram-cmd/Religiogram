import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFavoritesService = {
  list:            jest.fn().mockResolvedValue([]),
  getFavoriteIds:  jest.fn().mockResolvedValue(new Set<string>()),
  add:             jest.fn().mockResolvedValue({ added: true }),
  remove:          jest.fn().mockResolvedValue({ removed: true }),
};

function fakeUser(id = 'user-1'): any { return { id }; }

const TEMPLE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FavoritesController', () => {
  let ctrl: FavoritesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [{ provide: FavoritesService, useValue: mockFavoritesService }],
    }).compile();

    ctrl = module.get<FavoritesController>(FavoritesController);
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to favoritesService.list with userId', async () => {
      mockFavoritesService.list.mockResolvedValueOnce([{ id: TEMPLE_UUID }]);
      const result = await ctrl.list(fakeUser());
      expect(mockFavoritesService.list).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  // ── getIds() ───────────────────────────────────────────────────────────────

  describe('getIds()', () => {
    it('parses comma-separated ids and delegates to getFavoriteIds', async () => {
      const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id2 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
      mockFavoritesService.getFavoriteIds.mockResolvedValueOnce(new Set([id1]));
      const result = await ctrl.getIds(fakeUser(), `${id1},${id2}`);
      expect(mockFavoritesService.getFavoriteIds).toHaveBeenCalledWith(
        'user-1', [id1, id2],
      );
      expect(result.ids).toContain(id1);
    });

    it('returns empty ids array when ids param is absent', async () => {
      mockFavoritesService.getFavoriteIds.mockResolvedValueOnce(new Set());
      const result = await ctrl.getIds(fakeUser(), undefined);
      expect(mockFavoritesService.getFavoriteIds).toHaveBeenCalledWith('user-1', []);
      expect(result.ids).toEqual([]);
    });

    it('filters out empty tokens from the split', async () => {
      mockFavoritesService.getFavoriteIds.mockResolvedValueOnce(new Set());
      await ctrl.getIds(fakeUser(), ',,,');
      const [, parsed] = mockFavoritesService.getFavoriteIds.mock.calls[0];
      expect(parsed).toHaveLength(0);
    });
  });

  // ── add() ──────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('delegates to favoritesService.add with userId and templeId', async () => {
      const result = await ctrl.add(fakeUser(), TEMPLE_UUID);
      expect(mockFavoritesService.add).toHaveBeenCalledWith('user-1', TEMPLE_UUID);
      expect(result).toEqual({ added: true });
    });

    it('returns { added: false } on idempotent repeat (already favorited)', async () => {
      mockFavoritesService.add.mockResolvedValueOnce({ added: false });
      const result = await ctrl.add(fakeUser(), TEMPLE_UUID);
      expect(result.added).toBe(false);
    });
  });

  // ── remove() ───────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('delegates to favoritesService.remove with userId and templeId', async () => {
      const result = await ctrl.remove(fakeUser(), TEMPLE_UUID);
      expect(mockFavoritesService.remove).toHaveBeenCalledWith('user-1', TEMPLE_UUID);
      expect(result).toEqual({ removed: true });
    });
  });
});
