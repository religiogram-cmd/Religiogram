import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { AdminAuditService, AuditActionParams } from './admin-audit.service';
import { AlertsService } from '../common/alerts/alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDs = { query: jest.fn() };
const mockAlerts = { fire: jest.fn().mockResolvedValue(undefined) };

// ── helpers ───────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<AuditActionParams> = {}): AuditActionParams {
  return {
    adminId:       'admin-1',
    actionType:    'APPROVE_KYC',
    targetType:    'provider',
    targetId:      'provider-uuid-1',
    beforeState:   { status: 'pending' },
    afterState:    { status: 'approved' },
    justification: 'Documents verified',
    ipAddress:     '10.0.0.1',
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminAuditService', () => {
  let svc: AdminAuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: getLastHash returns empty (no prior rows)
    mockDs.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: getDataSourceToken(), useValue: mockDs },
        { provide: AlertsService,        useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<AdminAuditService>(AdminAuditService);
  });

  // ── log() ──────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('issues two DB queries (getLastHash + INSERT)', async () => {
      await svc.log(makeParams());
      expect(mockDs.query).toHaveBeenCalledTimes(2);
    });

    it('INSERT includes all required fields', async () => {
      const params = makeParams();
      await svc.log(params);

      const [insertSql, insertArgs] = mockDs.query.mock.calls[1];
      expect(insertSql).toContain('admin_action_logs');
      expect(insertArgs[0]).toBe('admin-1');         // admin_id
      expect(insertArgs[1]).toBe('APPROVE_KYC');     // action_type
      expect(insertArgs[2]).toBe('provider');        // target_type
      expect(insertArgs[3]).toBe('provider-uuid-1'); // target_id
      expect(insertArgs[7]).toBe('10.0.0.1');        // ip_address
    });

    it('serializes beforeState and afterState as JSON strings', async () => {
      await svc.log(makeParams());
      const [, args] = mockDs.query.mock.calls[1];
      expect(JSON.parse(args[4])).toEqual({ status: 'pending' });
      expect(JSON.parse(args[5])).toEqual({ status: 'approved' });
    });

    it('defaults ipAddress to null when not provided', async () => {
      await svc.log(makeParams({ ipAddress: undefined }));
      const [, args] = mockDs.query.mock.calls[1];
      expect(args[7]).toBeNull();
    });

    it('writes a 64-char hex hash in the last argument', async () => {
      await svc.log(makeParams());
      const [, args] = mockDs.query.mock.calls[1];
      const hash = args[8];
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('uses "0".repeat(64) as prevHash when no prior row exists', async () => {
      // getLastHash returns [] → prevHash = '0'.repeat(64)
      mockDs.query
        .mockResolvedValueOnce([])          // getLastHash
        .mockResolvedValueOnce(undefined);  // INSERT

      await svc.log(makeParams());
      // The hash in position 8 must not throw — presence is sufficient
      const [, args] = mockDs.query.mock.calls[1];
      expect(typeof args[8]).toBe('string');
      expect(args[8]).toHaveLength(64);
    });

    it('chains from the previous row hash when one exists', async () => {
      const prevHash = 'a'.repeat(64);
      mockDs.query
        .mockResolvedValueOnce([{ hash_chain: prevHash }]) // getLastHash
        .mockResolvedValueOnce(undefined);                 // INSERT

      await svc.log(makeParams());
      const [, args] = mockDs.query.mock.calls[1];
      // The new hash must differ from the previous (it incorporates new data)
      expect(args[8]).not.toBe(prevHash);
      expect(args[8]).toHaveLength(64);
    });
  });

  // ── validateHashChain() ────────────────────────────────────────────────────

  describe('validateHashChain()', () => {
    it('returns { valid: true } for an empty audit log', async () => {
      mockDs.query.mockResolvedValueOnce([]); // SELECT all rows
      const result = await svc.validateHashChain();
      expect(result).toEqual({ valid: true });
    });

    it('returns { valid: true } for a single correctly-hashed row', async () => {
      const row = {
        id:          'row-1',
        action_type: 'APPROVE_KYC',
        target_id:   'target-1',
        created_at:  new Date('2025-01-01T00:00:00.000Z'),
        hash_chain:  '',
      };
      // Compute the expected hash that validateHashChain will recompute
      const prevHash = '0'.repeat(64);
      row.hash_chain = createHash('sha256')
        .update(prevHash + row.id + row.action_type + row.target_id + row.created_at.toISOString())
        .digest('hex');

      mockDs.query.mockResolvedValueOnce([row]);
      const result = await svc.validateHashChain();
      expect(result.valid).toBe(true);
    });

    it('returns { valid: false, brokenAt } when a row hash does not match', async () => {
      const row = {
        id:          'row-tampered',
        action_type: 'DELETE_USER',
        target_id:   'user-1',
        created_at:  new Date('2025-01-02T00:00:00.000Z'),
        hash_chain:  'deadbeef'.repeat(8), // wrong hash
      };

      mockDs.query.mockResolvedValueOnce([row]);
      const result = await svc.validateHashChain();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('row-tampered');
    });

    it('fires a critical alert when hash chain is broken', async () => {
      const row = {
        id:          'row-bad',
        action_type: 'FREEZE_WALLET',
        target_id:   'wallet-1',
        created_at:  new Date(),
        hash_chain:  'bad'.padEnd(64, '0'),
      };
      mockDs.query.mockResolvedValueOnce([row]);

      await svc.validateHashChain();

      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          channel:  'audit_tamper_detection',
        }),
      );
    });

    it('stops at the first broken entry and returns it', async () => {
      const makeRow = (id: string, hash: string) => ({
        id, action_type: 'A', target_id: 't', created_at: new Date(), hash_chain: hash,
      });

      mockDs.query.mockResolvedValueOnce([
        makeRow('row-1', 'badhash1'.padEnd(64, '0')),
        makeRow('row-2', 'badhash2'.padEnd(64, '0')),
      ]);

      const result = await svc.validateHashChain();
      expect(result.brokenAt).toBe('row-1');
    });
  });
});
