import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SearchService } from './search.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeTempleResult() {
  return {
    type: 'temple', id: 'temple-1', name: 'Shri Ram Mandir',
    description: 'Ancient temple', city: 'ayodhya',
    imageUrl: 'https://cdn.example.com/t.jpg', rating: 4.5, rank: 0.75,
  };
}

function makeProviderResult() {
  return {
    type: 'provider', id: 'provider-1', name: 'Pandit Ji',
    description: 'Expert puja', city: 'varanasi',
    imageUrl: 'https://cdn.example.com/p.jpg', rating: 4.8, rank: 0.65,
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDs = {
  query: jest.fn(),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let svc: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: both queries return one result each
    mockDs.query
      .mockResolvedValueOnce([makeTempleResult()])   // temples
      .mockResolvedValueOnce([makeProviderResult()]); // providers

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getDataSourceToken(), useValue: mockDs },
      ],
    }).compile();

    svc = module.get<SearchService>(SearchService);
  });

  // ── guard: empty / short query ─────────────────────────────────────────────

  describe('short / empty query', () => {
    it('returns empty response for empty string', async () => {
      const result = await svc.search('');
      expect(result).toEqual({ temples: [], providers: [], total: 0 });
      expect(mockDs.query).not.toHaveBeenCalled();
    });

    it('returns empty response for whitespace-only query', async () => {
      const result = await svc.search('  ');
      expect(result).toEqual({ temples: [], providers: [], total: 0 });
    });

    it('returns empty response for single character query', async () => {
      const result = await svc.search('R');
      expect(result).toEqual({ temples: [], providers: [], total: 0 });
    });
  });

  // ── basic search ───────────────────────────────────────────────────────────

  describe('basic search', () => {
    it('returns temples and providers with correct total', async () => {
      const result = await svc.search('ram mandir');
      expect(result.temples).toHaveLength(1);
      expect(result.providers).toHaveLength(1);
      expect(result.total).toBe(2);
    });

    it('issues two DB queries (one for temples, one for providers)', async () => {
      await svc.search('puja');
      expect(mockDs.query).toHaveBeenCalledTimes(2);
    });

    it('passes tsquery prefix-match pattern to both queries', async () => {
      await svc.search('ram');
      const [templeSql, [templeTsQuery]] = mockDs.query.mock.calls[0];
      expect(templeSql).toContain('to_tsquery');
      expect(templeTsQuery).toBe('ram:*');
    });

    it('converts multi-word query to & prefix pattern', async () => {
      await svc.search('ram mandir');
      const [[tsQuery]] = mockDs.query.mock.calls[0].slice(1);
      // Should be "ram:* & mandir:*"
      expect(tsQuery).toBe('ram:* & mandir:*');
    });

    it('strips SQL meta characters from query', async () => {
      await svc.search("ram'; DROP TABLE temples;--");
      const [[tsQuery]] = mockDs.query.mock.calls[0].slice(1);
      expect(tsQuery).not.toContain(';');
      expect(tsQuery).not.toContain("'");
      expect(tsQuery).not.toContain('--');
    });

    it('returns empty response after sanitisation removes all chars', async () => {
      const result = await svc.search('!@#$%^&*()');
      expect(result).toEqual({ temples: [], providers: [], total: 0 });
      expect(mockDs.query).not.toHaveBeenCalled();
    });
  });

  // ── city filter ────────────────────────────────────────────────────────────

  describe('city filter', () => {
    it('passes city as third parameter when city is provided', async () => {
      mockDs.query
        .mockResolvedValueOnce([makeTempleResult()])
        .mockResolvedValueOnce([]);

      await svc.search('puja', 'varanasi');

      const [, templeParams] = mockDs.query.mock.calls[0];
      expect(templeParams).toContain('varanasi');
    });

    it('does not pass city parameter when city is undefined', async () => {
      await svc.search('puja');

      const [, templeParams] = mockDs.query.mock.calls[0];
      // Without city, only 2 params: tsquery + limit
      expect(templeParams).toHaveLength(2);
    });
  });

  // ── limit ──────────────────────────────────────────────────────────────────

  describe('limit', () => {
    it('splits limit evenly between temples and providers', async () => {
      await svc.search('puja', undefined, 20);

      // half = floor(20/2) = 10
      const [, templeParams] = mockDs.query.mock.calls[0];
      const [, providerParams] = mockDs.query.mock.calls[1];
      expect(templeParams[1]).toBe(10);
      expect(providerParams[1]).toBe(10);
    });

    it('defaults to limit=20 when not provided', async () => {
      await svc.search('temple');
      const [, templeParams] = mockDs.query.mock.calls[0];
      expect(templeParams[1]).toBe(10); // half of 20
    });
  });
});
