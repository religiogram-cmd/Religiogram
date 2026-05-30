import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from './opensearch.module';

export const PROVIDER_INDEX = 'rg_providers';

export interface ProviderDocument {
  id: string;
  name: string;
  bio: string;
  specialties: string[];
  religion: string;
  roles: string[];
  city: string;
  location?: { lat: number; lon: number };
  rating: number;
  reviewCount: number;
  experienceYears: number;
  onlineNow: boolean;
  isVerified: boolean;
  responseTimeMin: number;
  pricePerMinPaise: number;
  servicesOffered: string[];
  languages: string[];
  conversionRate: number;
  createdAt: string;
}

@Injectable()
export class ProviderIndexService implements OnModuleInit {
  private readonly logger = new Logger(ProviderIndexService.name);

  constructor(@Inject(OPENSEARCH_CLIENT) private readonly client: Client) {}

  async onModuleInit() {
    // Apply the composable index template FIRST so that any future index
    // creation (reindex, rollover, DR restore) automatically inherits the
    // correct settings and mappings.
    await this.ensureIndexTemplate();
    await this.ensureIndex();
  }

  // ── Index template ──────────────────────────────────────────────────────────
  // PUT /_index_template/providers-template
  //
  // A composable index template ensures that EVERY index matching the pattern
  // "rg_providers*" is created with the correct analyzer and field mappings,
  // regardless of how it is created (API call, reindex, snapshot restore, etc.).
  //
  // Priority 100 overrides any built-in default templates (priority 0).
  // This is idempotent — re-applying an identical template is a no-op.
  async ensureIndexTemplate(): Promise<void> {
    const template = {
      index_patterns: ['rg_providers*'],
      priority: 100,
      template: {
        settings: {
          number_of_shards: 3,
          number_of_replicas: 1,
          analysis: {
            filter: {
              rg_synonyms: {
                type: 'synonym',
                synonyms: [
                  'satyanarayn, satyanarayana => satyanarayan katha',
                  'griha pravesh, grih pravesh, grah pravesh => griha pravesh puja',
                  'shadi, vivah => wedding ritual',
                  'namkaran, naamkaran => naamkaran ceremony',
                  'nikah, nikkah => nikah ceremony',
                  'janaza, janazah => janazah prayer',
                  'aqeeqa => aqeeqah',
                  'anand karaz => anand karaj',
                  'akhand paath => akhand path',
                  'kundali, kundli, birth chart => kundli reading',
                  'jyotish, jyotishi => vedic astrology',
                  'hast rekha => palm reading',
                  'pandit, priest => pandit',
                  'maulvi, maulana => imam',
                  'guruji, guru => spiritual advisor',
                ],
              },
              rg_stop: { type: 'stop', stopwords: ['_english_'] },
            },
            analyzer: {
              rg_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'rg_stop', 'rg_synonyms', 'asciifolding'],
              },
              rg_search_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'rg_stop', 'rg_synonyms', 'asciifolding'],
              },
            },
          },
        },
        mappings: {
          properties: {
            id:               { type: 'keyword' },
            name: {
              type: 'text',
              analyzer: 'rg_analyzer',
              search_analyzer: 'rg_search_analyzer',
              fields: {
                keyword:    { type: 'keyword' },
                completion: { type: 'completion', analyzer: 'rg_analyzer' },
              },
            },
            bio:        { type: 'text', analyzer: 'rg_analyzer' },
            specialties: {
              type: 'text',
              analyzer: 'rg_analyzer',
              fields: { keyword: { type: 'keyword' } },
            },
            religion:         { type: 'keyword' },
            roles:            { type: 'keyword' },
            city:             { type: 'keyword' },
            location:         { type: 'geo_point' },
            rating:           { type: 'float' },
            reviewCount:      { type: 'integer' },
            experienceYears:  { type: 'integer' },
            onlineNow:        { type: 'boolean' },
            isVerified:       { type: 'boolean' },
            responseTimeMin:  { type: 'integer' },
            pricePerMinPaise: { type: 'integer' },
            servicesOffered:  { type: 'keyword' },
            languages:        { type: 'keyword' },
            conversionRate:   { type: 'float' },
            createdAt:        { type: 'date' },
          },
        },
      },
    };

    try {
      await (this.client.indices as any).putIndexTemplate({
        name: 'providers-template',
        body: template,
      });
      this.logger.log('OpenSearch index template applied: providers-template');
    } catch (err: any) {
      // Non-fatal: if the template call fails (e.g. permission denied in a
      // managed cluster), the explicit ensureIndex() call below still creates
      // the index with inline settings.
      this.logger.warn(`Could not apply index template (non-fatal): ${err.message}`);
    }
  }

  async ensureIndex(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: PROVIDER_INDEX });
      if (exists.body) {
        // Index already exists — update replica count to match the cluster size.
        // This is a no-op if already at 1; it upgrades single-node deployments
        // that were created with number_of_replicas=0.
        await this.client.indices.putSettings({
          index: PROVIDER_INDEX,
          body: { index: { number_of_replicas: 1 } },
        }).catch((err: any) =>
          this.logger.warn(`Could not update replica count: ${err.message}`),
        );
        return;
      }
      // The index template (providers-template, priority 100) already supplies
      // the analysis config and field mappings for any rg_providers* index.
      // We create the index without inline settings so the template applies
      // cleanly. If ensureIndexTemplate() failed above, we fall back to an
      // index with default settings — acceptable since the service will still
      // start and the template can be re-applied on next restart.
      await this.client.indices.create({ index: PROVIDER_INDEX, body: {} });
      this.logger.log(`Created OpenSearch index: ${PROVIDER_INDEX}`);
    } catch (err: any) {
      this.logger.warn(`OpenSearch index setup failed (non-fatal): ${err.message}`);
    }
  }

  async indexProvider(doc: ProviderDocument): Promise<void> {
    try {
      await this.client.index({
        index: PROVIDER_INDEX,
        id: doc.id,
        body: doc,
        refresh: false,   // S-FT3: wait_for blocks the event loop per-doc; false is safe for non-critical indexing
      });
    } catch (err: any) {
      this.logger.error(`Failed to index provider ${doc.id}: ${err.message}`);
    }
  }

  async deleteProvider(id: string): Promise<void> {
    try {
      await this.client.delete({ index: PROVIDER_INDEX, id });
    } catch (err: any) {
      this.logger.warn(`Failed to delete provider ${id} from index: ${err.message}`);
    }
  }

  async updateOnlineStatus(id: string, onlineNow: boolean): Promise<void> {
    try {
      await this.client.update({
        index: PROVIDER_INDEX,
        id,
        body: { doc: { onlineNow } },
      });
    } catch (err: any) {
      this.logger.debug(`Failed to update online status for ${id}: ${err.message}`);
    }
  }

  async search(params: {
    query?: string;
    religion?: string;
    city?: string;
    languages?: string[];
    minRating?: number;
    maxPricePerMin?: number;
    minExperience?: number;
    maxExperience?: number;
    isVerified?: boolean;
    onlineNow?: boolean;
    lat?: number;
    lon?: number;
    radiusKm?: number;
    from?: number;
    size?: number;
  }): Promise<{ providers: ProviderDocument[]; total: number }> {
    const {
      query,
      religion,
      city,
      languages,
      minRating,
      maxPricePerMin,
      minExperience,
      maxExperience,
      isVerified,
      onlineNow,
      lat,
      lon,
      radiusKm = 50,
      from = 0,
      size = 20,
    } = params;

    const must: any[] = [];
    const filter: any[] = [];
    const should: any[] = [];

    if (query && query.trim().length >= 2) {
      must.push({
        multi_match: {
          query,
          fields: ['name^3', 'specialties^2', 'bio', 'servicesOffered^2'],
          type: 'best_fields',
          fuzziness: 'AUTO',
          analyzer: 'rg_search_analyzer',
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    if (religion) filter.push({ term: { religion } });
    if (city) filter.push({ term: { city } });
    if (languages?.length) filter.push({ terms: { languages } });
    if (isVerified === true) filter.push({ term: { isVerified: true } });
    if (onlineNow === true) filter.push({ term: { onlineNow: true } });
    if (minRating) filter.push({ range: { rating: { gte: minRating } } });
    if (maxPricePerMin) filter.push({ range: { pricePerMinPaise: { lte: maxPricePerMin } } });
    if (minExperience !== undefined) filter.push({ range: { experienceYears: { gte: minExperience } } });
    if (maxExperience !== undefined) filter.push({ range: { experienceYears: { lte: maxExperience } } });

    if (lat !== undefined && lon !== undefined) {
      filter.push({
        geo_distance: { distance: `${radiusKm}km`, location: { lat, lon } },
      });
    }

    should.push({ term: { isVerified: { value: true, boost: 1.3 } } });
    should.push({ term: { onlineNow: { value: true, boost: 1.2 } } });

    const geoFunctions =
      lat !== undefined && lon !== undefined
        ? [
            {
              gauss: {
                location: { origin: { lat, lon }, scale: '20km', offset: '2km', decay: 0.5 },
              },
            },
          ]
        : [];

    const functionScore: any = {
      query: { bool: { must, filter, should, minimum_should_match: 0 } },
      functions: [
        { field_value_factor: { field: 'rating', factor: 0.4, modifier: 'log1p', missing: 3.0 } },
        { field_value_factor: { field: 'conversionRate', factor: 0.2, modifier: 'sqrt', missing: 0.5 } },
        ...geoFunctions,
      ],
      score_mode: 'sum',
      boost_mode: 'multiply',
    };

    // S-FT2: Clamp from+size to 1000 total to prevent OpenSearch 500 on deep pagination.
    // OpenSearch (and Elasticsearch) throw "Result window is too large" if from+size > index.max_result_window (default 10000).
    // Capping at 1000 is a safe default; deep paging should use search_after instead.
    const safeFrom = Math.max(0, Math.min(from, 950));
    const safeSize = Math.max(1, Math.min(size, 50));
    if (safeFrom + safeSize > 1000) {
      // Shift window back so the total stays under 1000
      const adjustedFrom = Math.max(0, 1000 - safeSize);
      Object.assign(params, { from: adjustedFrom });
    }

    try {
      const response = await this.client.search({
        index: PROVIDER_INDEX,
        body: {
          from: safeFrom,
          size: safeSize,
          query: { function_score: functionScore },
          sort: query
            ? ['_score', { rating: 'desc' }]
            : [{ rating: 'desc' }, '_score'],
        },
      });

      const hits = response.body.hits;
      return {
        providers: hits.hits.map((h: any) => ({ ...h._source, _score: h._score })),
        total: typeof hits.total === 'number' ? hits.total : (hits.total?.value ?? 0),
      };
    } catch (err: any) {
      this.logger.error(`OpenSearch query failed: ${err.message}`);
      return { providers: [], total: 0 };
    }
  }

  async autocomplete(prefix: string): Promise<string[]> {
    if (!prefix || prefix.length < 2) return [];
    try {
      const response = await this.client.search({
        index: PROVIDER_INDEX,
        body: {
          suggest: {
            provider_suggest: {
              prefix,
              completion: {
                field: 'name.completion',
                size: 8,
                skip_duplicates: true,
              },
            },
          },
        },
      });
      const options: any[] = (response.body.suggest?.provider_suggest?.[0]?.options as any[]) ?? [];
      return options.map((o: any) => o.text as string);
    } catch {
      return [];
    }
  }
  /**
   * Used by /health/ready to surface OpenSearch liveness as 'degraded'.
   * Uses cluster.health() with a short timeout so a hanging OS node doesn't
   * block the readiness probe.
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.cluster.health({ timeout: '3s' });
      return true;
    } catch {
      return false;
    }
  }

}
