import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { FeedService } from './feed.service';
import { FeedItem } from './entities/feed-item.entity';
import { Friendship } from './entities/friendship.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';

// ── QueryBuilder factory ───────────────────────────────────────────────────────

function makeQB(getMany: any = jest.fn().mockResolvedValue([])) {
  const qb: any = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect:  jest.fn().mockReturnThis(),
    where:              jest.fn().mockReturnThis(),
    andWhere:           jest.fn().mockReturnThis(),
    orderBy:            jest.fn().mockReturnThis(),
    addOrderBy:         jest.fn().mockReturnThis(),
    take:               jest.fn().mockReturnThis(),
    select:             jest.fn().mockReturnThis(),
    delete:             jest.fn().mockReturnThis(),
    from:               jest.fn().mockReturnThis(),
    execute:            jest.fn().mockResolvedValue({ affected: 0 }),
    getMany,
    getRawMany:         jest.fn().mockResolvedValue([]),
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

function makePost() {
  return {
    id:        'post-1',
    content:   'Hello',
    isDeleted: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    author:    { id: 'user-1', username: 'u1', profileImageUrl: null },
    mediaUrl:  null,
  };
}

function makeFeedItem() {
  return {
    postId:        'post-1',
    postCreatedAt: new Date('2025-01-01T00:00:00Z'),
    post:          makePost(),
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let feedQB = makeQB(jest.fn().mockResolvedValue([]));
let likesQB = makeQB();

const mockFeedItemsRepo = {
  createQueryBuilder: jest.fn(() => feedQB),
  insert: jest.fn().mockReturnValue({ into: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ orIgnore: jest.fn().mockReturnValue({ execute: jest.fn().mockResolvedValue({ affected: 1 }) }) }) }) }),
};

const mockFriendshipsRepo = {
  createQueryBuilder: jest.fn(() => makeQB()),
  find: jest.fn().mockResolvedValue([]),
};

const mockPostsRepo = {
  createQueryBuilder: jest.fn(() => makeQB()),
};

const mockLikesRepo = {
  createQueryBuilder: jest.fn(() => likesQB),
};

const mockDs = {
  query: jest.fn().mockResolvedValue([]),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FeedService', () => {
  let svc: FeedService;

  beforeEach(async () => {
    jest.clearAllMocks();
    feedQB  = makeQB(jest.fn().mockResolvedValue([]));
    likesQB = makeQB();
    likesQB.getRawMany = jest.fn().mockResolvedValue([]);

    mockFeedItemsRepo.createQueryBuilder.mockReturnValue(feedQB);
    mockLikesRepo.createQueryBuilder.mockReturnValue(likesQB);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        { provide: getRepositoryToken(FeedItem),   useValue: mockFeedItemsRepo },
        { provide: getRepositoryToken(Friendship),  useValue: mockFriendshipsRepo },
        { provide: getRepositoryToken(Post),        useValue: mockPostsRepo },
        { provide: getRepositoryToken(PostLike),    useValue: mockLikesRepo },
        { provide: getDataSourceToken(),            useValue: mockDs },
      ],
    }).compile();

    svc = module.get<FeedService>(FeedService);
  });

  // ── getTimeline ────────────────────────────────────────────────────────────

  describe('getTimeline()', () => {
    it('returns empty timeline when no feed items exist', async () => {
      feedQB.getMany.mockResolvedValueOnce([]);
      const result = await svc.getTimeline('viewer-1');
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('returns items with correct hasMore=false when under limit', async () => {
      feedQB.getMany.mockResolvedValueOnce([makeFeedItem()]);
      const result = await svc.getTimeline('viewer-1', undefined, 20);
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('sets hasMore=true and trims last item when result exceeds limit', async () => {
      // Returning safeLimit+1 items signals more data
      const items = Array.from({ length: 21 }, (_, i) => ({
        ...makeFeedItem(),
        postId: `post-${i}`,
        postCreatedAt: new Date(),
        post: { ...makePost(), id: `post-${i}` },
      }));
      feedQB.getMany.mockResolvedValueOnce(items);

      const result = await svc.getTimeline('viewer-1', undefined, 20);
      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('clamps limit to 50 maximum', async () => {
      feedQB.getMany.mockResolvedValueOnce([]);
      await svc.getTimeline('viewer-1', undefined, 200);
      expect(feedQB.take).toHaveBeenCalledWith(51); // 50+1
    });

    it('clamps limit to 1 minimum', async () => {
      feedQB.getMany.mockResolvedValueOnce([]);
      await svc.getTimeline('viewer-1', undefined, 0);
      expect(feedQB.take).toHaveBeenCalledWith(2); // 1+1
    });

    it('throws for an invalid base64 cursor', async () => {
      await expect(svc.getTimeline('viewer-1', 'not-valid-base64!!')).rejects.toThrow();
    });

    it('applies cursor filter when a valid cursor is provided', async () => {
      // Build a valid cursor from a known date + id
      const cursor = Buffer.from(
        JSON.stringify({ d: '2025-01-01T00:00:00.000Z', i: 'post-1' }),
      ).toString('base64url');

      feedQB.getMany.mockResolvedValueOnce([]);
      await svc.getTimeline('viewer-1', cursor, 20);
      // andWhere should be called at least once for the cursor condition
      expect(feedQB.andWhere).toHaveBeenCalled();
    });

    it('marks liked posts from the viewerʼs likes', async () => {
      const item = makeFeedItem();
      feedQB.getMany.mockResolvedValueOnce([item]);
      likesQB.getRawMany.mockResolvedValueOnce([{ l_post_id: 'post-1' }]);

      const result = await svc.getTimeline('viewer-1');
      const firstItem = result.items[0] as any;
      expect(firstItem.isLikedByViewer).toBe(true);
    });

    it('does not query likes table when feed is empty', async () => {
      feedQB.getMany.mockResolvedValueOnce([]);
      await svc.getTimeline('viewer-1');
      expect(mockLikesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
