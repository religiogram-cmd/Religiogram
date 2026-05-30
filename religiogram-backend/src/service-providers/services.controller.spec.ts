import { Test, TestingModule } from '@nestjs/testing';
import { ServicesCatalogueController } from './services.controller';
import { ProviderOnboardingService } from './service-providers.service';
import { ProviderReligion } from './entities/provider.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockOnboardingService = {
  listCatalogue: jest.fn().mockResolvedValue([
    { id: 'svc-1', name: 'Puja', religion: 'hindu' },
  ]),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ServicesCatalogueController', () => {
  let ctrl: ServicesCatalogueController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicesCatalogueController],
      providers: [
        { provide: ProviderOnboardingService, useValue: mockOnboardingService },
      ],
    }).compile();

    ctrl = module.get<ServicesCatalogueController>(ServicesCatalogueController);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('delegates to onboardingService.listCatalogue with religion from dto', async () => {
      const q: any = { religion: ProviderReligion.Hindu };
      const result = await ctrl.list(q);
      expect(mockOnboardingService.listCatalogue).toHaveBeenCalledWith(ProviderReligion.Hindu);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns items from catalogue', async () => {
      const q: any = { religion: ProviderReligion.Sikh };
      const result = await ctrl.list(q);
      expect(result).toHaveLength(1);
    });
  });
});
