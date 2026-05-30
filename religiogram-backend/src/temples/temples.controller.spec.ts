import { Test, TestingModule } from '@nestjs/testing';
import { TemplesController } from './temples.controller';
import { TemplesService } from './temples.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockTemplesService = {
  nearby:     jest.fn().mockResolvedValue({ items: [], total: 0 }),
  search:     jest.fn().mockResolvedValue({ items: [], total: 0 }),
  findCities: jest.fn().mockResolvedValue(['Delhi', 'Mumbai']),
  list:       jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
  findById:   jest.fn().mockResolvedValue({ id: 'temple-1', name: 'Test Temple' }),
};

const FAKE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TemplesController', () => {
  let ctrl: TemplesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplesController],
      providers: [
        { provide: TemplesService, useValue: mockTemplesService },
      ],
    }).compile();

    ctrl = module.get<TemplesController>(TemplesController);
  });

  // ── nearby() ───────────────────────────────────────────────────────────────

  describe('nearby()', () => {
    it('delegates to templesService.nearby with the dto', async () => {
      const dto: any = { lat: 28.6139, lng: 77.2090, radiusKm: 5, limit: 10 };
      await ctrl.nearby(dto);
      expect(mockTemplesService.nearby).toHaveBeenCalledWith(dto);
    });

    it('passes city-based dto through', async () => {
      const dto: any = { city: 'delhi', radiusKm: 10 };
      await ctrl.nearby(dto);
      expect(mockTemplesService.nearby).toHaveBeenCalledWith(dto);
    });
  });

  // ── search() ───────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('delegates to templesService.search with the query dto', async () => {
      const dto: any = { q: 'shiva', limit: 20 };
      await ctrl.search(dto);
      expect(mockTemplesService.search).toHaveBeenCalledWith(dto);
    });
  });

  // ── cities() ───────────────────────────────────────────────────────────────

  describe('cities()', () => {
    it('delegates to templesService.findCities and returns city list', async () => {
      const result = await ctrl.cities();
      expect(mockTemplesService.findCities).toHaveBeenCalled();
      expect(result).toEqual(['Delhi', 'Mumbai']);
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to templesService.list with the list dto', async () => {
      const dto: any = { city: 'varanasi', page: 1, limit: 20 };
      await ctrl.list(dto);
      expect(mockTemplesService.list).toHaveBeenCalledWith(dto);
    });

    it('passes search and religion filters through', async () => {
      const dto: any = { search: 'hanuman', religion: 'hinduism', page: 2, limit: 10 };
      await ctrl.list(dto);
      expect(mockTemplesService.list).toHaveBeenCalledWith(dto);
    });
  });

  // ── findById() ─────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('delegates to templesService.findById with the id', async () => {
      mockTemplesService.findById.mockResolvedValueOnce({ id: FAKE_UUID, name: 'Ram Mandir' });
      const result = await ctrl.findById(FAKE_UUID);
      expect(mockTemplesService.findById).toHaveBeenCalledWith(FAKE_UUID);
      expect(result.id).toBe(FAKE_UUID);
    });
  });
});
