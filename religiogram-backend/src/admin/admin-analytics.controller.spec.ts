import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { ProviderEntity } from '../service-providers/entities/provider.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { LedgerEntry } from '../wallet/entities/ledger-entry.entity';
import { Dispute } from '../dispute/entities/dispute.entity';
import { FraudSignal } from '../fraud/entities/fraud-signal.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

function makeRepo(countReturn = 0) {
  return { count: jest.fn().mockResolvedValue(countReturn) };
}

const mockProviderRepo = makeRepo(10);
const mockBookingRepo  = makeRepo(50);
const mockLedgerRepo   = makeRepo(0);
const mockDisputeRepo  = makeRepo(3);
const mockFraudRepo    = makeRepo(2);

const mockDataSource = {
  query: jest.fn(),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminAnalyticsController', () => {
  let ctrl: AdminAnalyticsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAnalyticsController],
      providers: [
        { provide: getRepositoryToken(ProviderEntity), useValue: mockProviderRepo },
        { provide: getRepositoryToken(Booking),        useValue: mockBookingRepo },
        { provide: getRepositoryToken(LedgerEntry),    useValue: mockLedgerRepo },
        { provide: getRepositoryToken(Dispute),        useValue: mockDisputeRepo },
        { provide: getRepositoryToken(FraudSignal),    useValue: mockFraudRepo },
        { provide: getDataSourceToken(),               useValue: mockDataSource },
      ],
    }).compile();

    ctrl = module.get<AdminAnalyticsController>(AdminAnalyticsController);
  });

  // ── getKpis() ─────────────────────────────────────────────────────────────

  describe('getKpis()', () => {
    it('returns providers, bookings, disputes, fraud counts', async () => {
      // count() called multiple times per repo — set them up
      mockProviderRepo.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(3)   // pending
        .mockResolvedValueOnce(7);  // approved

      mockBookingRepo.count
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(40)  // completed
        .mockResolvedValueOnce(5);  // cancelled

      mockDisputeRepo.count.mockResolvedValueOnce(2);
      mockFraudRepo.count.mockResolvedValueOnce(1);

      const result = await ctrl.getKpis();
      expect(result).toHaveProperty('providers');
      expect(result).toHaveProperty('bookings');
      expect(result).toHaveProperty('disputes');
      expect(result).toHaveProperty('fraud');
      expect(result.providers.total).toBe(10);
    });
  });

  // ── getRevenue() ──────────────────────────────────────────────────────────

  describe('getRevenue()', () => {
    it('executes raw SQL and maps entry_type totals', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { entry_type: 'credit', total: '150000' },
        { entry_type: 'debit',  total: '50000' },
      ]);
      const result = await ctrl.getRevenue();
      expect(mockDataSource.query).toHaveBeenCalled();
      expect(result).toHaveProperty('credit', 150000);
      expect(result).toHaveProperty('debit', 50000);
    });

    it('accepts custom from/to date params', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await ctrl.getRevenue('2025-01-01', '2025-01-31');
      const [sql, params] = mockDataSource.query.mock.calls[0];
      expect(typeof sql).toBe('string');
      expect(params).toHaveLength(2);
    });
  });

  // ── getBookingTrend() ─────────────────────────────────────────────────────

  describe('getBookingTrend()', () => {
    it('returns fromDate, toDate, rows', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { day: '2025-01-01T00:00:00Z', status: 'completed', count: '5' },
      ]);
      const result = await ctrl.getBookingTrend();
      expect(result).toHaveProperty('fromDate');
      expect(result).toHaveProperty('toDate');
      expect(result).toHaveProperty('rows');
      expect(result.rows).toHaveLength(1);
    });
  });

  // ── getDisputeSla() ───────────────────────────────────────────────────────

  describe('getDisputeSla()', () => {
    it('returns open, overdue, healthPct', async () => {
      mockDisputeRepo.count.mockResolvedValueOnce(5);
      mockDataSource.query.mockResolvedValueOnce([{ count: '1' }]);

      const result = await ctrl.getDisputeSla();
      expect(result).toHaveProperty('open', 5);
      expect(result).toHaveProperty('overdue', 1);
      expect(result).toHaveProperty('healthPct');
    });

    it('returns healthPct=100 when open=0', async () => {
      mockDisputeRepo.count.mockResolvedValueOnce(0);
      mockDataSource.query.mockResolvedValueOnce([{ count: '0' }]);

      const result = await ctrl.getDisputeSla();
      expect(result.healthPct).toBe(100);
    });
  });
});
