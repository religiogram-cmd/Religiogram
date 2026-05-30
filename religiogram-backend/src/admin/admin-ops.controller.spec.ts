import { Test, TestingModule } from '@nestjs/testing';
import { AdminOpsController } from './admin-ops.controller';
import { PartmanService } from '../common/partman/partman.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPartmanService = {
  runNow: jest.fn().mockResolvedValue({ created: 4, alreadyExists: 8 }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminOpsController', () => {
  let ctrl: AdminOpsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOpsController],
      providers: [{ provide: PartmanService, useValue: mockPartmanService }],
    }).compile();

    ctrl = module.get<AdminOpsController>(AdminOpsController);
  });

  // ── runPartman() ──────────────────────────────────────────────────────────

  describe('runPartman()', () => {
    it('delegates to partman.runNow and returns counts', async () => {
      const result = await ctrl.runPartman();
      expect(mockPartmanService.runNow).toHaveBeenCalled();
      expect(result).toEqual({ created: 4, alreadyExists: 8 });
    });

    it('is idempotent (safe to call multiple times)', async () => {
      await ctrl.runPartman();
      await ctrl.runPartman();
      expect(mockPartmanService.runNow).toHaveBeenCalledTimes(2);
    });
  });
});
