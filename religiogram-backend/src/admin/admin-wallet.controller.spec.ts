import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { AdminWalletController } from './admin-wallet.controller';
import { Wallet, WalletStatus } from '../wallet/entities/wallet.entity';
import { LedgerEntry } from '../wallet/entities/ledger-entry.entity';
import { AdminAuditService } from './admin-audit.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const OWNER_UUID  = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const WALLET_UUID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const fakeWallet = () => ({
  id: WALLET_UUID,
  ownerId: OWNER_UUID,
  availableBalance: 100_000,
  status: WalletStatus.ACTIVE,
});

const mockWalletRepo = {
  findOne:     jest.fn().mockResolvedValue(fakeWallet()),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  update:      jest.fn().mockResolvedValue(undefined),
};

const mockLedgerRepo = {
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
};

// DataSource mock: em.findOneOrFail, em.update, em.insert chained via transaction
const fakeEm = {
  findOneOrFail: jest.fn().mockResolvedValue(fakeWallet()),
  update:        jest.fn().mockResolvedValue(undefined),
  insert:        jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: (em: any) => Promise<void>) => cb(fakeEm)),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminWalletController', () => {
  let ctrl: AdminWalletController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminWalletController],
      providers: [
        { provide: getRepositoryToken(Wallet),      useValue: mockWalletRepo },
        { provide: getRepositoryToken(LedgerEntry), useValue: mockLedgerRepo },
        { provide: getDataSourceToken(),            useValue: mockDataSource },
        { provide: AdminAuditService,               useValue: mockAuditService },
      ],
    }).compile();

    ctrl = module.get<AdminWalletController>(AdminWalletController);
  });

  // ── getWallet() ───────────────────────────────────────────────────────────

  describe('getWallet()', () => {
    it('returns wallet when found', async () => {
      const result = await ctrl.getWallet(OWNER_UUID);
      expect(mockWalletRepo.findOne).toHaveBeenCalledWith({ where: { ownerId: OWNER_UUID } });
      expect(result).toHaveProperty('id', WALLET_UUID);
    });

    it('returns {ownerId, availableBalance:0, status:"not_found"} when not found', async () => {
      mockWalletRepo.findOne.mockResolvedValueOnce(null);
      const result = await ctrl.getWallet(OWNER_UUID);
      expect(result).toEqual({ ownerId: OWNER_UUID, availableBalance: 0, status: 'not_found' });
    });
  });

  // ── getLedger() ───────────────────────────────────────────────────────────

  describe('getLedger()', () => {
    it('returns {data:[], total:0} when wallet not found', async () => {
      mockWalletRepo.findOne.mockResolvedValueOnce(null);
      const result = await ctrl.getLedger(OWNER_UUID, 1, 50);
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('queries ledger entries by walletId when wallet found', async () => {
      mockLedgerRepo.findAndCount.mockResolvedValueOnce([[{ id: 'entry-1' }], 1]);
      const result = await ctrl.getLedger(OWNER_UUID, 1, 50);
      expect(mockLedgerRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { walletId: WALLET_UUID } }),
      );
      expect(result).toHaveProperty('total', 1);
    });
  });

  // ── freeze() ──────────────────────────────────────────────────────────────

  describe('freeze()', () => {
    it('freezes wallet and logs audit', async () => {
      const dto = { adminId: 'admin-1', reason: 'Suspected fraud' };
      const result = await ctrl.freeze(OWNER_UUID, dto);
      expect(mockWalletRepo.update).toHaveBeenCalledWith(
        { ownerId: OWNER_UUID },
        expect.objectContaining({ status: WalletStatus.FROZEN }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'wallet.freeze' }),
      );
      expect(result).toEqual({ success: true, ownerId: OWNER_UUID, status: WalletStatus.FROZEN });
    });
  });

  // ── unfreeze() ────────────────────────────────────────────────────────────

  describe('unfreeze()', () => {
    it('unfreezes wallet and logs audit', async () => {
      const dto = { adminId: 'admin-1', reason: 'Cleared' };
      const result = await ctrl.unfreeze(OWNER_UUID, dto);
      expect(mockWalletRepo.update).toHaveBeenCalledWith(
        { ownerId: OWNER_UUID },
        expect.objectContaining({ status: WalletStatus.ACTIVE }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'wallet.unfreeze' }),
      );
      expect(result.status).toBe(WalletStatus.ACTIVE);
    });
  });

  // ── adminCredit() ─────────────────────────────────────────────────────────

  describe('adminCredit()', () => {
    it('runs transaction, credits balance, inserts ledger entry, logs audit', async () => {
      const dto = { adminId: 'admin-1', amountPaise: 10_000, justification: 'Goodwill credit' };
      const result = await ctrl.adminCredit(OWNER_UUID, dto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(fakeEm.findOneOrFail).toHaveBeenCalled();
      expect(fakeEm.update).toHaveBeenCalledWith(
        Wallet, WALLET_UUID,
        expect.objectContaining({ availableBalance: 110_000 }),
      );
      expect(fakeEm.insert).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'wallet.admin_credit' }),
      );
      expect(result).toEqual({ success: true, amountPaise: 10_000 });
    });
  });

  // ── forceRefund() ─────────────────────────────────────────────────────────

  describe('forceRefund()', () => {
    it('runs transaction, credits balance as refund, logs audit', async () => {
      const dto = { adminId: 'admin-1', amountPaise: 5_000, referenceId: 'booking-1', reason: 'Cancellation' };
      const result = await ctrl.forceRefund(OWNER_UUID, dto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(fakeEm.update).toHaveBeenCalledWith(
        Wallet, WALLET_UUID,
        expect.objectContaining({ availableBalance: 105_000 }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'wallet.force_refund' }),
      );
      expect(result).toEqual({ success: true, refundedPaise: 5_000 });
    });
  });
});
