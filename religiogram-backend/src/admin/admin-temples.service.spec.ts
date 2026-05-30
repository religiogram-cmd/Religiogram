import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminTemplesService } from './admin-temples.service';
import { Temple } from '../temples/entities/temple.entity';
import { RedisService } from '../redis/redis.service';

// ── QB factory ────────────────────────────────────────────────────────────────

function makeListQB(
  getManyAndCount = jest.fn().mockResolvedValue([[], 0]),
) {
  const qb: any = {
    andWhere:        jest.fn().mockReturnThis(),
    orderBy:         jest.fn().mockReturnThis(),
    skip:            jest.fn().mockReturnThis(),
    take:            jest.fn().mockReturnThis(),
    getManyAndCount,
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeTemple(overrides: any = {}): Temple {
  return {
    id:          'temple-1',
    name:        'Kashi Vishwanath',
    city:        'varanasi',
    state:       'UP',
    address:     '123 Vishwanath Gali',
    lat:         25.3109,
    lng:         83.0107,
    ratingAvg:   4.7,
    ratingCount: 500,
    hours:       '6am-8pm',
    deity:       'Shiva',
    isVerified:  true,
    imageUrl:    null,
    createdAt:   new Date('2024-01-01T00:00:00Z'),
    updatedAt:   new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  } as unknown as Temple;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let listQB = makeListQB();

const mockTempleRepo = {
  createQueryBuilder: jest.fn(() => listQB),
  findOne:  jest.fn().mockResolvedValue(null),
  delete:   jest.fn().mockResolvedValue({ affected: 1 }),
  // query is used for raw SQL: findSimilarInCity + INSERT
  query:    jest.fn(),
};

const mockRedis = {
  incr: jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminTemplesService', () => {
  let svc: AdminTemplesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    listQB = makeListQB();
    mockTempleRepo.createQueryBuilder.mockReturnValue(listQB);
    // Default: findOne returns a temple (needed for getOne inside create/update)
    mockTempleRepo.findOne.mockResolvedValue(makeTemple());
    // Default query: no near-duplicate found, INSERT returns id
    mockTempleRepo.query
      .mockResolvedValueOnce([])                    // findSimilarInCity → no dup
      .mockResolvedValueOnce([{ id: 'temple-1' }]); // INSERT RETURNING id
    mockRedis.incr.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTemplesService,
        { provide: getRepositoryToken(Temple), useValue: mockTempleRepo },
        { provide: RedisService,               useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<AdminTemplesService>(AdminTemplesService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto = {
      name:       'Kashi Vishwanath',
      city:       'varanasi',
      lat:        25.3109,
      lng:        83.0107,
      isVerified: false,
    };

    it('throws ConflictException when a near-duplicate exists in the same city', async () => {
      // Override: similarity query returns a near-dup
      mockTempleRepo.query.mockReset();
      mockTempleRepo.query.mockResolvedValueOnce([
        { id: 'existing-1', name: 'Shri Kashi Vishwanath Temple', similarity: 0.78 },
      ]);

      await expect(svc.create(dto)).rejects.toThrow(ConflictException);
    });

    it('includes existingTempleId in ConflictException details', async () => {
      mockTempleRepo.query.mockReset();
      mockTempleRepo.query.mockResolvedValueOnce([
        { id: 'existing-1', name: 'Shri Kashi Vishwanath Temple', similarity: 0.78 },
      ]);

      let err: any;
      try { await svc.create(dto); } catch (e) { err = e; }
      expect(err.response.existingTempleId).toBe('existing-1');
      expect(err.response.code).toBe('TEMPLE_NEAR_DUPLICATE');
    });

    it('bypasses duplicate check when force=true', async () => {
      // Reset to insert-only sequence (no similarity call when force=true
      // means similarity query is skipped entirely; 1st query is the INSERT)
      mockTempleRepo.query.mockReset();
      mockTempleRepo.query.mockResolvedValueOnce([{ id: 'temple-new' }]);
      mockTempleRepo.findOne.mockResolvedValueOnce(makeTemple({ id: 'temple-new' }));

      const result = await svc.create({ ...dto, force: true });
      // query called once (INSERT only, no similarity check)
      expect(mockTempleRepo.query).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('temple-new');
    });

    it('calls raw INSERT query with ST_SetSRID', async () => {
      await svc.create(dto);

      const insertCall = mockTempleRepo.query.mock.calls.find((c: any[]) =>
        c[0].includes('INSERT INTO temples'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[0]).toContain('ST_SetSRID');
    });

    it('bumps the cache version after a successful insert', async () => {
      await svc.create(dto);
      expect(mockRedis.incr).toHaveBeenCalledWith('temples:cache:version');
    });

    it('returns AdminTempleDto with id matching the inserted row', async () => {
      const result = await svc.create(dto);
      expect(result.id).toBe('temple-1');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws NotFoundException when temple does not exist', async () => {
      mockTempleRepo.findOne
        .mockResolvedValueOnce(null);  // initial existence check
      await expect(svc.update('bad-id', { name: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing DTO without querying DB when patch is empty', async () => {
      // findOne called for the check, then again inside getOne
      const temple = makeTemple();
      mockTempleRepo.findOne
        .mockResolvedValueOnce(temple)   // update check
        .mockResolvedValueOnce(temple);  // getOne

      const result = await svc.update('temple-1', {});
      // No raw query needed for empty update
      expect(mockTempleRepo.query).not.toHaveBeenCalled();
      expect(result.id).toBe('temple-1');
    });

    it('executes raw UPDATE with dynamic SET clause for scalar fields', async () => {
      const temple = makeTemple();
      mockTempleRepo.findOne
        .mockResolvedValueOnce(temple)   // update check
        .mockResolvedValueOnce(temple);  // getOne
      mockTempleRepo.query.mockResolvedValueOnce(undefined); // UPDATE

      await svc.update('temple-1', { name: 'New Name', city: 'prayagraj' });

      expect(mockTempleRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE temples SET'),
        expect.arrayContaining(['New Name', 'prayagraj', 'temple-1']),
      );
    });

    it('includes ST_SetSRID in SET clause when coords are updated', async () => {
      const temple = makeTemple();
      mockTempleRepo.findOne
        .mockResolvedValueOnce(temple)
        .mockResolvedValueOnce(temple);
      mockTempleRepo.query.mockResolvedValueOnce(undefined);

      await svc.update('temple-1', { lat: 26.0, lng: 82.0 });

      const updateCall = mockTempleRepo.query.mock.calls[0];
      expect(updateCall[0]).toContain('ST_SetSRID');
      expect(updateCall[1]).toContain(26.0);
      expect(updateCall[1]).toContain(82.0);
    });

    it('bumps cache version after a successful update', async () => {
      const temple = makeTemple();
      mockTempleRepo.findOne
        .mockResolvedValueOnce(temple)
        .mockResolvedValueOnce(temple);
      mockTempleRepo.query.mockResolvedValueOnce(undefined);

      await svc.update('temple-1', { name: 'Updated' });
      expect(mockRedis.incr).toHaveBeenCalledWith('temples:cache:version');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws NotFoundException when temple does not exist', async () => {
      mockTempleRepo.delete.mockResolvedValueOnce({ affected: 0 });
      await expect(svc.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns { id, deleted: true } on success', async () => {
      mockTempleRepo.delete.mockResolvedValueOnce({ affected: 1 });
      const result = await svc.remove('temple-1');
      expect(result).toEqual({ id: 'temple-1', deleted: true });
    });

    it('bumps cache version after removal', async () => {
      mockTempleRepo.delete.mockResolvedValueOnce({ affected: 1 });
      await svc.remove('temple-1');
      expect(mockRedis.incr).toHaveBeenCalledWith('temples:cache:version');
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list()', () => {
    const baseDto = { page: 1, limit: 20 };

    it('returns empty result when no temples match', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      const result = await svc.list(baseDto as any);
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('returns mapped items and total', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[makeTemple()], 1]);
      const result = await svc.list(baseDto as any);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('temple-1');
    });

    it('applies ILIKE search filter when search is provided', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.list({ ...baseDto, search: 'kashi' } as any);
      expect(listQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ like: '%kashi%' }),
      );
    });

    it('applies city filter when city is provided', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.list({ ...baseDto, city: 'varanasi' } as any);
      expect(listQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(t.city)'),
        expect.objectContaining({ city: 'varanasi' }),
      );
    });

    it('filters out unverified temples by default', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.list(baseDto as any);
      expect(listQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('t.isVerified = true'),
      );
    });

    it('does not add isVerified filter when includeUnverified=true', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.list({ ...baseDto, includeUnverified: true } as any);
      const calls: any[][] = listQB.andWhere.mock.calls;
      const hasVerifiedFilter = calls.some((c) =>
        typeof c[0] === 'string' && c[0].includes('t.isVerified'),
      );
      expect(hasVerifiedFilter).toBe(false);
    });

    it('calculates hasMore correctly when results fill the page', async () => {
      // total=21, page=1, limit=20 → hasMore=true
      listQB.getManyAndCount.mockResolvedValueOnce([
        Array(20).fill(makeTemple()),
        21,
      ]);
      const result = await svc.list(baseDto as any);
      expect(result.hasMore).toBe(true);
    });

    it('passes correct skip/take for page 2', async () => {
      listQB.getManyAndCount.mockResolvedValueOnce([[], 0]);
      await svc.list({ page: 2, limit: 10 } as any);
      expect(listQB.skip).toHaveBeenCalledWith(10);
      expect(listQB.take).toHaveBeenCalledWith(10);
    });
  });

  // ── getOne ─────────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('throws NotFoundException when temple does not exist', async () => {
      mockTempleRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getOne('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns a well-formed AdminTempleDto', async () => {
      mockTempleRepo.findOne.mockResolvedValueOnce(makeTemple());
      const result = await svc.getOne('temple-1');
      expect(result.id).toBe('temple-1');
      expect(result.name).toBe('Kashi Vishwanath');
      expect(typeof result.lat).toBe('number');
      expect(typeof result.lng).toBe('number');
      expect(typeof result.createdAt).toBe('string');
    });
  });

  // ── bustCaches ─────────────────────────────────────────────────────────────

  describe('bustCaches() — non-fatal on Redis failure', () => {
    it('does not throw when Redis.incr rejects', async () => {
      mockRedis.incr.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // remove() calls bustCaches internally; a Redis failure must not block it
      mockTempleRepo.delete.mockResolvedValueOnce({ affected: 1 });
      await expect(svc.remove('temple-1')).resolves.toBeDefined();
    });
  });
});
