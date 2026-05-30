import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { RedisService } from '../redis/redis.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id:              USER_ID,
    phone:           '+919876543210',
    email:           'user@example.com',
    name:            'Test User',
    role:            'seeker',
    provider:        'phone',
    isVerified:      true,
    isActive:        true,
    googleId:        null as any,
    avatarUrl:       null as any,
    username:        null as any,
    bio:             null as any,
    passwordHash:    null as any,
    profileComplete: false,
    lastLoginAt:     new Date(),
    lastLoginIp:     null as any,
    lastDeviceId:    null as any,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  } as unknown as User;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne:       jest.fn().mockResolvedValue(null),
  findOneOrFail: jest.fn().mockResolvedValue(makeUser()),
  save:          jest.fn().mockImplementation((u: any) => Promise.resolve(u)),
  update:        jest.fn().mockResolvedValue({ affected: 1 }),
};

// Transaction EntityManager mock — can be reconfigured per-test
const txEm = {
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((_E: any, d: any) => d),
  save:    jest.fn().mockImplementation((_E: any, u: any) => Promise.resolve({ ...makeUser(), ...u })),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: any) => cb(txEm)),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let svc: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    txEm.findOne.mockResolvedValue(null);
    mockUsersRepo.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: RedisService,             useValue: mockRedis },
        { provide: getDataSourceToken(),     useValue: mockDataSource },
      ],
    }).compile();

    svc = module.get<UsersService>(UsersService);
  });

  // ── findOrCreateByPhone ────────────────────────────────────────────────────

  describe('findOrCreateByPhone()', () => {
    it('creates a new user and returns isNewUser=true when phone not found', async () => {
      txEm.findOne.mockResolvedValueOnce(null); // phone doesn't exist yet
      const { user, isNewUser } = await svc.findOrCreateByPhone('+919000000000');
      expect(isNewUser).toBe(true);
      expect(txEm.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ phone: '+919000000000', role: 'seeker' }),
      );
    });

    it('returns existing user and isNewUser=false when phone exists', async () => {
      const existing = makeUser();
      txEm.findOne.mockResolvedValueOnce(existing);
      const { user, isNewUser } = await svc.findOrCreateByPhone(existing.phone!);
      expect(isNewUser).toBe(false);
      expect(user.id).toBe(USER_ID);
      expect(txEm.create).not.toHaveBeenCalled();
    });

    it('updates lastLoginAt on every call', async () => {
      txEm.findOne.mockResolvedValueOnce(makeUser());
      await svc.findOrCreateByPhone('+919876543210');
      const savedArg = txEm.save.mock.calls[0][1];
      expect(savedArg.lastLoginAt).toBeDefined();
    });

    it('records lastLoginIp and lastDeviceId when provided', async () => {
      txEm.findOne.mockResolvedValueOnce(makeUser());
      await svc.findOrCreateByPhone('+919876543210', {
        lastLoginIp: '1.2.3.4',
        lastDeviceId: 'device-xyz',
      });
      const savedArg = txEm.save.mock.calls[0][1];
      expect(savedArg.lastLoginIp).toBe('1.2.3.4');
      expect(savedArg.lastDeviceId).toBe('device-xyz');
    });
  });

  // ── findOrCreateByGoogle ───────────────────────────────────────────────────

  describe('findOrCreateByGoogle()', () => {
    const profile = {
      googleId:  'google-123',
      email:     'user@example.com',
      name:      'Google User',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    it('creates new user when neither googleId nor email match', async () => {
      txEm.findOne.mockResolvedValue(null); // both lookups return null
      const { isNewUser } = await svc.findOrCreateByGoogle(profile);
      expect(isNewUser).toBe(true);
      expect(txEm.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ googleId: 'google-123', provider: 'google' }),
      );
    });

    it('links existing OTP user to Google account by email', async () => {
      const otpUser = makeUser({ googleId: null as any, email: profile.email });
      txEm.findOne
        .mockResolvedValueOnce(null)        // no match by googleId
        .mockResolvedValueOnce(otpUser);    // match by email

      const { isNewUser } = await svc.findOrCreateByGoogle(profile);
      expect(isNewUser).toBe(false);
      expect(txEm.save.mock.calls[0][1].googleId).toBe('google-123');
    });

    it('returns existing Google user without recreating', async () => {
      const existing = makeUser({ googleId: 'google-123' });
      txEm.findOne.mockResolvedValueOnce(existing);
      const { isNewUser } = await svc.findOrCreateByGoogle(profile);
      expect(isNewUser).toBe(false);
      expect(txEm.create).not.toHaveBeenCalled();
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile()', () => {
    it('updates name, email, avatarUrl and busts cache', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce(makeUser())   // findById
        .mockResolvedValueOnce(null);        // email uniqueness check (no conflict)

      await svc.updateProfile(USER_ID, { name: 'New Name', email: 'new@example.com' });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name', email: 'new@example.com' }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`user:cache:${USER_ID}`);
    });

    it('throws ConflictException when requested email is already taken by another user', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce(makeUser())           // findById
        .mockResolvedValueOnce(makeUser({ id: 'other-user' })); // email conflict

      await expect(
        svc.updateProfile(USER_ID, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.updateProfile('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('does not check email uniqueness when email is unchanged', async () => {
      const user = makeUser({ email: 'user@example.com' });
      mockUsersRepo.findOne.mockResolvedValueOnce(user);

      await svc.updateProfile(USER_ID, { email: 'user@example.com' });
      // findOne called once for findById, not again for email check
      expect(mockUsersRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  // ── updateRole ─────────────────────────────────────────────────────────────

  describe('updateRole()', () => {
    it('updates role from seeker to advisor', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(makeUser({ role: 'seeker' }));
      const result = await svc.updateRole(USER_ID, 'advisor');
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'advisor' }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`user:cache:${USER_ID}`);
    });

    it('throws BadRequestException when attempting to change admin role', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(makeUser({ role: 'admin' }));
      await expect(svc.updateRole(USER_ID, 'seeker')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid role value', async () => {
      await expect(svc.updateRole(USER_ID, 'superuser' as any)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.updateRole('bad-id', 'advisor')).rejects.toThrow(NotFoundException);
    });
  });

  // ── checkUsernameAvailable ────────────────────────────────────────────────

  describe('checkUsernameAvailable()', () => {
    it('returns available=true when username is not taken', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null);
      const result = await svc.checkUsernameAvailable('devotee99');
      expect(result).toEqual({ available: true });
    });

    it('returns available=false when username is already taken', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(makeUser({ username: 'devotee99' }));
      const result = await svc.checkUsernameAvailable('devotee99');
      expect(result).toEqual({ available: false });
    });

    it('sanitises the username before checking (lowercase, strip special chars)', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null);
      await svc.checkUsernameAvailable('DevoTee!@#99');
      // findOne should have been called with sanitised form
      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: { username: 'devotee99' },
      });
    });
  });

  // ── isBlocked ─────────────────────────────────────────────────────────────

  describe('isBlocked()', () => {
    it('returns true when phone is blocked in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce('1');
      expect(await svc.isBlocked('+919876543210')).toBe(true);
    });

    it('returns false when phone is not blocked', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      expect(await svc.isBlocked('+919876543210')).toBe(false);
    });
  });

  // ── markProfileComplete ───────────────────────────────────────────────────

  describe('markProfileComplete()', () => {
    it('updates flag and busts cache', async () => {
      await svc.markProfileComplete(USER_ID, true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        { id: USER_ID },
        { profileComplete: true },
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`user:cache:${USER_ID}`);
    });
  });

  // ── setupProfile ──────────────────────────────────────────────────────────

  describe('setupProfile()', () => {
    it('sets username, name, bio and marks profileComplete', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null); // username not taken
      mockUsersRepo.findOneOrFail.mockResolvedValueOnce(makeUser());

      await svc.setupProfile(USER_ID, {
        username: 'PureDevotee',
        name: 'Pure Devotee',
        bio: 'Seeker of truth',
      });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'puredevotee', // sanitised
          profileComplete: true,
        }),
      );
    });

    it('throws ConflictException when username is taken by another user', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(makeUser({ id: 'other-user' }));
      await expect(
        svc.setupProfile(USER_ID, { username: 'takenuser' }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows setting own username again (idempotent re-setup)', async () => {
      // findOne returns the SAME user (id matches)
      mockUsersRepo.findOne.mockResolvedValueOnce(makeUser({ username: 'myname' }));
      mockUsersRepo.findOneOrFail.mockResolvedValueOnce(makeUser({ username: 'myname' }));

      await expect(
        svc.setupProfile(USER_ID, { username: 'myname' }),
      ).resolves.not.toThrow();
    });
  });
});
