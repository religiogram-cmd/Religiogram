import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from './entities/profile.entity';
import { UsersService } from '../users/users.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id:        'profile-1',
    userId:    USER_ID,
    step:      0,
    data:      {},
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Profile;
}

// ── QueryBuilder mock for createOrGet (INSERT … orIgnore) ────────────────────

const insertQB: any = {
  insert:    jest.fn().mockReturnThis(),
  into:      jest.fn().mockReturnThis(),
  values:    jest.fn().mockReturnThis(),
  orIgnore:  jest.fn().mockReturnThis(),
  execute:   jest.fn().mockResolvedValue({ identifiers: [] }),
};

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRepo = {
  findOne:       jest.fn().mockResolvedValue(null),
  findOneOrFail: jest.fn().mockResolvedValue(makeProfile()),
  query:         jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue(insertQB),
};

const mockUsers = {
  findById:            jest.fn().mockResolvedValue({ id: USER_ID }),
  markProfileComplete: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ProfileService', () => {
  let svc: ProfileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.findOneOrFail.mockResolvedValue(makeProfile());
    mockRepo.createQueryBuilder.mockReturnValue(insertQB);
    mockUsers.findById.mockResolvedValue({ id: USER_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(Profile), useValue: mockRepo },
        { provide: UsersService,                useValue: mockUsers },
      ],
    }).compile();

    svc = module.get<ProfileService>(ProfileService);
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns the profile when it exists', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile());
      const result = await svc.get(USER_ID);
      expect(result.userId).toBe(USER_ID);
    });

    it('throws NotFoundException when no profile row exists', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.get(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── createOrGet ────────────────────────────────────────────────────────────

  describe('createOrGet()', () => {
    const dto = { step: 0, data: { religion: 'hinduism' }, completed: false };

    it('throws NotFoundException when user does not exist', async () => {
      mockUsers.findById.mockResolvedValueOnce(null);
      await expect(svc.createOrGet(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when data exceeds 16 KB', async () => {
      const bigData: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) bigData[`key_${i}`] = 'x'.repeat(20);
      await expect(
        svc.createOrGet(USER_ID, { data: bigData } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('executes INSERT … orIgnore and returns the canonical row', async () => {
      const result = await svc.createOrGet(USER_ID, dto as any);
      expect(insertQB.execute).toHaveBeenCalled();
      expect(mockRepo.findOneOrFail).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result.userId).toBe(USER_ID);
    });

    it('defaults step=0, data={}, completed=false when not provided in dto', async () => {
      await svc.createOrGet(USER_ID, {} as any);
      expect(insertQB.values).toHaveBeenCalledWith(
        expect.objectContaining({ step: 0, data: {}, completed: false }),
      );
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('delegates to createOrGet when no profile exists yet', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      const spy = jest.spyOn(svc, 'createOrGet').mockResolvedValueOnce(makeProfile());

      await svc.update(USER_ID, { step: 1 } as any);
      expect(spy).toHaveBeenCalled();
    });

    it('returns existing profile unchanged when patch is empty', async () => {
      const existing = makeProfile({ step: 2 });
      mockRepo.findOne.mockResolvedValueOnce(existing);

      const result = await svc.update(USER_ID, {} as any);
      expect(mockRepo.query).not.toHaveBeenCalled();
      expect(result.step).toBe(2);
    });

    it('issues UPDATE with step when step is provided', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile());

      await svc.update(USER_ID, { step: 3 } as any);

      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('step'),
        expect.any(Array),
      );
    });

    it('issues UPDATE with JSONB merge when data is provided', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile());

      await svc.update(USER_ID, { data: { name: 'Ravi' } } as any);

      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('data || CAST'),
        expect.any(Array),
      );
    });

    it('does NOT flip completed back to false (one-way flag)', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile({ completed: true }));

      await svc.update(USER_ID, { completed: false } as any);

      // completed = false should not be in any SET clause
      const [sql] = mockRepo.query.mock.calls[0] ?? [''];
      expect(sql).not.toContain('completed = false');
    });

    it('sets completed=true and mirrors the flag on the user row', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile({ completed: false }));

      await svc.update(USER_ID, { completed: true } as any);

      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('completed = true'),
        expect.any(Array),
      );
      expect(mockUsers.markProfileComplete).toHaveBeenCalledWith(USER_ID, true);
    });

    it('does NOT call markProfileComplete when profile was already completed', async () => {
      // already completed — updating with completed=true should be a no-op on user
      mockRepo.findOne.mockResolvedValueOnce(makeProfile({ completed: true }));

      await svc.update(USER_ID, { completed: true } as any);
      expect(mockUsers.markProfileComplete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when data payload exceeds 16 KB', async () => {
      const bigData: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) bigData[`key_${i}`] = 'x'.repeat(20);
      await expect(
        svc.update(USER_ID, { data: bigData } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('non-fatally handles markProfileComplete failure', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeProfile({ completed: false }));
      mockUsers.markProfileComplete.mockRejectedValueOnce(new Error('Redis down'));

      // Should NOT throw — the warn is logged and execution continues
      await expect(
        svc.update(USER_ID, { completed: true } as any),
      ).resolves.not.toThrow();
    });
  });
});
