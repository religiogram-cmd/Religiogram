import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { UserFavorite } from './entities/user-favorite.entity';
import { Temple } from '../temples/entities/temple.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const USER_ID   = 'user-1';
const TEMPLE_ID = 'temple-1';

function makeTemple(id = TEMPLE_ID): Partial<Temple> {
  return { id } as any;
}

function makeRawRow(templeId = TEMPLE_ID) {
  return {
    id:           templeId,
    name:         'Shri Test Mandir',
    city:         'Jaipur',
    state:        'Rajasthan',
    address:      '123 Main Street',
    lat:          '26.9124',
    lng:          '75.7873',
    rating_avg:   '4.50',
    rating_count: 22,
    hours:        '06:00–21:00',
    deity:        'Ganesh',
    is_verified:  true,
    image_url:    'https://cdn.example.com/img.jpg',
    favourited_at: new Date('2025-01-15T10:00:00.000Z'),
  };
}

// ── QueryBuilder mock (for getFavoriteIds) ────────────────────────────────────

const favQB: any = {
  select:    jest.fn().mockReturnThis(),
  where:     jest.fn().mockReturnThis(),
  andWhere:  jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([{ templeId: TEMPLE_ID }]),
};

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFavoritesRepo = {
  query:              jest.fn().mockResolvedValue([{ added: true }]),
  delete:             jest.fn().mockResolvedValue({ affected: 1 }),
  count:              jest.fn().mockResolvedValue(3),
  createQueryBuilder: jest.fn().mockReturnValue(favQB),
};

const mockTemplesRepo = {
  findOne: jest.fn().mockResolvedValue(makeTemple()),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FavoritesService', () => {
  let svc: FavoritesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTemplesRepo.findOne.mockResolvedValue(makeTemple());
    mockFavoritesRepo.query.mockResolvedValue([{ added: true }]);
    mockFavoritesRepo.delete.mockResolvedValue({ affected: 1 });
    favQB.getRawMany.mockResolvedValue([{ templeId: TEMPLE_ID }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: getRepositoryToken(UserFavorite), useValue: mockFavoritesRepo },
        { provide: getRepositoryToken(Temple),       useValue: mockTemplesRepo },
      ],
    }).compile();

    svc = module.get<FavoritesService>(FavoritesService);
  });

  // ── add ────────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('returns added=true when INSERT creates a new row', async () => {
      mockFavoritesRepo.query.mockResolvedValueOnce([{ added: true }]);
      const result = await svc.add(USER_ID, TEMPLE_ID);
      expect(result).toEqual({ added: true });
    });

    it('returns added=false when INSERT is a no-op (already favorited)', async () => {
      mockFavoritesRepo.query.mockResolvedValueOnce([]); // 0 rows returned = conflict
      const result = await svc.add(USER_ID, TEMPLE_ID);
      expect(result).toEqual({ added: false });
    });

    it('throws NotFoundException when temple does not exist', async () => {
      mockTemplesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.add(USER_ID, 'bad-temple')).rejects.toThrow(NotFoundException);
    });

    it('does NOT issue INSERT when temple is not found', async () => {
      mockTemplesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.add(USER_ID, 'bad-temple')).rejects.toThrow(NotFoundException);
      expect(mockFavoritesRepo.query).not.toHaveBeenCalled();
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('returns removed=true when a row is deleted', async () => {
      mockFavoritesRepo.delete.mockResolvedValueOnce({ affected: 1 });
      const result = await svc.remove(USER_ID, TEMPLE_ID);
      expect(result).toEqual({ removed: true });
    });

    it('returns removed=false when nothing was deleted (idempotent)', async () => {
      mockFavoritesRepo.delete.mockResolvedValueOnce({ affected: 0 });
      const result = await svc.remove(USER_ID, TEMPLE_ID);
      expect(result).toEqual({ removed: false });
    });

    it('deletes with the correct userId and templeId', async () => {
      await svc.remove(USER_ID, TEMPLE_ID);
      expect(mockFavoritesRepo.delete).toHaveBeenCalledWith({
        userId: USER_ID,
        templeId: TEMPLE_ID,
      });
    });
  });

  // ── getFavoriteIds ─────────────────────────────────────────────────────────

  describe('getFavoriteIds()', () => {
    it('returns an empty Set when templeIds array is empty', async () => {
      const result = await svc.getFavoriteIds(USER_ID, []);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      expect(mockFavoritesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns a Set of favorited temple IDs', async () => {
      favQB.getRawMany.mockResolvedValueOnce([
        { templeId: 'temple-1' },
        { templeId: 'temple-2' },
      ]);
      const result = await svc.getFavoriteIds(USER_ID, ['temple-1', 'temple-2', 'temple-3']);
      expect(result.has('temple-1')).toBe(true);
      expect(result.has('temple-2')).toBe(true);
      expect(result.has('temple-3')).toBe(false);
    });

    it('filters by userId in the query', async () => {
      await svc.getFavoriteIds(USER_ID, [TEMPLE_ID]);
      expect(favQB.where).toHaveBeenCalledWith(
        expect.stringContaining('user_id'),
        expect.objectContaining({ userId: USER_ID }),
      );
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns mapped FavoriteTempleDto array', async () => {
      const raw = makeRawRow();
      mockFavoritesRepo.query.mockResolvedValueOnce([raw]);

      const result = await svc.list(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(raw.id);
      expect(result[0].ratingAvg).toBe(4.5);
      expect(result[0].lat).toBe(26.9124);
      expect(result[0].lng).toBe(75.7873);
      expect(result[0].isVerified).toBe(true);
    });

    it('maps null rating_avg to null ratingAvg', async () => {
      const raw = { ...makeRawRow(), rating_avg: null };
      mockFavoritesRepo.query.mockResolvedValueOnce([raw]);

      const result = await svc.list(USER_ID);
      expect(result[0].ratingAvg).toBeNull();
    });

    it('returns favouritedAt as ISO string', async () => {
      mockFavoritesRepo.query.mockResolvedValueOnce([makeRawRow()]);
      const result = await svc.list(USER_ID);
      expect(result[0].favouritedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns empty array when user has no favorites', async () => {
      mockFavoritesRepo.query.mockResolvedValueOnce([]);
      const result = await svc.list(USER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ── count ──────────────────────────────────────────────────────────────────

  describe('count()', () => {
    it('returns count from repository', async () => {
      mockFavoritesRepo.count.mockResolvedValueOnce(7);
      const result = await svc.count(USER_ID);
      expect(result).toBe(7);
    });

    it('queries with the correct userId', async () => {
      await svc.count(USER_ID);
      expect(mockFavoritesRepo.count).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });
  });
});
