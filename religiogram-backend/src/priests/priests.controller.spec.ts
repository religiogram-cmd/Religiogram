import { Test, TestingModule } from '@nestjs/testing';
import { PriestsController } from './priests.controller';
import { PriestsService } from './priests.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPriestsService = {
  findAll:          jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getOnlinePriests: jest.fn().mockResolvedValue([]),
  getServices:      jest.fn().mockResolvedValue([]),
  findOne:          jest.fn().mockResolvedValue({ id: 'priest-1' }),
  getStats:         jest.fn().mockResolvedValue({ bookings: 0, rating: 0 }),
};

const PRIEST_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PriestsController', () => {
  let ctrl: PriestsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PriestsController],
      providers: [{ provide: PriestsService, useValue: mockPriestsService }],
    }).compile();

    ctrl = module.get<PriestsController>(PriestsController);
  });

  // ── findAll() ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('delegates to priestsService.findAll with dto', async () => {
      const dto: any = { faith: 'hinduism', city: 'Delhi' };
      await ctrl.findAll(dto);
      expect(mockPriestsService.findAll).toHaveBeenCalledWith(dto);
    });
  });

  // ── getOnline() ───────────────────────────────────────────────────────────

  describe('getOnline()', () => {
    it('delegates to priestsService.getOnlinePriests with faith', async () => {
      await ctrl.getOnline('hinduism');
      expect(mockPriestsService.getOnlinePriests).toHaveBeenCalledWith('hinduism');
    });

    it('delegates with undefined when faith absent', async () => {
      await ctrl.getOnline(undefined);
      expect(mockPriestsService.getOnlinePriests).toHaveBeenCalledWith(undefined);
    });
  });

  // ── getServices() ─────────────────────────────────────────────────────────

  describe('getServices()', () => {
    it('delegates to priestsService.getServices with faith', async () => {
      await ctrl.getServices('islam');
      expect(mockPriestsService.getServices).toHaveBeenCalledWith('islam');
    });

    it('delegates with undefined when faith absent', async () => {
      await ctrl.getServices(undefined);
      expect(mockPriestsService.getServices).toHaveBeenCalledWith(undefined);
    });
  });

  // ── findOne() ─────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('delegates to priestsService.findOne with id', async () => {
      const result = await ctrl.findOne(PRIEST_UUID);
      expect(mockPriestsService.findOne).toHaveBeenCalledWith(PRIEST_UUID);
      expect(result).toHaveProperty('id');
    });
  });

  // ── getStats() ────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('delegates to priestsService.getStats with id', async () => {
      const result = await ctrl.getStats(PRIEST_UUID);
      expect(mockPriestsService.getStats).toHaveBeenCalledWith(PRIEST_UUID);
      expect(result).toHaveProperty('bookings');
    });
  });
});
