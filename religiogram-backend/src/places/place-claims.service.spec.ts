import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PlaceClaimsService } from './place-claims.service';
import { PlaceClaim, ClaimStatus } from './entities/place-claim.entity';
import { Temple } from '../temples/entities/temple.entity';
import { PlacesService } from './places.service';
import { DataSource } from 'typeorm';

// ── QB factory ────────────────────────────────────────────────────────────────

function makeQB() {
  const qb: any = {
    leftJoin:    jest.fn().mockReturnThis(),
    select:      jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    andWhere:    jest.fn().mockReturnThis(),
    orderBy:     jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    getRawMany:  jest.fn().mockResolvedValue([]),
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeClaim(overrides: any = {}): PlaceClaim {
  return {
    id:            'claim-1',
    placeId:       'place-1',
    userId:        'user-1',
    status:        'pending' as ClaimStatus,
    claimEvidence: 'I am the pandit',
    contactEmail:  'user@example.com',
    contactPhone:  null,
    adminNotes:    null,
    reviewedAt:    null,
    createdAt:     new Date(),
    updatedAt:     new Date(),
    ...overrides,
  } as unknown as PlaceClaim;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let claimsQB = makeQB();

const mockClaimsRepo = {
  createQueryBuilder: jest.fn(() => claimsQB),
  findOne: jest.fn().mockResolvedValue(null),
  find:    jest.fn().mockResolvedValue([]),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeClaim(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeClaim(), ...d })),
};

const mockPlacesRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 'place-1', ownerId: null }),
};

const mockPlacesService = {
  bustCaches: jest.fn().mockResolvedValue(undefined),
};

// Transaction mock
const txSave = jest.fn().mockImplementation((e: any) => Promise.resolve(e));
const txGetRepository = jest.fn().mockReturnValue({ save: txSave, find: jest.fn().mockResolvedValue([]) });
const mockTxManager = { save: txSave, getRepository: txGetRepository };
const mockDs = {
  transaction: jest.fn().mockImplementation((fn: (em: any) => Promise<any>) => fn(mockTxManager)),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlaceClaimsService', () => {
  let svc: PlaceClaimsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    claimsQB = makeQB();
    mockClaimsRepo.createQueryBuilder.mockReturnValue(claimsQB);
    mockClaimsRepo.findOne.mockResolvedValue(null);
    mockPlacesRepo.findOne.mockResolvedValue({ id: 'place-1', ownerId: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceClaimsService,
        { provide: getRepositoryToken(PlaceClaim), useValue: mockClaimsRepo },
        { provide: getRepositoryToken(Temple),     useValue: mockPlacesRepo },
        { provide: PlacesService,                  useValue: mockPlacesService },
        { provide: DataSource,                     useValue: mockDs },
      ],
    }).compile();

    svc = module.get<PlaceClaimsService>(PlaceClaimsService);
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('throws BadRequestException when both contactEmail and contactPhone are absent', async () => {
      await expect(svc.submit('place-1', 'user-1', {
        claimEvidence: 'evidence',
      } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when place does not exist', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.submit('nonexistent', 'user-1', {
        claimEvidence: 'evidence', contactEmail: 'a@b.com',
      })).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when place already has an owner', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce({ id: 'place-1', ownerId: 'other-user' });
      await expect(svc.submit('place-1', 'user-1', {
        claimEvidence: 'evidence', contactEmail: 'a@b.com',
      })).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user already has a pending claim', async () => {
      mockClaimsRepo.findOne.mockResolvedValueOnce(makeClaim({ status: 'pending' }));
      await expect(svc.submit('place-1', 'user-1', {
        claimEvidence: 'evidence', contactEmail: 'a@b.com',
      })).rejects.toThrow(ConflictException);
    });

    it('creates and returns a new claim when all conditions are met', async () => {
      const result = await svc.submit('place-1', 'user-1', {
        claimEvidence: 'I am the legitimate priest',
        contactEmail: 'priest@temple.com',
      });
      expect(mockClaimsRepo.save).toHaveBeenCalled();
      expect(result.status).toBe('pending');
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe('withdraw()', () => {
    it('throws NotFoundException when no pending claim exists', async () => {
      mockClaimsRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.withdraw('place-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('sets claim status to withdrawn and saves', async () => {
      const claim = makeClaim({ status: 'pending' });
      mockClaimsRepo.findOne.mockResolvedValueOnce(claim);

      const result = await svc.withdraw('place-1', 'user-1');
      expect(result.success).toBe(true);
      expect(mockClaimsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'withdrawn' }),
      );
    });
  });

  // ── myStatus ───────────────────────────────────────────────────────────────

  describe('myStatus()', () => {
    it('returns null when user has no claim', async () => {
      mockClaimsRepo.findOne.mockResolvedValueOnce(null);
      expect(await svc.myStatus('place-1', 'user-1')).toBeNull();
    });

    it('returns DTO for the most recent claim', async () => {
      mockClaimsRepo.findOne.mockResolvedValueOnce(makeClaim());
      const result = await svc.myStatus('place-1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('pending');
    });
  });

  // ── listMine ───────────────────────────────────────────────────────────────

  describe('listMine()', () => {
    it('returns empty array when user has no claims', async () => {
      mockClaimsRepo.find.mockResolvedValueOnce([]);
      expect(await svc.listMine('user-1')).toEqual([]);
    });

    it('returns all claims for the user', async () => {
      mockClaimsRepo.find.mockResolvedValueOnce([makeClaim(), makeClaim({ id: 'claim-2' })]);
      const result = await svc.listMine('user-1');
      expect(result).toHaveLength(2);
    });
  });

  // ── listForAdmin ───────────────────────────────────────────────────────────

  describe('listForAdmin()', () => {
    it('returns empty array when no claims match', async () => {
      claimsQB.getRawMany.mockResolvedValueOnce([]);
      expect(await svc.listForAdmin()).toEqual([]);
    });

    it('applies status filter when provided', async () => {
      claimsQB.getRawMany.mockResolvedValueOnce([]);
      await svc.listForAdmin('approved' as ClaimStatus);
      expect(claimsQB.where).toHaveBeenCalledWith('c.status = :status', { status: 'approved' });
    });
  });
});
