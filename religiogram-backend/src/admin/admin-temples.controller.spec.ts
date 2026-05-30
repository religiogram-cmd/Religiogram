import { Test, TestingModule } from '@nestjs/testing';
import { AdminTemplesController } from './admin-temples.controller';
import { AdminTemplesService } from './admin-temples.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAdminTemplesService = {
  list:    jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getOne:  jest.fn().mockResolvedValue({ id: 'temple-1' }),
  create:  jest.fn().mockResolvedValue({ id: 'temple-1' }),
  update:  jest.fn().mockResolvedValue({ id: 'temple-1', updated: true }),
  remove:  jest.fn().mockResolvedValue({ success: true }),
};

const TEMPLE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminTemplesController', () => {
  let ctrl: AdminTemplesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTemplesController],
      providers: [{ provide: AdminTemplesService, useValue: mockAdminTemplesService }],
    }).compile();

    ctrl = module.get<AdminTemplesController>(AdminTemplesController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to adminTemplesService.list with dto', async () => {
      const dto: any = { page: 1, limit: 10 };
      const result = await ctrl.list(dto);
      expect(mockAdminTemplesService.list).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });
  });

  // ── getOne() ──────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('delegates to adminTemplesService.getOne with id', async () => {
      const result = await ctrl.getOne(TEMPLE_UUID);
      expect(mockAdminTemplesService.getOne).toHaveBeenCalledWith(TEMPLE_UUID);
      expect(result).toHaveProperty('id', 'temple-1');
    });
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('delegates to adminTemplesService.create with dto', async () => {
      const dto: any = { name: 'Shri Ram Temple', city: 'Ayodhya', religion: 'hindu' };
      const result = await ctrl.create(dto);
      expect(mockAdminTemplesService.create).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('id', 'temple-1');
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('delegates to adminTemplesService.update with id and dto', async () => {
      const dto: any = { name: 'Updated Temple Name' };
      const result = await ctrl.update(TEMPLE_UUID, dto);
      expect(mockAdminTemplesService.update).toHaveBeenCalledWith(TEMPLE_UUID, dto);
      expect(result).toHaveProperty('updated', true);
    });
  });

  // ── remove() ──────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('delegates to adminTemplesService.remove with id', async () => {
      const result = await ctrl.remove(TEMPLE_UUID);
      expect(mockAdminTemplesService.remove).toHaveBeenCalledWith(TEMPLE_UUID);
      expect(result).toEqual({ success: true });
    });
  });
});
