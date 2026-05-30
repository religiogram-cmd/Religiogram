import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockUsersService = {
  findById:                jest.fn(),
  updateProfile:           jest.fn(),
  updateRole:              jest.fn(),
  checkUsernameAvailable:  jest.fn(),
  suggestUsernames:        jest.fn(),
  setupProfile:            jest.fn(),
  searchByUsernameOrName:  jest.fn(),
  deleteAccount:           jest.fn(),
};

function fakeUser(id = 'user-1', role = 'seeker'): any {
  return { id, role };
}

function fakeDbUser(overrides: any = {}): any {
  return {
    id:              'user-1',
    phone:           '+919876543210',
    email:           'test@example.com',
    name:            'Test User',
    role:            'seeker',
    avatarUrl:       null,
    isVerified:      false,
    profileComplete: false,
    createdAt:       new Date('2024-01-01'),
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UsersController', () => {
  let ctrl: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    ctrl = module.get<UsersController>(UsersController);
  });

  // ── me() ───────────────────────────────────────────────────────────────────

  describe('me()', () => {
    it('throws NotFoundException when user is not found', async () => {
      mockUsersService.findById.mockResolvedValueOnce(null);
      await expect(ctrl.me(fakeUser())).rejects.toThrow(NotFoundException);
    });

    it('returns safe fields and omits sensitive data', async () => {
      mockUsersService.findById.mockResolvedValueOnce(
        fakeDbUser({ email: 'a@b.com', name: 'Alice' }),
      );
      const result = await ctrl.me(fakeUser());
      expect(result.id).toBe('user-1');
      expect(result.email).toBe('a@b.com');
      expect(result.name).toBe('Alice');
      expect(result.role).toBe('seeker');
      expect((result as any).password).toBeUndefined();
      expect((result as any).refreshTokenHash).toBeUndefined();
    });

    it('calls findById with the current user id', async () => {
      mockUsersService.findById.mockResolvedValueOnce(fakeDbUser());
      await ctrl.me(fakeUser('user-42'));
      expect(mockUsersService.findById).toHaveBeenCalledWith('user-42');
    });

    it('response contains isVerified and profileComplete', async () => {
      mockUsersService.findById.mockResolvedValueOnce(
        fakeDbUser({ isVerified: true, profileComplete: true }),
      );
      const result = await ctrl.me(fakeUser());
      expect(result.isVerified).toBe(true);
      expect(result.profileComplete).toBe(true);
    });
  });

  // ── updateMe() ─────────────────────────────────────────────────────────────

  describe('updateMe()', () => {
    it('delegates to usersService.updateProfile with userId and dto', async () => {
      const dto = { name: 'New Name', email: 'new@example.com' };
      mockUsersService.updateProfile.mockResolvedValueOnce(
        fakeDbUser({ name: 'New Name', email: 'new@example.com' }),
      );
      const result = await ctrl.updateMe(fakeUser(), dto as any);
      expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
      expect(result.name).toBe('New Name');
      expect(result.email).toBe('new@example.com');
    });

    it('returns only id, name, email, avatarUrl', async () => {
      mockUsersService.updateProfile.mockResolvedValueOnce(
        fakeDbUser({ avatarUrl: 'https://cdn.example.com/photo.jpg' }),
      );
      const result = await ctrl.updateMe(fakeUser(), {} as any);
      expect(Object.keys(result).sort()).toEqual(['avatarUrl', 'email', 'id', 'name']);
    });
  });

  // ── updateRole() ───────────────────────────────────────────────────────────

  describe('updateRole()', () => {
    it('delegates to usersService.updateRole and returns id + role', async () => {
      mockUsersService.updateRole.mockResolvedValueOnce(
        fakeDbUser({ role: 'advisor' }),
      );
      const result = await ctrl.updateRole(fakeUser(), { role: 'advisor' } as any);
      expect(mockUsersService.updateRole).toHaveBeenCalledWith('user-1', 'advisor');
      expect(result).toEqual({ id: 'user-1', role: 'advisor' });
    });
  });

  // ── checkUsername() ────────────────────────────────────────────────────────

  describe('checkUsername()', () => {
    it('delegates to usersService.checkUsernameAvailable', () => {
      mockUsersService.checkUsernameAvailable.mockReturnValue({ available: true });
      const result = ctrl.checkUsername('alice');
      expect(mockUsersService.checkUsernameAvailable).toHaveBeenCalledWith('alice');
      expect(result).toEqual({ available: true });
    });
  });

  // ── suggestUsernames() ─────────────────────────────────────────────────────

  describe('suggestUsernames()', () => {
    it('delegates with the provided base string', () => {
      mockUsersService.suggestUsernames.mockReturnValue(['alice123', 'alice456']);
      ctrl.suggestUsernames('alice');
      expect(mockUsersService.suggestUsernames).toHaveBeenCalledWith('alice');
    });

    it('defaults to "user" when base is absent', () => {
      mockUsersService.suggestUsernames.mockReturnValue([]);
      ctrl.suggestUsernames(undefined as any);
      expect(mockUsersService.suggestUsernames).toHaveBeenCalledWith('user');
    });
  });

  // ── setupProfile() ─────────────────────────────────────────────────────────

  describe('setupProfile()', () => {
    it('delegates to usersService.setupProfile with userId and dto', async () => {
      const dto = { username: 'alice_dev', name: 'Alice' };
      mockUsersService.setupProfile.mockResolvedValueOnce({ ...fakeDbUser(), username: 'alice_dev' });
      await ctrl.setupProfile(fakeUser(), dto as any);
      expect(mockUsersService.setupProfile).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── searchUsers() ──────────────────────────────────────────────────────────

  describe('searchUsers()', () => {
    it('delegates with query string and caller id from req.user', async () => {
      const req: any = { user: { id: 'user-1' } };
      mockUsersService.searchByUsernameOrName.mockResolvedValueOnce([]);
      await ctrl.searchUsers('alice', req);
      expect(mockUsersService.searchByUsernameOrName).toHaveBeenCalledWith('alice', 'user-1');
    });

    it('passes empty string for q when undefined', async () => {
      const req: any = { user: { id: 'user-1' } };
      mockUsersService.searchByUsernameOrName.mockResolvedValueOnce([]);
      await ctrl.searchUsers(undefined as any, req);
      expect(mockUsersService.searchByUsernameOrName).toHaveBeenCalledWith('', 'user-1');
    });

    it('passes empty string for caller id when req.user is absent', async () => {
      const req: any = {};
      mockUsersService.searchByUsernameOrName.mockResolvedValueOnce([]);
      await ctrl.searchUsers('query', req);
      expect(mockUsersService.searchByUsernameOrName).toHaveBeenCalledWith('query', '');
    });
  });

  // ── deleteMe() ─────────────────────────────────────────────────────────────

  describe('deleteMe()', () => {
    it('delegates to usersService.deleteAccount with userId', async () => {
      mockUsersService.deleteAccount.mockResolvedValueOnce(undefined);
      await ctrl.deleteMe(fakeUser());
      expect(mockUsersService.deleteAccount).toHaveBeenCalledWith('user-1');
    });
  });
});
