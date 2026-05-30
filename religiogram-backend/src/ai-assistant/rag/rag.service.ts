import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { KnowledgeDoc } from '../entities/knowledge-doc.entity';

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.75;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly apiKey: string;

  constructor(
    @InjectRepository(KnowledgeDoc)
    private readonly docRepo: Repository<KnowledgeDoc>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.apiKey = config.get<string>('GEMINI_API_KEY', '');
  }

  async embedQuery(text: string): Promise<number[] | null> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai') as any;
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (e: any) {
      this.logger.warn(`Embedding failed: ${e?.message}`);
      return null;
    }
  }

  async retrieveRelevant(query: string, opts?: {
    religion?: string;
    language?: string;
    limit?: number;
  }): Promise<{ docs: KnowledgeDoc[]; usedRag: boolean }> {
    const embedding = await this.embedQuery(query);

    if (!embedding) {
      return { docs: [], usedRag: false };
    }

    const limit = opts?.limit ?? TOP_K;
    const vectorStr = `[${embedding.join(',')}]`;

    try {
      // pgvector cosine distance query
      let sql = `
        SELECT id, source, religion, language, title, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity
        FROM knowledge_docs
        WHERE 1 - (embedding <=> $1::vector) > $2
      `;
      const params: any[] = [vectorStr, SIMILARITY_THRESHOLD];
      let paramIdx = 3;

      if (opts?.religion) {
        sql += ` AND (religion IS NULL OR religion = $${paramIdx})`;
        params.push(opts.religion);
        paramIdx++;
      }

      if (opts?.language && opts.language !== 'en') {
        sql += ` AND (language = 'en' OR language = $${paramIdx})`;
        params.push(opts.language);
        paramIdx++;
      }

      sql += ` ORDER BY similarity DESC LIMIT $${paramIdx}`;
      params.push(limit);

      const rows = await this.dataSource.query(sql, params);
      const docs = rows.map((r: any) => ({
        ...r,
        embedding: undefined, // don't send back raw vector
      })) as KnowledgeDoc[];

      return { docs, usedRag: docs.length > 0 };
    } catch (e: any) {
      this.logger.warn(`pgvector query failed: ${e?.message}`);
      return { docs: [], usedRag: false };
    }
  }

  buildRagContext(docs: KnowledgeDoc[]): string {
    if (docs.length === 0) return '';
    const chunks = docs.map((d, i) =>
      `[${i + 1}] ${d.title} (${d.source})\n${d.content}`
    ).join('\n\n');
    return `Relevant knowledge base excerpts:\n\n${chunks}\n\n`;
  }

  /** Upsert a document + its embedding into knowledge_docs */
  async upsertDoc(doc: Partial<KnowledgeDoc> & { content: string; title: string; source: string }): Promise<void> {
    const embedding = await this.embedQuery(doc.content);
    const vectorStr = embedding ? `[${embedding.join(',')}]` : null;

    if (vectorStr) {
      await this.dataSource.query(
        `INSERT INTO knowledge_docs (id, source, religion, language, title, content, chunk_index, embedding, metadata)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::vector, $8)
         ON CONFLICT DO NOTHING`,
        [
          doc.source, doc.religion ?? null, doc.language ?? 'en',
          doc.title, doc.content, doc.chunkIndex ?? 0, vectorStr,
          doc.metadata ? JSON.stringify(doc.metadata) : null,
        ],
      );
    } else {
      const entity = this.docRepo.create(doc);
      await this.docRepo.save(entity);
    }
  }
}
