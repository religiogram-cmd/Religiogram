import { Test, TestingModule } from '@nestjs/testing';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsService } from './reports.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReportsService = {
  listForAdmin: jest.fn().mockResolvedValue([]),
  review:       jest.fn().mockResolvedValue({ id: 'rep-1', status: 'reviewed' }),
  unhide:       jest.fn().mockResolvedValue({ success: true }),
};

function fakeAdmin(id = 'admin-1'): any { return { id, role: 'admin' }; }

const REPORT_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminReportsController', () => {
  let ctrl: AdminReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).compile();

    ctrl = module.get<AdminReportsController>(AdminReportsController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('defaults to "pending" status when none provided', async () => {
      await ctrl.list(undefined, undefined);
      expect(mockReportsService.listForAdmin).toHaveBeenCalledWith('pending', 200);
    });

    it('passes valid status through', async () => {
      await ctrl.list('reviewed', undefined);
      expect(mockReportsService.listForAdmin).toHaveBeenCalledWith('reviewed', 200);
    });

    it('defaults invalid status to "pending"', async () => {
      await ctrl.list('spam', undefined);
      expect(mockReportsService.listForAdmin).toHaveBeenCalledWith('pending', 200);
    });

    it('parses limit string to number', async () => {
      await ctrl.list('pending', '50');
      expect(mockReportsService.listForAdmin).toHaveBeenCalledWith('pending', 50);
    });

    it('clamps limit to max 500', async () => {
      await ctrl.list(undefined, '9999');
      const [, limit] = mockReportsService.listForAdmin.mock.calls[0];
      expect(limit).toBe(500);
    });

    it('clamps limit to min 1', async () => {
      await ctrl.list(undefined, '0');
      const [, limit] = mockReportsService.listForAdmin.mock.calls[0];
      expect(limit).toBe(1);
    });

    it('defaults limit to 200 when NaN', async () => {
      await ctrl.list(undefined, 'abc');
      const [, limit] = mockReportsService.listForAdmin.mock.calls[0];
      expect(limit).toBe(200);
    });
  });

  // ── review() ──────────────────────────────────────────────────────────────

  describe('review()', () => {
    it('delegates to reportsService.review with id, adminId, dto', async () => {
      const dto: any = { action: 'approve', note: 'Content removed' };
      const result = await ctrl.review(REPORT_UUID, dto, fakeAdmin('admin-3'));
      expect(mockReportsService.review).toHaveBeenCalledWith(REPORT_UUID, 'admin-3', dto);
      expect(result).toHaveProperty('status', 'reviewed');
    });
  });

  // ── unhide() ──────────────────────────────────────────────────────────────

  describe('unhide()', () => {
    it('delegates to reportsService.unhide with targetType and targetId', async () => {
      const body: any = { targetType: 'event', targetId: 'evt-9' };
      await ctrl.unhide(body);
      expect(mockReportsService.unhide).toHaveBeenCalledWith('event', 'evt-9');
    });
  });
});
