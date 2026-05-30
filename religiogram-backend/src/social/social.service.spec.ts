import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { Friendship } from './entities/friendship.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { User } from '../users/entities/user.entity';
import { FeedService } from './feed.service';
import { FeatureFlagsService } from '../common/feature-flags/feature-flags.service';
import { DomainEventPublisher } from '../events/domain-event-publisher';
import { QUEUE } from '../common/queues/queue.constants';

// ── stubs ─────────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';
const POST_ID = 'post-1';
const FRIENDSHIP_ID = 'fs-1';

function makePost(overrides: any = {}): Post {
  return {
    id:            POST_ID,
    authorId:      USER_A,
    caption:       'Test post',
    imageUrls:     [],
    isDeleted:     false,
    likesCount:    0,
    commentsCount: 0,
    createdAt:     new Date(),
    ...overrides,
  } as unknown as Post;
}

function makeFriendship(overrides: any = {}): Friendship {
  return {
    id:          FRIENDSHIP_ID,
    requesterId: USER_A,
    addresseeId: USER_B,
    status:      'accepted',
    ...overrides,
  } as unknown as Friendship;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const feedQB: any = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where:             jest.fn().mockReturnThis(),
  andWhere:          jest.fn().mockReturnThis(),
  orderBy:           jest.fn().mockReturnThis(),
  skip:              jest.fn().mockReturnThis(),
  take:              jest.fn().mockReturnThis(),
  getManyAndCount:   jest.fn().mockResolvedValue([[makePost()], 1]),
  update:            jest.fn().mockReturnThis(),
  set:               jest.fn().mockReturnThis(),
  execute:           jest.fn().mockResolvedValue({ affected: 1 }),
  select:            jest.fn().mockReturnThis(),
  addSelect:         jest.fn().mockReturnThis(),
  groupBy:           jest.fn().mockReturnThis(),
  getRawMany:        jest.fn().mockResolvedValue([]),
};

const mockPostsRepo = {
  findOne:       jest.fn().mockResolvedValue(makePost()),
  findAndCount:  jest.fn().mockResolvedValue([[makePost()], 1]),
  create:        jest.fn().mockImplementation((d: any) => ({ ...makePost(), ...d })),
  save:          jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  remove:        jest.fn().mockResolvedValue(undefined),
  increment:     jest.fn().mockResolvedValue(undefined),
  decrement:     jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue(feedQB),
};

const mockFriendshipsRepo = {
  findOne:       jest.fn().mockResolvedValue(null),
  find:          jest.fn().mockResolvedValue([makeFriendship()]),
  findAndCount:  jest.fn().mockResolvedValue([[makeFriendship()], 1]),
  create:        jest.fn().mockImplementation((d: any) => d),
  save:          jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  remove:        jest.fn().mockResolvedValue(undefined),
};

const mockLikesRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find:    jest.fn().mockResolvedValue([]),
  create:  jest.fn().mockImplementation((d: any) => d),
  save:    jest.fn().mockResolvedValue({ id: 'like-1' }),
  remove:  jest.fn().mockResolvedValue(undefined),
};

const mockCommentsRepo = {
  findOne:      jest.fn().mockResolvedValue({ id: 'cmt-1', authorId: USER_A, postId: POST_ID, content: 'Nice', isDeleted: false }),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  create:       jest.fn().mockImplementation((d: any) => d),
  save:         jest.fn().mockImplementation((d: any) => Promise.resolve({ id: 'cmt-1', ...d })),
};

const mockDmsRepo = {
  create:        jest.fn().mockImplementation((d: any) => d),
  save:          jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  createQueryBuilder: jest.fn().mockReturnValue(feedQB),
};

const mockUsersRepo = {
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
};

const mockFeed = {
  fanOut:                jest.fn().mockResolvedValue(undefined),
  backfillOnFriendship:  jest.fn().mockResolvedValue(undefined),
  pruneForUnfriend:      jest.fn().mockResolvedValue(undefined),
};

const mockFlags = {
  isEnabled: jest.fn().mockResolvedValue(false),
};

