import { Test, TestingModule } from '@nestjs/testing';
import { ProviderIndexService, PROVIDER_INDEX, ProviderDocument } from './provider-index.service';
import { OPENSEARCH_CLIENT } from './opensearch.module';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPutIndexTemplate = jest.fn().mockResolvedValue({});
const mockExists = jest.fn().mockResolvedValue({ body: false });
const mockCreate = jest.fn().mockResolvedValue({});
const mockPutSettings = jest.fn().mockResolvedValue({});
const mockIndex = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});
const mockSearch = jest.fn().mockResolvedValue({
  body: {
    hits: { total: { value: 0 }, hits: [] },
  },
});

const mockClient = {
  indices: {
    putIndexTemplate: mockPutIndexTemplate,
    exists:           mockExists,
    create:           mockCreate,
    putSettings:      mockPutSettings,
  },
  index:  mockIndex,
  delete: mockDelete,
  update: mockUpdate,
  search: mockSearch,
};

// ── stub ───────────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<ProviderDocument> = {}): ProviderDocument {
  return {
    id:               'prov-1',
    name:             'Pandit Sharma',
    bio:              'Expert vedic astrologer',
    specialties:      ['kundli', 'jyotish'],
    religion:         'hindu',
    roles:            ['astrologer'],
    city:             'varanasi',
    rating:           4.8,
    reviewCount:      120,
    experienceYears:  15,
    onlineNow:        true,
    isVerified:       true,
    responseTimeMin:  3,
    pricePerMinPaise: 2000,
    servicesOffered:  ['kundli reading'],
    languages:        ['hindi', 'english'],
    conversionRate:   0.75,
    createdAt:        '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ProviderIndexService', () => {
  let svc: ProviderIndexService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockExists.mockResolvedValue({ body: false });
    mockSearch.mockResolvedValue({ body: { hits: { total: { value: 0 }, hits: [] } } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderIndexService,
        { provide: OPENSEARCH_CLIENT, useValue: mockClient },
      ],
    }).compile();

    svc = module.get<ProviderIndexService>(ProviderIndexService);
  });

  // ── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('applies index template and creates index on first boot', async () => {
      await svc.onModuleInit();
      expect(mockPutIndexTemplate).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ index: PROVIDER_INDEX }),
      );
    });

    it('does not throw when index template PUT fails (non-fatal)', async () => {
      mockPutIndexTemplate.mockRejectedValueOnce(new Error('Permissions denied'));
      await expect(svc.onModuleInit()).resolves.not.toThrow();
    });

    it('updates replica settings when index already exists', async () => {
      mockExists.mockResolvedValueOnce({ body: true });
      await svc.onModuleInit();
      expect(mockPutSettings).toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── indexProvider ──────────────────────────────────────────────────────────

  describe('indexProvider()', () => {
    it('calls client.index with the correct id and body', async () => {
      const doc = makeDoc();
      await svc.indexProvider(doc);
      expect(mockIndex).toHaveBeenCalledWith(
        expect.objectContaining({
          index: PROVIDER_INDEX,
          id:    'prov-1',
          body:  doc,
        }),
      );
    });

    it('does not throw when client.index fails (non-fatal)', async () => {
      mockIndex.mockRejectedValueOnce(new Error('Shard unavailable'));
      await expect(svc.indexProvider(makeDoc())).resolves.not.toThrow();
    });
  });

  // ── deleteProvider ─────────────────────────────────────────────────────────

  describe('deleteProvider()', () => {
    it('calls client.delete with the correct id', async () => {
      await svc.deleteProvider('prov-1');
      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({ index: PROVIDER_INDEX, id: 'prov-1' }),
      );
    });

    it('does not throw when document does not exist (non-fatal)', async () => {
      mockDelete.mockRejectedValueOnce(new Error('not_found'));
      await expect(svc.deleteProvider('nonexistent')).resolves.not.toThrow();
    });
  });

  // ── updateOnlineStatus ─────────────────────────────────────────────────────

  describe('updateOnlineStatus()', () => {
    it('sends an update with onlineNow=true', async () => {
      await svc.updateOnlineStatus('prov-1', true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id:   'prov-1',
          body: { doc: { onlineNow: true } },
        }),
      );
    });

    it('does not throw when update fails (non-fatal)', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('cluster not available'));
      await expect(svc.updateOnlineStatus('prov-1', false)).resolves.not.toThrow();
    });
  });

  // ── search ─────────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('returns empty result when no providers match', async () => {
      mockSearch.mockResolvedValueOnce({ body: { hits: { total: { value: 0 }, hits: [] } } });
      const result = await svc.search({ query: 'pandit' });
      expect(result.total).toBe(0);
      expect(result.providers).toHaveLength(0);
    });

    it('returns providers from search hits', async () => {
      const doc = makeDoc();
      mockSearch.mockResolvedValueOnce({
        body: {
          hits: {
            total: { value: 1 },
            hits: [{ _source: doc, sort: [] }],
          },
        },
      });
      const result = await svc.search({ query: 'astrologer' });
      expect(result.total).toBe(1);
      expect(result.providers[0].id).toBe('prov-1');
    });

    it('applies religion filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({ body: { hits: { total: { value: 0 }, hits: [] } } });
      await svc.search({ religion: 'hindu' });
      const [args] = mockSearch.mock.calls[0];
      const filters = args.body.query.bool.filter;
      expect(JSON.stringify(filters)).toContain('hindu');
    });

    it('applies city filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({ body: { hits: { total: { value: 0 }, hits: [] } } });
      await svc.search({ city: 'varanasi' });
      const [args] = mockSearch.mock.calls[0];
      expect(JSON.stringify(args.body)).toContain('varanasi');
    });

    it('applies onlineNow filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({ body: { hits: { total: { value: 0 }, hits: [] } } });
      await svc.search({ onlineNow: true });
      const [args] = mockSearch.mock.calls[0];
      expect(JSON.stringify(args.body)).toContain('onlineNow');
    });

    it('uses match_all when query is shorter than 2 characters', async () => {
      mockSearch.mockResolvedValueOnce({ body: { hits: { total: { value: 0 }, hits: [] } } });
      await svc.search({ query: 'a' });
      const [args] = mockSearch.mock.calls[0];
      expect(JSON.stringify(args.body)).toContain('match_all');
    });
  });
});
