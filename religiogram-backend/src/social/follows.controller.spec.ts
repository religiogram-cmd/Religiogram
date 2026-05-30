import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FollowsController } from './follows.controller';
import { FollowEntity, FolloweeType } from './entities/follow.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFollowRepo = {
  findOne: jest.fn(),
  create:  jest.fn(),
  save:    jest.fn(),
  remove:  jest.fn(),
  find:    jest.fn(),
  count:   jest.fn(),
};

function fakeReq(userId = 'user-1'): any {
  return { user: { sub: userId } };
}

const FOLLOW_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROV_UUID   = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FollowsController', () => {
  let ctrl: FollowsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FollowsController],
      providers: [
        { provide: getRepositoryToken(FollowEntity), useValue: mockFollowRepo },
      ],
    }).compile();

    ctrl = module.get<FollowsController>(FollowsController);
  });

  // ── follow() ──────────────────────────────────────────────────────────────

  describe('follow()', () => {
    it('returns existing follow when already following (upsert silently)', async () => {
      const existing = { id: FOLLOW_UUID, followerId: 'user-1' };
      mockFollowRepo.findOne.mockResolvedValueOnce(existing);
      const dto: any = { followeeType: FolloweeType.PROVIDER, followeeId: PROV_UUID };
      const result = await ctrl.follow(fakeReq(), dto);
      expect(result).toBe(existing);
      expect(mockFollowRepo.save).not.toHaveBeenCalled();
    });

    it('creates and saves a new follow when not yet following', async () => {
      mockFollowRepo.findOne.mockResolvedValueOnce(null);
      const newFollow = { id: FOLLOW_UUID };
      mockFollowRepo.create.mockReturnValueOnce(newFollow);
      mockFollowRepo.save.mockResolvedValueOnce(newFollow);

      const dto: any = { followeeType: FolloweeType.PROVIDER, followeeId: PROV_UUID };
      const result = await ctrl.follow(fakeReq('user-2'), dto);

      expect(mockFollowRepo.create).toHaveBeenCalledWith({
        followerId: 'user-2',
        followeeType: FolloweeType.PROVIDER,
        followeeId: PROV_UUID,
      });
      expect(mockFollowRepo.save).toHaveBeenCalledWith(newFollow);
      expect(result).toBe(newFollow);
    });

    it('throws when req.user.sub is absent', async () => {
      const dto: any = { followeeType: FolloweeType.PROVIDER, followeeId: PROV_UUID };
      await expect(ctrl.follow({ user: {} } as any, dto)).rejects.toThrow('Missing auth context');
    });
  });

  // ── unfollow() ────────────────────────────────────────────────────────────

  describe('unfollow()', () => {
    it('removes the follow and returns {success:true}', async () => {
      const existing = { id: FOLLOW_UUID, followerId: 'user-1' };
      mockFollowRepo.findOne.mockResolvedValueOnce(existing);
      mockFollowRepo.remove.mockResolvedValueOnce(undefined);

      const result = await ctrl.unfollow(fakeReq(), FOLLOW_UUID);
      expect(mockFollowRepo.remove).toHaveBeenCalledWith(existing);
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when follow not found', async () => {
      mockFollowRepo.findOne.mockResolvedValueOnce(null);
      await expect(ctrl.unfollow(fakeReq(), FOLLOW_UUID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── myFollowing() ─────────────────────────────────────────────────────────

  describe('myFollowing()', () => {
    it('returns {items} from repo.find', async () => {
      const items = [{ id: 'f-1' }, { id: 'f-2' }];
      mockFollowRepo.find.mockResolvedValueOnce(items);

      const result = await ctrl.myFollowing(fakeReq('user-3'));
      expect(mockFollowRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { followerId: 'user-3' } }),
      );
      expect(result).toEqual({ items });
    });
  });

  // ── followerCount() ───────────────────────────────────────────────────────

  describe('followerCount()', () => {
    it('delegates to repo.count with followeeType and followeeId', async () => {
      mockFollowRepo.count.mockResolvedValueOnce(42);
      const result = await ctrl.followerCount(FolloweeType.PROVIDER, PROV_UUID);
      expect(mockFollowRepo.count).toHaveBeenCalledWith({
        where: { followeeType: FolloweeType.PROVIDER, followeeId: PROV_UUID },
      });
      expect(result).toEqual({ count: 42 });
    });
  });
});
