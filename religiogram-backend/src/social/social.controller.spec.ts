import { Test, TestingModule } from '@nestjs/testing';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSocialService = {
  searchUsers:       jest.fn().mockResolvedValue([]),
  getFriends:        jest.fn().mockResolvedValue([]),
  getPendingRequests: jest.fn().mockResolvedValue([]),
  getSentRequests:   jest.fn().mockResolvedValue([]),
  sendFriendRequest: jest.fn().mockResolvedValue({ id: 'req-1' }),
  respondToRequest:  jest.fn().mockResolvedValue({ id: 'req-1', accepted: true }),
  removeFriend:      jest.fn().mockResolvedValue(undefined),
  getFeed:           jest.fn().mockResolvedValue({ items: [], total: 0 }),
  createPost:        jest.fn().mockResolvedValue({ id: 'post-1' }),
  getUserPosts:      jest.fn().mockResolvedValue({ items: [] }),
  toggleLike:        jest.fn().mockResolvedValue({ liked: true }),
  getComments:       jest.fn().mockResolvedValue({ items: [] }),
  addComment:        jest.fn().mockResolvedValue({ id: 'cmt-1' }),
  deletePost:        jest.fn().mockResolvedValue(undefined),
  deleteComment:     jest.fn().mockResolvedValue(undefined),
  getInbox:          jest.fn().mockResolvedValue([]),
  sendDm:            jest.fn().mockResolvedValue({ id: 'dm-1' }),
  getConversation:   jest.fn().mockResolvedValue({ messages: [] }),
};

function fakeReq(userId = 'user-1'): any { return { user: { id: userId } }; }

