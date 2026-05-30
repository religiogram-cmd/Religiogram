import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReportsService = {
  submit: jest.fn().mockResolvedValue({ id: 'rep-1', status: 'pending' }),
};

function fakeUser(id = 'user-1'): any { return { id }; }

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ReportsController', () => {
  let ctrl: ReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).compile();

    ctrl = module.get<ReportsController>(ReportsController);
  });

  // ── submit() ──────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('delegates to reportsService.submit with userId and dto', async () => {
      const dto: any = { targetType: 'event', targetId: 'evt-1', reason: 'Spam' };
      const result = await ctrl.submit(dto, fakeUser('u-5'));
      expect(mockReportsService.submit).toHaveBeenCalledWith('u-5', dto);
      expect(result).toHaveProperty('id', 'rep-1');
    });
  });
});
