import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface SearchResult {
  type: 'temple' | 'provider';
  id: string;
  name: string;
  description?: string;
  city?: string;
  imageUrl?: string;
  rating?: number;
  rank: number;
}

export interface SearchResponse {
  temples: SearchResult[];
  providers: SearchResult[];
  total: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(query: string, city?: string, limit = 20): Promise<SearchResponse> {
    if (!query || query.trim().length < 2) {
      return { temples: [], providers: [], total: 0 };
    }

    // Sanitize query — remove special chars that break tsquery (keep Hindi Unicode range)
    const sanitized = query.trim().replace(/[^a-zA-Z0-9 ऀ-ॿ]/g, ' ').trim();
    if (!sanitized) return { temples: [], providers: [], total: 0 };

    // Convert to tsquery: "ram mandir" → "ram:* & mandir:*"
    const tsquery = sanitized
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(' & ');

    const half = Math.floor(limit / 2);

    // Search temples
    const templeResults: SearchResult[] = await this.dataSource.query(
      `
      SELECT
        'temple'                   AS type,
        t.id,
        t.name,
        t.description,
        t.city,
        t.thumbnail_url            AS "imageUrl",
        t.rating_avg               AS rating,
        ts_rank_cd(t.tsv, to_tsquery('english', $1)) AS rank
      FROM temples t
      WHERE
        t.tsv @@ to_tsquery('english', $1)
        ${city ? 'AND t.city = $3' : ''}
      ORDER BY rank DESC
      LIMIT $2
      `,
      city ? [tsquery, half, city] : [tsquery, half],
    );

    // Search providers
    const providerResults: SearchResult[] = await this.dataSource.query(
      `
      SELECT
        'provider'                 AS type,
        sp.id,
        sp.display_name            AS name,
        sp.bio                     AS description,
        sp.city,
        sp.avatar_url              AS "imageUrl",
        sp.rating_avg              AS rating,
        ts_rank_cd(sp.tsv, to_tsquery('english', $1)) AS rank
      FROM service_providers sp
      WHERE
        sp.status = 'approved'
        AND sp.tsv @@ to_tsquery('english', $1)
        ${city ? 'AND sp.city = $3' : ''}
      ORDER BY rank DESC
      LIMIT $2
      `,
      city ? [tsquery, half, city] : [tsquery, half],
    );

    return {
      temples: templeResults,
      providers: providerResults,
      total: templeResults.length + providerResults.length,
    };
  }
}
