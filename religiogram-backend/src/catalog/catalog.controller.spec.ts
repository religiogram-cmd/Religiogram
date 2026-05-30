import { Test, TestingModule } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockCatalogService = {
  listReligions: jest.fn().mockResolvedValue([
    { slug: 'hinduism', name: 'Hinduism' },
    { slug: 'islam', name: 'Islam' },
  ]),
  getReligion: jest.fn().mockResolvedValue({
    slug: 'hinduism',
    name: 'Hinduism',
    categories: [],
    roles: [],
  }),
  getRoles:         jest.fn().mockResolvedValue([]),
  listServiceTypes: jest.fn().mockResolvedValue([]),
  getServiceType:   jest.fn().mockResolvedValue({ slug: 'puja', name: 'Puja' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CatalogController', () => {
  let ctrl: CatalogController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: mockCatalogService }],
    }).compile();

    ctrl = module.get<CatalogController>(CatalogController);
  });

  // ── listReligions() ────────────────────────────────────────────────────────

  describe('listReligions()', () => {
    it('delegates to catalogService.listReligions', async () => {
      const result = await ctrl.listReligions();
      expect(mockCatalogService.listReligions).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── getReligion() ──────────────────────────────────────────────────────────

  describe('getReligion()', () => {
    it('delegates to catalogService.getReligion with slug', async () => {
      await ctrl.getReligion('hinduism');
      expect(mockCatalogService.getReligion).toHaveBeenCalledWith('hinduism');
    });

    it('returns religion object with categories and roles', async () => {
      const result = await ctrl.getReligion('hinduism');
      expect(result.slug).toBe('hinduism');
    });
  });

  // ── getRoles() ─────────────────────────────────────────────────────────────

  describe('getRoles()', () => {
    it('delegates to catalogService.getRoles with slug', async () => {
      mockCatalogService.getRoles.mockResolvedValueOnce([
        { slug: 'pandit', name: 'Pandit' },
      ]);
      await ctrl.getRoles('hinduism');
      expect(mockCatalogService.getRoles).toHaveBeenCalledWith('hinduism');
    });
  });
});