const mockEvents = {
  publishPostPublished: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

const mockFanOutQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SocialService', () => {
  let svc: SocialService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFlags.isEnabled.mockResolvedValue(false);
    mockLikesRepo.findOne.mockResolvedValue(null);
    mockFriendshipsRepo.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: getRepositoryToken(Friendship),    useValue: mockFriendshipsRepo },
        { provide: getRepositoryToken(Post),          useValue: mockPostsRepo },
        { provide: getRepositoryToken(PostLike),      useValue: mockLikesRepo },
        { provide: getRepositoryToken(PostComment),   useValue: mockCommentsRepo },
        { provide: getRepositoryToken(DirectMessage), useValue: mockDmsRepo },
        { provide: getRepositoryToken(User),          useValue: mockUsersRepo },
        { provide: FeedService,                       useValue: mockFeed },
        { provide: FeatureFlagsService,               useValue: mockFlags },
        { provide: DomainEventPublisher,              useValue: mockEvents },
        { provide: ConfigService,                     useValue: mockConfig },
        { provide: getQueueToken(QUEUE.FEED_FANOUT),  useValue: mockFanOutQueue },
      ],
    }).compile();

    svc = module.get<SocialService>(SocialService);
  });

  // ── createPost ─────────────────────────────────────────────────────────────

  describe('createPost()', () => {
    it('saves post, triggers sync fan-out, emits Kafka event', async () => {
      const dto = { caption: 'Hello world', imageUrls: [] };
      mockPostsRepo.save.mockResolvedValueOnce(makePost({ id: POST_ID }));

      await svc.createPost(USER_A, dto as any);

      expect(mockPostsRepo.save).toHaveBeenCalled();
      expect(mockEvents.publishPostPublished).toHaveBeenCalledWith(
        expect.objectContaining({ postId: POST_ID, authorId: USER_A }),
      );
      // Sync fan-out should be called (not async queue) since flag is off
      expect(mockFeed.fanOut).toHaveBeenCalled();
      expect(mockFanOutQueue.add).not.toHaveBeenCalled();
    });

    it('throws when post has neither caption nor images', async () => {
      await expect(
        svc.createPost(USER_A, { caption: '', imageUrls: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('enqueues async fan-out when ENABLE_ASYNC_FANOUT is on and author exceeds threshold', async () => {
      mockFlags.isEnabled.mockResolvedValueOnce(true);
      // friends count = 600, threshold = 500
      mockFriendshipsRepo.findAndCount.mockResolvedValueOnce([[], 600]);
      process.env.FEED_ASYNC_FANOUT_THRESHOLD = '500';
      mockPostsRepo.save.mockResolvedValueOnce(makePost());

      await svc.createPost(USER_A, { caption: 'Big post' } as any);

      expect(mockFanOutQueue.add).toHaveBeenCalledWith(
        'fan-out',
        expect.objectContaining({ postId: POST_ID, authorId: USER_A }),
        expect.any(Object),
      );
      expect(mockFeed.fanOut).not.toHaveBeenCalled();
      delete process.env.FEED_ASYNC_FANOUT_THRESHOLD;
    });
  });

  // ── toggleLike ─────────────────────────────────────────────────────────────

  describe('toggleLike()', () => {
    it('creates a like and increments count on first call', async () => {
      mockLikesRepo.findOne.mockResolvedValueOnce(null);
      const result = await svc.toggleLike(USER_A, POST_ID);
      expect(result).toEqual({ liked: true });
      expect(mockLikesRepo.save).toHaveBeenCalled();
      expect(mockPostsRepo.increment).toHaveBeenCalledWith({ id: POST_ID }, 'likesCount', 1);
    });

    it('removes the like and decrements count on second call (unlike)', async () => {
      mockLikesRepo.findOne.mockResolvedValueOnce({ id: 'like-1', userId: USER_A, postId: POST_ID });
      const result = await svc.toggleLike(USER_A, POST_ID);
      expect(result).toEqual({ liked: false });
      expect(mockLikesRepo.remove).toHaveBeenCalled();
      expect(mockPostsRepo.decrement).toHaveBeenCalledWith({ id: POST_ID }, 'likesCount', 1);
    });

    it('throws NotFoundException when post does not exist', async () => {
      mockPostsRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.toggleLike(USER_A, 'bad-post')).rejects.toThrow(NotFoundException);
    });
  });

  // ── addComment ─────────────────────────────────────────────────────────────

  describe('addComment()', () => {
    it('saves comment and increments commentsCount', async () => {
      await svc.addComment(USER_A, POST_ID, { content: 'Great post!' } as any);
      expect(mockCommentsRepo.save).toHaveBeenCalled();
      expect(mockPostsRepo.increment).toHaveBeenCalledWith({ id: POST_ID }, 'commentsCount', 1);
    });

    it('throws when post is deleted or not found', async () => {
      mockPostsRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.addComment(USER_A, POST_ID, { content: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteComment ──────────────────────────────────────────────────────────

  describe('deleteComment()', () => {
    it('soft-deletes comment owned by user', async () => {
      await svc.deleteComment(USER_A, 'cmt-1');
      expect(mockCommentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: true }),
      );
    });

    it('throws ForbiddenException when user does not own the comment', async () => {
      mockCommentsRepo.findOne.mockResolvedValueOnce({
        id: 'cmt-1', authorId: 'other-user', postId: POST_ID, isDeleted: false,
      });
      await expect(svc.deleteComment(USER_A, 'cmt-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── sendFriendRequest ──────────────────────────────────────────────────────

  describe('sendFriendRequest()', () => {
    it('creates a pending friendship', async () => {
      const result = await svc.sendFriendRequest(USER_A, USER_B);
      expect(mockFriendshipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', requesterId: USER_A, addresseeId: USER_B }),
      );
    });

    it('throws BadRequestException when adding yourself', async () => {
      await expect(svc.sendFriendRequest(USER_A, USER_A)).rejects.toThrow(BadRequestException);
    });

    it('throws when friendship already exists', async () => {
      mockFriendshipsRepo.findOne.mockResolvedValueOnce(makeFriendship());
      await expect(svc.sendFriendRequest(USER_A, USER_B)).rejects.toThrow(BadRequestException);
    });
  });

  // ── respondToRequest ───────────────────────────────────────────────────────

  describe('respondToRequest()', () => {
    it('accepts a friend request and triggers feed backfill', async () => {
      mockFriendshipsRepo.findOne.mockResolvedValueOnce(
        makeFriendship({ status: 'pending', addresseeId: USER_B }),
      );
      await svc.respondToRequest(USER_B, FRIENDSHIP_ID, true);
      expect(mockFriendshipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'accepted' }),
      );
      // backfill should be called (fire-and-forget, so just check it was invoked)
      expect(mockFeed.backfillOnFriendship).toHaveBeenCalled();
    });

    it('throws ForbiddenException when non-addressee tries to respond', async () => {
      mockFriendshipsRepo.findOne.mockResolvedValueOnce(
        makeFriendship({ status: 'pending', addresseeId: 'someone-else' }),
      );
      await expect(svc.respondToRequest(USER_B, FRIENDSHIP_ID, true)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── removeFriend ───────────────────────────────────────────────────────────

  describe('removeFriend()', () => {
    it('removes friendship and prunes feeds', async () => {
      mockFriendshipsRepo.findOne.mockResolvedValueOnce(
        makeFriendship({ requesterId: USER_A, addresseeId: USER_B }),
      );
      await svc.removeFriend(USER_A, FRIENDSHIP_ID);
      expect(mockFriendshipsRepo.remove).toHaveBeenCalled();
      expect(mockFeed.pruneForUnfriend).toHaveBeenCalledWith(USER_A, USER_B);
    });

    it('throws ForbiddenException when user is not part of the friendship', async () => {
      mockFriendshipsRepo.findOne.mockResolvedValueOnce(
        makeFriendship({ requesterId: 'other-1', addresseeId: 'other-2' }),
      );
      await expect(svc.removeFriend(USER_A, FRIENDSHIP_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe('deletePost()', () => {
    it('soft-deletes post owned by author', async () => {
      await svc.deletePost(USER_A, POST_ID);
      expect(mockPostsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: true }),
      );
    });

    it('throws ForbiddenException when non-author tries to delete', async () => {
      mockPostsRepo.findOne.mockResolvedValueOnce(makePost({ authorId: 'someone-else' }));
      await expect(svc.deletePost(USER_A, POST_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
