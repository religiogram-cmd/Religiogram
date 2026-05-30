import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { StoryService } from './story.service';
import { Story } from './entities/story.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id:               'story-1',
    authorId:         'user-1',
    mediaType:        'image',
    mediaUrl:         'https://cdn.example.com/story.jpg',
    textContent:      null,
    backgroundColor:  null,
    expiresAt:        new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt:        new Date(),
    author:           null as any,
    ...overrides,
  } as unknown as Story;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockStoryRepo = {
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeStory(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeStory(), ...d })),
  find:    jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete:  jest.fn().mockResolvedValue({ affected: 0 }),
};

const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('StoryService', () => {
  let svc: StoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStoryRepo.findOne.mockResolvedValue(null);
    mockStoryRepo.find.mockResolvedValue([]);
    mockDataSource.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoryService,
        { provide: getRepositoryToken(Story), useValue: mockStoryRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    svc = module.get<StoryService>(StoryService);
  });

  // ── createStory ────────────────────────────────────────────────────────────

  describe('createStory()', () => {
    it('saves the story and returns it', async () => {
      const result = await svc.createStory('user-1', {
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/s.jpg',
      });
      expect(mockStoryRepo.save).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('sets expiresAt to 24 hours from now', async () => {
      const before = Date.now();
      await svc.createStory('user-1', { textContent: 'Hello' });
      const [created] = mockStoryRepo.create.mock.calls[0];
      const expiresAt = created.expiresAt as Date;
      const delta = expiresAt.getTime() - before;
      // ~24h ± 1 second
      expect(delta).toBeGreaterThan(24 * 60 * 60 * 1000 - 1000);
      expect(delta).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
    });

    it('defaults mediaType to "text" when not provided', async () => {
      await svc.createStory('user-1', { textContent: 'Hi' });
      const [created] = mockStoryRepo.create.mock.calls[0];
      expect(created.mediaType).toBe('text');
    });

    it('does not set viewedBy on creation (moved to story_views table)', async () => {
      await svc.createStory('user-1', { mediaType: 'image', mediaUrl: 'u' });
      const [created] = mockStoryRepo.create.mock.calls[0];
      expect(created.viewedBy).toBeUndefined();
    });
  });

  // ── getFriendsStories ──────────────────────────────────────────────────────

  describe('getFriendsStories()', () => {
    it('includes the caller in the authorIds filter', async () => {
      await svc.getFriendsStories('user-1', ['friend-1', 'friend-2']);
      const [whereClause] = mockStoryRepo.find.mock.calls[0];
      const authorIds = (whereClause.where as any[]).map((w) => w.authorId);
      expect(authorIds).toContain('user-1');
      expect(authorIds).toContain('friend-1');
    });

    it('only fetches non-expired stories (expiresAt > now)', async () => {
      await svc.getFriendsStories('user-1', ['friend-1']);
      const [options] = mockStoryRepo.find.mock.calls[0];
      const firstWhere = (options.where as any[])[0];
      expect(firstWhere.expiresAt).toBeDefined();
    });

    it('returns empty array when no matching stories exist', async () => {
      mockStoryRepo.find.mockResolvedValueOnce([]);
      const result = await svc.getFriendsStories('user-1', []);
      expect(result).toEqual([]);
    });
  });

  // ── getStoryById ───────────────────────────────────────────────────────────

  describe('getStoryById()', () => {
    it('returns null when story is not found', async () => {
      mockStoryRepo.findOne.mockResolvedValueOnce(null);
      expect(await svc.getStoryById('nonexistent')).toBeNull();
    });

    it('returns the story when found', async () => {
      mockStoryRepo.findOne.mockResolvedValueOnce(makeStory());
      const result = await svc.getStoryById('story-1');
      expect(result!.id).toBe('story-1');
    });
  });

  // ── markViewed ─────────────────────────────────────────────────────────────

  describe('markViewed()', () => {
    it('inserts into story_views via DataSource query', async () => {
      await svc.markViewed('story-1', 'viewer-1');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO story_views'),
        ['story-1', 'viewer-1'],
      );
    });

    it('resolves without throwing', async () => {
      await expect(svc.markViewed('story-1', 'viewer-1')).resolves.not.toThrow();
    });
  });

  // ── hasViewed ──────────────────────────────────────────────────────────────

  describe('hasViewed()', () => {
    it('returns true when a row exists in story_views', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);
      expect(await svc.hasViewed('story-1', 'viewer-1')).toBe(true);
    });

    it('returns false when no row exists', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      expect(await svc.hasViewed('story-1', 'viewer-x')).toBe(false);
    });
  });

  // ── getViewCount ───────────────────────────────────────────────────────────

  describe('getViewCount()', () => {
    it('returns the count from story_views', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ cnt: '42' }]);
      expect(await svc.getViewCount('story-1')).toBe(42);
    });
  });

  // ── deleteExpired ──────────────────────────────────────────────────────────

  describe('deleteExpired()', () => {
    it('calls delete with expiresAt < now', async () => {
      await svc.deleteExpired();
      const [criteria] = mockStoryRepo.delete.mock.calls[0];
      expect(criteria).toHaveProperty('expiresAt');
    });

    it('resolves without throwing', async () => {
      await expect(svc.deleteExpired()).resolves.not.toThrow();
    });
  });
});