const POST_UUID  = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CMT_UUID   = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const OTHER_UUID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const REQ_UUID   = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SocialController', () => {
  let ctrl: SocialController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [{ provide: SocialService, useValue: mockSocialService }],
    }).compile();

    ctrl = module.get<SocialController>(SocialController);
  });

  // ── searchUsers() ─────────────────────────────────────────────────────────

  describe('searchUsers()', () => {
    it('delegates with q and caller uid', async () => {
      await ctrl.searchUsers('alice', fakeReq('user-5'));
      expect(mockSocialService.searchUsers).toHaveBeenCalledWith('alice', 'user-5');
    });

    it('defaults q to empty string when undefined', async () => {
      await ctrl.searchUsers(undefined as any, fakeReq());
      expect(mockSocialService.searchUsers).toHaveBeenCalledWith('', 'user-1');
    });

    it('uid falls back to empty string when req.user absent', async () => {
      await ctrl.searchUsers('x', {} as any);
      expect(mockSocialService.searchUsers).toHaveBeenCalledWith('x', '');
    });
  });

  // ── getFriends() ──────────────────────────────────────────────────────────

  describe('getFriends()', () => {
    it('delegates with caller uid', async () => {
      await ctrl.getFriends(fakeReq('u-2'));
      expect(mockSocialService.getFriends).toHaveBeenCalledWith('u-2');
    });
  });

  // ── getPending() ──────────────────────────────────────────────────────────

  describe('getPending()', () => {
    it('delegates with caller uid', async () => {
      await ctrl.getPending(fakeReq('u-3'));
      expect(mockSocialService.getPendingRequests).toHaveBeenCalledWith('u-3');
    });
  });

  // ── getSent() ─────────────────────────────────────────────────────────────

  describe('getSent()', () => {
    it('delegates with caller uid', async () => {
      await ctrl.getSent(fakeReq());
      expect(mockSocialService.getSentRequests).toHaveBeenCalledWith('user-1');
    });
  });

  // ── sendRequest() ─────────────────────────────────────────────────────────

  describe('sendRequest()', () => {
    it('delegates with uid and dto.userId', async () => {
      const dto: any = { userId: OTHER_UUID };
      await ctrl.sendRequest(dto, fakeReq('user-1'));
      expect(mockSocialService.sendFriendRequest).toHaveBeenCalledWith('user-1', OTHER_UUID);
    });
  });

  // ── acceptRequest() ───────────────────────────────────────────────────────

  describe('acceptRequest()', () => {
    it('delegates with uid, id, true', async () => {
      await ctrl.acceptRequest(REQ_UUID, fakeReq());
      expect(mockSocialService.respondToRequest).toHaveBeenCalledWith('user-1', REQ_UUID, true);
    });
  });

  // ── rejectRequest() ───────────────────────────────────────────────────────

  describe('rejectRequest()', () => {
    it('delegates with uid, id, false', async () => {
      await ctrl.rejectRequest(REQ_UUID, fakeReq());
      expect(mockSocialService.respondToRequest).toHaveBeenCalledWith('user-1', REQ_UUID, false);
    });
  });

  // ── removeFriend() ────────────────────────────────────────────────────────

  describe('removeFriend()', () => {
    it('delegates with uid and friend id', async () => {
      await ctrl.removeFriend(OTHER_UUID, fakeReq());
      expect(mockSocialService.removeFriend).toHaveBeenCalledWith('user-1', OTHER_UUID);
    });
  });

  // ── getFeed() ─────────────────────────────────────────────────────────────

  describe('getFeed()', () => {
    it('delegates with uid, page, limit', async () => {
      await ctrl.getFeed(fakeReq(), 2, 10);
      expect(mockSocialService.getFeed).toHaveBeenCalledWith('user-1', 2, 10);
    });
  });

  // ── createPost() ──────────────────────────────────────────────────────────

  describe('createPost()', () => {
    it('delegates with uid and dto', async () => {
      const dto: any = { text: 'Hello world' };
      await ctrl.createPost(dto, fakeReq());
      expect(mockSocialService.createPost).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── getUserPosts() ────────────────────────────────────────────────────────

  describe('getUserPosts()', () => {
    it('delegates with targetUserId, callerUid, page', async () => {
      await ctrl.getUserPosts(OTHER_UUID, fakeReq(), 3);
      expect(mockSocialService.getUserPosts).toHaveBeenCalledWith(OTHER_UUID, 'user-1', 3);
    });
  });

  // ── toggleLike() ──────────────────────────────────────────────────────────

  describe('toggleLike()', () => {
    it('delegates with uid and postId', async () => {
      await ctrl.toggleLike(POST_UUID, fakeReq());
      expect(mockSocialService.toggleLike).toHaveBeenCalledWith('user-1', POST_UUID);
    });
  });

  // ── getComments() ─────────────────────────────────────────────────────────

  describe('getComments()', () => {
    it('delegates with postId and page', async () => {
      await ctrl.getComments(POST_UUID, 1);
      expect(mockSocialService.getComments).toHaveBeenCalledWith(POST_UUID, 1);
    });
  });

  // ── addComment() ──────────────────────────────────────────────────────────

  describe('addComment()', () => {
    it('delegates with uid, postId, dto', async () => {
      const dto: any = { text: 'Great post!' };
      await ctrl.addComment(POST_UUID, dto, fakeReq());
      expect(mockSocialService.addComment).toHaveBeenCalledWith('user-1', POST_UUID, dto);
    });
  });

  // ── deletePost() ──────────────────────────────────────────────────────────

  describe('deletePost()', () => {
    it('delegates with uid and postId', async () => {
      await ctrl.deletePost(POST_UUID, fakeReq());
      expect(mockSocialService.deletePost).toHaveBeenCalledWith('user-1', POST_UUID);
    });
  });

  // ── deleteComment() ───────────────────────────────────────────────────────

  describe('deleteComment()', () => {
    it('delegates with uid and commentId', async () => {
      await ctrl.deleteComment(CMT_UUID, fakeReq());
      expect(mockSocialService.deleteComment).toHaveBeenCalledWith('user-1', CMT_UUID);
    });
  });

  // ── getInbox() ────────────────────────────────────────────────────────────

  describe('getInbox()', () => {
    it('delegates with uid', async () => {
      await ctrl.getInbox(fakeReq());
      expect(mockSocialService.getInbox).toHaveBeenCalledWith('user-1');
    });
  });

  // ── sendDm() ──────────────────────────────────────────────────────────────

  describe('sendDm()', () => {
    it('delegates with uid and dto', async () => {
      const dto: any = { recipientId: OTHER_UUID, text: 'Hey!' };
      await ctrl.sendDm(dto, fakeReq());
      expect(mockSocialService.sendDm).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── getConversation() ─────────────────────────────────────────────────────

  describe('getConversation()', () => {
    it('delegates with uid, targetUserId, page', async () => {
      await ctrl.getConversation(OTHER_UUID, fakeReq(), 2);
      expect(mockSocialService.getConversation).toHaveBeenCalledWith('user-1', OTHER_UUID, 2);
    });
  });
});
