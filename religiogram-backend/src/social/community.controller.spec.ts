import { Test, TestingModule } from '@nestjs/testing';
import { CommunityController } from './community.controller';
import { SocialService } from './social.service';
import { StoryService } from './story.service';
import { FeedService } from './feed.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSocialService = {
  getFriends: jest.fn().mockResolvedValue([
    { id: 'friend-1' },
    { id: 'friend-2' },
  ]),
};

const mockStoryService = {
  getFriendsStories: jest.fn().mockResolvedValue([]),
  createStory:       jest.fn().mockResolvedValue({ id: 'story-1' }),
  markViewed:        jest.fn().mockResolvedValue(undefined),
};

const mockFeedService = {
  getTimeline: jest.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
};

function fakeReq(userId = 'user-1'): any { return { user: { id: userId } }; }

const STORY_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CommunityController', () => {
  let ctrl: CommunityController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        { provide: SocialService, useValue: mockSocialService },
        { provide: StoryService,  useValue: mockStoryService },
        { provide: FeedService,   useValue: mockFeedService },
      ],
    }).compile();

    ctrl = module.get<CommunityController>(CommunityController);
  });

  // ── getFeed() ─────────────────────────────────────────────────────────────

  describe('getFeed()', () => {
    it('delegates to feed.getTimeline with uid, cursor, limit', async () => {
      const result = await ctrl.getFeed(fakeReq('u-5'), 'cur-abc', 15);
      expect(mockFeedService.getTimeline).toHaveBeenCalledWith('u-5', 'cur-abc', 15);
      expect(result).toHaveProperty('items');
    });

    it('passes undefined cursor when absent', async () => {
      await ctrl.getFeed(fakeReq(), undefined, 20);
      expect(mockFeedService.getTimeline).toHaveBeenCalledWith('user-1', undefined, 20);
    });
  });

  // ── getFriendsStories() ───────────────────────────────────────────────────

  describe('getFriendsStories()', () => {
    it('fetches friend ids then calls stories.getFriendsStories', async () => {
      await ctrl.getFriendsStories(fakeReq('u-6'));
      expect(mockSocialService.getFriends).toHaveBeenCalledWith('u-6');
      expect(mockStoryService.getFriendsStories).toHaveBeenCalledWith(
        'u-6',
        ['friend-1', 'friend-2'],
      );
    });

    it('passes empty friendIds array when user has no friends', async () => {
      mockSocialService.getFriends.mockResolvedValueOnce([]);
      await ctrl.getFriendsStories(fakeReq('u-7'));
      expect(mockStoryService.getFriendsStories).toHaveBeenCalledWith('u-7', []);
    });
  });

  // ── createStory() ─────────────────────────────────────────────────────────

  describe('createStory()', () => {
    it('delegates to stories.createStory with uid and dto', async () => {
      const dto: any = { mediaUrl: 'https://cdn.example.com/story.jpg' };
      const result = await ctrl.createStory(dto, fakeReq('u-8'));
      expect(mockStoryService.createStory).toHaveBeenCalledWith('u-8', dto);
      expect(result).toHaveProperty('id', 'story-1');
    });
  });

  // ── markStoryViewed() ─────────────────────────────────────────────────────

  describe('markStoryViewed()', () => {
    it('delegates to stories.markViewed with storyId and uid', async () => {
      await ctrl.markStoryViewed(STORY_UUID, fakeReq('u-9'));
      expect(mockStoryService.markViewed).toHaveBeenCalledWith(STORY_UUID, 'u-9');
    });
  });
});
