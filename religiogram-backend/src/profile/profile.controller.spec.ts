import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

function fakeRow(userId = 'user-1', overrides: any = {}): any {
  return {
    userId,
    step:      1,
    data:      { name: 'Alice' },
    completed: false,
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

const mockProfileService = {
  get:         jest.fn().mockResolvedValue(fakeRow()),
  createOrGet: jest.fn().mockResolvedValue(fakeRow()),
  update:      jest.fn().mockResolvedValue(fakeRow()),
};

function fakeUser(id = 'user-1', role = 'seeker'): any { return { id, role }; }

const ADMIN_USER_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ProfileController', () => {
  let ctrl: ProfileController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: mockProfileService }],
    }).compile();

    ctrl = module.get<ProfileController>(ProfileController);
  });

  // ── getMine() ──────────────────────────────────────────────────────────────

  describe('getMine()', () => {
    it('delegates to profileService.get with userId', async () => {
      const result = await ctrl.getMine(fakeUser());
      expect(mockProfileService.get).toHaveBeenCalledWith('user-1');
      expect(result.userId).toBe('user-1');
    });

    it('serialises updatedAt to ISO string', async () => {
      const result = await ctrl.getMine(fakeUser());
      expect(typeof result.updatedAt).toBe('string');
      expect(result.updatedAt).toContain('2024-01-01');
    });

    it('returns empty object for data when data is null', async () => {
      mockProfileService.get.mockResolvedValueOnce(fakeRow('user-1', { data: null }));
      const result = await ctrl.getMine(fakeUser());
      expect(result.data).toEqual({});
    });
  });

  // ── createMine() ───────────────────────────────────────────────────────────

  describe('createMine()', () => {
    it('delegates to profileService.createOrGet with userId and dto', async () => {
      const dto: any = { step: 1, data: { name: 'Alice' } };
      await ctrl.createMine(fakeUser(), dto);
      expect(mockProfileService.createOrGet).toHaveBeenCalledWith('user-1', dto);
    });

    it('returns serialised profile row', async () => {
      const result = await ctrl.createMine(fakeUser(), {} as any);
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('step');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('updatedAt');
    });
  });

  // ── updateMine() ───────────────────────────────────────────────────────────

  describe('updateMine()', () => {
    it('delegates to profileService.update with userId and dto', async () => {
      const dto: any = { data: { name: 'Bob' } };
      await ctrl.updateMine(fakeUser(), dto);
      expect(mockProfileService.update).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── getById() (admin) ──────────────────────────────────────────────────────

  describe('getById()', () => {
    it('returns profile when caller is admin', async () => {
      mockProfileService.get.mockResolvedValueOnce(fakeRow(ADMIN_USER_UUID));
      const result = await ctrl.getById(fakeUser('admin-1', 'admin'), ADMIN_USER_UUID);
      expect(mockProfileService.get).toHaveBeenCalledWith(ADMIN_USER_UUID);
      expect(result.userId).toBe(ADMIN_USER_UUID);
    });

    it('throws ForbiddenException when caller is not admin (belt-and-braces)', async () => {
      await expect(
        ctrl.getById(fakeUser('user-1', 'seeker'), ADMIN_USER_UUID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
