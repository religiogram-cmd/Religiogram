import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { PartmanService } from './partman.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDs = { query: jest.fn() };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PartmanService', () => {
  let svc: PartmanService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: partition does not exist → 'created' path
    mockDs.query
      .mockResolvedValueOnce([{ exists: false }]) // pg_class check
      .mockResolvedValue(undefined);              // CREATE TABLE + subsequent checks

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartmanService,
        { provide: getDataSourceToken(), useValue: mockDs },
      ],
    }).compile();

    svc = module.get<PartmanService>(PartmanService);
  });

  // ── createUpcomingPartitions ───────────────────────────────────────────────

  describe('createUpcomingPartitions()', () => {
    beforeEach(() => {
      // 4 tables × 3 months = 12 partition checks
      // Alternate exists/create to give a realistic mix
      mockDs.query.mockReset();
      for (let i = 0; i < 12; i++) {
        mockDs.query
          .mockResolvedValueOnce([{ exists: false }]) // pg_class: does not exist
          .mockResolvedValueOnce(undefined);           // CREATE TABLE
      }
    });

    it('resolves without throwing', async () => {
      await expect(svc.createUpcomingPartitions()).resolves.not.toThrow();
    });

    it('issues pg_class check queries for each table × month', async () => {
      await svc.createUpcomingPartitions();
      // 4 tables × 3 months = 12 pg_class checks + 12 CREATE TABLE = 24 calls
      // But query alternates: check / create / check / create ...
      const checkCalls = mockDs.query.mock.calls.filter(([sql]) =>
        String(sql).includes('pg_class'),
      );
      expect(checkCalls).toHaveLength(12); // 4 tables × 3 months ahead
    });

    it('runs CREATE TABLE for each non-existing partition', async () => {
      await svc.createUpcomingPartitions();
      const createCalls = mockDs.query.mock.calls.filter(([sql]) =>
        String(sql).includes('CREATE TABLE'),
      );
      expect(createCalls).toHaveLength(12);
    });

    it('skips CREATE TABLE when partition already exists', async () => {
      mockDs.query.mockReset();
      // All 12 checks return exists=true
      for (let i = 0; i < 12; i++) {
        mockDs.query.mockResolvedValueOnce([{ exists: true }]);
      }
      await svc.createUpcomingPartitions();
      const createCalls = mockDs.query.mock.calls.filter(([sql]) =>
        String(sql).includes('CREATE TABLE'),
      );
      expect(createCalls).toHaveLength(0);
    });

    it('CREATE TABLE SQL uses IF NOT EXISTS for idempotency', async () => {
      await svc.createUpcomingPartitions();
      const createCall = mockDs.query.mock.calls.find(([sql]) =>
        String(sql).includes('CREATE TABLE'),
      );
      expect(createCall![0]).toContain('IF NOT EXISTS');
    });

    it('partition name follows table_YYYY_MM format', async () => {
      await svc.createUpcomingPartitions();
      const createCalls = mockDs.query.mock.calls.filter(([sql]) =>
        String(sql).includes('CREATE TABLE'),
      );
      // Each CREATE TABLE SQL should contain a partition name like bookings_2026_07
      for (const [sql] of createCalls) {
        expect(String(sql)).toMatch(/"[a-z_]+_\d{4}_\d{2}"/);
      }
    });
  });

  // ── runNow() ───────────────────────────────────────────────────────────────

  describe('runNow()', () => {
    it('returns created and alreadyExists counts', async () => {
      // 4 tables × 4 offsets (0..3) = 16 checks
      // Alternate: 8 exist, 8 created
      mockDs.query.mockReset();
      for (let i = 0; i < 16; i++) {
        const exists = i % 2 === 0;
        mockDs.query.mockResolvedValueOnce([{ exists }]);
        if (!exists) mockDs.query.mockResolvedValueOnce(undefined); // CREATE TABLE
      }

      const result = await svc.runNow();
      expect(typeof result.created).toBe('number');
      expect(typeof result.alreadyExists).toBe('number');
      expect(result.created + result.alreadyExists).toBe(16);
    });

    it('does not throw when a partition creation fails', async () => {
      mockDs.query.mockReset();
      mockDs.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockRejectedValueOnce(new Error('partition already attached'))  // CREATE fails
        .mockResolvedValue([{ exists: true }]); // rest succeed

      await expect(svc.runNow()).resolves.not.toThrow();
    });
  });

  // ── _ensurePartition error resilience ─────────────────────────────────────

  describe('_ensurePartition() error handling', () => {
    it('returns "exists" (not throws) when CREATE TABLE raises an error', async () => {
      mockDs.query.mockReset();
      mockDs.query
        .mockResolvedValueOnce([{ exists: false }])
        .mockRejectedValueOnce(new Error('DB error'));

      // runNow calls _ensurePartition internally; should still complete
      mockDs.query
        .mockResolvedValue([{ exists: true }]);

      await expect(svc.runNow()).resolves.not.toThrow();
    });
  });
});
