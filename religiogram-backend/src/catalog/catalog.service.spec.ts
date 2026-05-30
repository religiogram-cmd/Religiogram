import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { Religion } from './entities/religion.entity';
import { ProviderRole } from './entities/provider-role.entity';
import { ServiceCategory } from './entities/service-category.entity';
import { CatalogService as CatalogServiceEntity } from './entities/catalog-service.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeReligion(overrides: any = {}) {
  return { id: 'rel-1', slug: 'hinduism', name: 'Hinduism', isActive: true, sortOrder: 1, ...overrides };
}

function makeService(overrides: any = {}) {
  return { id: 'svc-1', slug: 'puja', name: 'Puja', isActive: true, ...overrides };
}

// ── QueryBuilder mock (for listServices) ──────────────────────────────────────

const svcQB: any = {
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  where:              jest.fn().mockReturnThis(),
  andWhere:           jest.fn().mockReturnThis(),
  orderBy:            jest.fn().mockReturnThis(),
  addOrderBy:         jest.fn().mockReturnThis(),
  getMany:            jest.fn().mockResolvedValue([makeService()]),
};

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReligionsRepo = {
  find:    jest.fn().mockResolvedValue([makeReligion()]),
  findOne: jest.fn().mockResolvedValue(makeReligion()),
};

const mockRolesRepo = {
  find: jest.fn().mockResolvedValue([{ id: 'role-1', religionSlug: 'hinduism' }]),
};

const mockCategoriesRepo = {};

const mockServicesRepo = {
  findOne:            jest.fn().mockResolvedValue(makeService()),
  createQueryBuilder: jest.fn().mockReturnValue(svcQB),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CatalogService', () => {
  let svc: CatalogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReligionsRepo.findOne.mockResolvedValue(makeReligion());
    mockServicesRepo.findOne.mockResolvedValue(makeService());
    mockServicesRepo.createQueryBuilder.mockReturnValue(svcQB);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: getRepositoryToken(Religion),             useValue: mockReligionsRepo },
        { provide: getRepositoryToken(ProviderRole),         useValue: mockRolesRepo },
        { provide: getRepositoryToken(ServiceCategory),      useValue: mockCategoriesRepo },
        { provide: getRepositoryToken(CatalogServiceEntity), useValue: mockServicesRepo },
      ],
    }).compile();

    svc = module.get<CatalogService>(CatalogService);
  });

  // ── listReligions ──────────────────────────────────────────────────────────

  describe('listReligions()', () => {
    it('returns active religions sorted by sortOrder', async () => {
      const result = await svc.listReligions();
      expect(mockReligionsRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { sortOrder: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  // ── getReligion ────────────────────────────────────────────────────────────

  describe('getReligion()', () => {
    it('returns religion with relations when slug exists', async () => {
      const result = await svc.getReligion('hinduism');
      expect(result.slug).toBe('hinduism');
      expect(mockReligionsRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'hinduism', isActive: true },
          relations: expect.arrayContaining(['categories', 'providerRoles']),
        }),
      );
    });

    it('throws NotFoundException for unknown slug', async () => {
      mockReligionsRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getReligion('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  // ── listRolesForReligion ───────────────────────────────────────────────────

  describe('listRolesForReligion()', () => {
    it('returns active roles for the given religion', async () => {
      const result = await svc.listRolesForReligion('hinduism');
      expect(mockRolesRepo.find).toHaveBeenCalledWith({
        where: { religionSlug: 'hinduism', isActive: true },
      });
      expect(result).toHaveLength(1);
    });
  });

  // ── listServices ───────────────────────────────────────────────────────────

  describe('listServices()', () => {
    it('returns all active services when no filters are provided', async () => {
      const result = await svc.listServices();
      expect(svcQB.where).toHaveBeenCalledWith('s.is_active = true');
      expect(svcQB.andWhere).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('applies religionSlug filter when provided', async () => {
      await svc.listServices('hinduism');
      expect(svcQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('religion_slug'),
        expect.objectContaining({ religionSlug: 'hinduism' }),
      );
    });

    it('applies type filter when provided', async () => {
      await svc.listServices(undefined, 'puja');
      expect(svcQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('service_type'),
        expect.objectContaining({ types: ['puja', 'both'] }),
      );
    });

    it('applies both filters when both are provided', async () => {
      await svc.listServices('hinduism', 'puja');
      expect(svcQB.andWhere).toHaveBeenCalledTimes(2);
    });
  });

  // ── getService ─────────────────────────────────────────────────────────────

  describe('getService()', () => {
    it('returns service with addOns when found', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(makeService({ id: 'svc-1' }));
      const result = await svc.getService('svc-1');
      expect(result.id).toBe('svc-1');
      expect(mockServicesRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'svc-1', isActive: true },
          relations: expect.arrayContaining(['category', 'addOns']),
        }),
      );
    });

    it('throws NotFoundException for unknown id', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getService('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getServiceBySlug ───────────────────────────────────────────────────────

  describe('getServiceBySlug()', () => {
    it('returns service when slug matches', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(makeService({ slug: 'puja' }));
      const result = await svc.getServiceBySlug('puja');
      expect(result.slug).toBe('puja');
    });

    it('throws NotFoundException for unknown slug', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getServiceBySlug('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
