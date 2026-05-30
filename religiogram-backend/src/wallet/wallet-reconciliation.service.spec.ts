import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletHold, HoldStatus } from './entities/wallet-hold.entity';
import { AlertsService } from '../common/alerts/alerts.service';
import { WalletService } from './wallet.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

const WALLET_ID = 'wallet-1';

function makeWallet(overrides: any = {}): Wallet {
  return {
    id:         WALLET_ID,
    status:     WalletStatus.ACTIVE,
    isLocked:   false,
    lockReason: null,
    ...overrides,
  } as unknown as Wallet;
}

function makeBalance(available = 10000, held = 0): WalletBalance {
  return { walletId: WALLET_ID, available, held } as unknown as WalletBalance;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDs = {
  query: jest.fn(),
};

const mockWalletsRepo = {
  find:   jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockBalancesRepo = {
  findOne: jest.fn().mockResolvedValue(makeBalance()),
};

const mockHoldsRepo = {};

const mockWalletService = {
  releaseHold: jest.fn().mockResolvedValue(undefined),
};

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('WalletReconciliationService', () => {
  let svc: WalletReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWalletsRepo.find.mockResolvedValue([]);
    mockDs.query.mockResolvedValue([]);
    mockBalancesRepo.findOne.mockResolvedValue(makeBalance(10000, 0));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletReconciliationService,
        { provide: getDataSourceToken(),             useValue: mockDs },
        { provide: getRepositoryToken(Wallet),       useValue: mockWalletsRepo },
        { provide: getRepositoryToken(WalletBalance), useValue: mockBalancesRepo },
        { provide: getRepositoryToken(WalletHold),   useValue: mockHoldsRepo },
        { provide: WalletService,                    useValue: mockWalletService },
        { provide: AlertsService,                    useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<WalletReconciliationService>(WalletReconciliationService);
  });

  // ── runDailyReconciliation ────────────────────────────────────────────────

  describe('runDailyReconciliation()', () => {
    it('returns ok status with zero mismatches when all wallets are consistent', async () => {
      const wallet = makeWallet();
      mockWalletsRepo.find
        .mockResolvedValueOnce([wallet]) // first batch
        .mockResolvedValueOnce([]);      // empty second batch → done

      // ledger balance = 10000, cached balance = 10000 (available=10000, held=0)
      mockDs.query
        .mockResolvedValueOnce([{ ledger_balance: '10000' }]) // checkWallet
        .mockResolvedValueOnce(undefined);                    // logReconResult

      const result = await svc.runDailyReconciliation();

      expect(result.status).toBe('ok');
      expect(result.mismatches).toBe(0);
      expect(result.walletsChecked).toBe(1);
      expect(mockAlerts.fire).not.toHaveBeenCalled();
    });

    it('freezes wallet and fires alert when ledger/cache mismatch > 1 paise', async () => {
      const wallet = makeWallet();
      mockWalletsRepo.find
        .mockResolvedValueOnce([wallet])
        .mockResolvedValueOnce([]);

      // ledger = 10000, cached = 9500 → delta = 500 → mismatch
      mockDs.query
        .mockResolvedValueOnce([{ ledger_balance: '10000' }])
        .mockResolvedValueOnce(undefined); // logReconResult
      mockBalancesRepo.findOne.mockResolvedValueOnce(makeBalance(9500, 0));

      const result = await svc.runDailyReconciliation();

      expect(result.status).toBe('mismatches_found');
      expect(result.mismatches).toBe(1);
      expect(result.frozenWallets).toContain(WALLET_ID);

      // freeze
      expect(mockWalletsRepo.update).toHaveBeenCalledWith(
        WALLET_ID,
        expect.objectContaining({ status: WalletStatus.FROZEN, isLocked: true }),
      );
      // alert
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'wallet_reconciliation', severity: 'critical' }),
      );
    });

    it('ignores delta ≤ 1 paise (floating point rounding tolerance)', async () => {
      mockWalletsRepo.find
        .mockResolvedValueOnce([makeWallet()])
        .mockResolvedValueOnce([]);

      // delta = 1 → should NOT freeze
      mockDs.query
        .mockResolvedValueOnce([{ ledger_balance: '10001' }])
        .mockResolvedValueOnce(undefined);
      mockBalancesRepo.findOne.mockResolvedValueOnce(makeBalance(10000, 0));

      const result = await svc.runDailyReconciliation();
      expect(result.mismatches).toBe(0);
      expect(mockWalletsRepo.update).not.toHaveBeenCalled();
    });

    it('returns error status and fires alert when reconciliation throws', async () => {
      mockWalletsRepo.find.mockRejectedValueOnce(new Error('DB connection lost'));
      mockDs.query.mockResolvedValue(undefined); // logReconResult on error path

      const result = await svc.runDailyReconciliation();

      expect(result.status).toBe('error');
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'wallet_reconciliation',
          severity: 'critical',
        }),
      );
    });

    it('logs a reconciliation result entry on success', async () => {
      mockWalletsRepo.find
        .mockResolvedValueOnce([])  // empty first batch → done immediately
      mockDs.query.mockResolvedValueOnce(undefined); // logReconResult

      await svc.runDailyReconciliation();

      expect(mockDs.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet_recon_log'),
        expect.any(Array),
      );
    });
  });

  // ── recoverStuckHolds ─────────────────────────────────────────────────────

  describe('recoverStuckHolds()', () => {
    it('returns 0 when no stuck holds exist', async () => {
      mockDs.query.mockResolvedValueOnce([]); // no stuck holds
      const result = await svc.recoverStuckHolds();
      expect(result).toBe(0);
      expect(mockWalletService.releaseHold).not.toHaveBeenCalled();
    });

    it('releases all stuck holds and returns the count', async () => {
      mockDs.query.mockResolvedValueOnce([
        { id: 'hold-1' },
        { id: 'hold-2' },
      ]);

      const result = await svc.recoverStuckHolds();

      expect(mockWalletService.releaseHold).toHaveBeenCalledTimes(2);
      expect(mockWalletService.releaseHold).toHaveBeenCalledWith('hold-1');
      expect(mockWalletService.releaseHold).toHaveBeenCalledWith('hold-2');
      expect(result).toBe(2);
    });

    it('continues processing other holds when one release fails', async () => {
      mockDs.query.mockResolvedValueOnce([
        { id: 'hold-1' },
        { id: 'hold-2' },
      ]);
      mockWalletService.releaseHold
        .mockRejectedValueOnce(new Error('Hold already released'))
        .mockResolvedValueOnce(undefined);

      const result = await svc.recoverStuckHolds();
      // Only hold-2 succeeded
      expect(result).toBe(1);
    });

    it('queries using the correct 2-hour threshold', async () => {
      mockDs.query.mockResolvedValueOnce([]);
      await svc.recoverStuckHolds();

      const [, params] = mockDs.query.mock.calls[0];
      expect(params[0]).toBe(HoldStatus.ACTIVE);
      // Second param should be ~2 hours ago
      const threshold = new Date(params[1]);
      const expectedThreshold = new Date(Date.now() - 2 * 3600 * 1000);
      expect(Math.abs(threshold.getTime() - expectedThreshold.getTime())).toBeLessThan(5000);
    });
  });
});
