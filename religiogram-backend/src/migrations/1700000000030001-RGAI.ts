/**
 * NOTE: This migration uses a non-standard sub-versioned timestamp (30001)
 * because it was added as a patch alongside migration 030 during the same
 * batch merge. TypeORM sorts by timestamp string lexicographically, so
 * 1700000000030001 sorts after 1700000000030000 as expected.
 * Do NOT follow this pattern — use a strictly increasing timestamp for new migrations.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RGAI1700000000030001 implements MigrationInterface {
  name = 'RGAI1700000000030001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // ── ai_conversations ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ai_conversations" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"       UUID        NOT NULL,
        "title"         VARCHAR(255),
        "religion"      VARCHAR(50),
        "language"      VARCHAR(20)  NOT NULL DEFAULT 'en',
        "summary"       TEXT,
        "turn_count"    INTEGER      NOT NULL DEFAULT 0,
        "is_premium"    BOOLEAN      NOT NULL DEFAULT false,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_conversations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ai_conv_user" ON "ai_conversations" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ai_conv_updated" ON "ai_conversations" ("updated_at" DESC)`);

    // ── ai_messages ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ai_messages" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" UUID        NOT NULL,
        "user_id"         UUID        NOT NULL,
        "role"            VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool')),
        "content"         TEXT        NOT NULL,
        "tool_name"       VARCHAR(100),
        "tool_args"       JSONB,
        "tool_result"     JSONB,
        "tokens_used"     INTEGER,
        "model_used"      VARCHAR(60),
        "latency_ms"      INTEGER,
        "flagged"         BOOLEAN     NOT NULL DEFAULT false,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ai_msg_conv" FOREIGN KEY ("conversation_id")
          REFERENCES "ai_conversations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ai_msg_conv" ON "ai_messages" ("conversation_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_ai_msg_user_recent" ON "ai_messages" ("user_id", "created_at" DESC)`);

    // ── ai_birth_profiles ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ai_birth_profiles" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"       UUID         NOT NULL UNIQUE,
        "full_name"     VARCHAR(200) NOT NULL,
        "birth_date"    DATE         NOT NULL,
        "birth_time"    TIME,
        "birth_city"    VARCHAR(200) NOT NULL,
        "birth_lat"     DOUBLE PRECISION,
        "birth_lng"     DOUBLE PRECISION,
        "timezone"      VARCHAR(60),
        "rashi"         VARCHAR(60),
        "nakshatra"     VARCHAR(60),
        "lagna"         VARCHAR(60),
        "kundli_json"   JSONB,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_birth_profiles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ai_birth_user" ON "ai_birth_profiles" ("user_id")`);

    // ── ai_usage_daily ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ai_usage_daily" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID        NOT NULL,
        "date"        DATE        NOT NULL,
        "action"      VARCHAR(60) NOT NULL,
        "count"       INTEGER     NOT NULL DEFAULT 0,
        "is_premium"  BOOLEAN     NOT NULL DEFAULT false,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_usage_daily" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ai_usage_daily" UNIQUE ("user_id", "date", "action")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ai_usage_user_date" ON "ai_usage_daily" ("user_id", "date")`);

    // ── knowledge_docs (pgvector RAG) ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "knowledge_docs" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "source"      VARCHAR(100) NOT NULL,
        "religion"    VARCHAR(50),
        "language"    VARCHAR(20)  NOT NULL DEFAULT 'en',
        "title"       VARCHAR(500) NOT NULL,
        "content"     TEXT         NOT NULL,
        "chunk_index" INTEGER      NOT NULL DEFAULT 0,
        "embedding"   vector(768),
        "metadata"    JSONB,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_knowledge_docs" PRIMARY KEY ("id")
      )
    `);
    // ivfflat index for fast ANN search (lists=100 for ~200 docs, tune as corpus grows)
    await queryRunner.query(`
      CREATE INDEX "idx_knowledge_embedding" ON "knowledge_docs"
      USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)
    `);
    await queryRunner.query(`CREATE INDEX "idx_knowledge_religion" ON "knowledge_docs" ("religion", "language")`);

    // ── ai_safety_reviews ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ai_safety_reviews" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "message_id"    UUID,
        "user_id"       UUID         NOT NULL,
        "trigger_layer" VARCHAR(20)  NOT NULL CHECK (trigger_layer IN ('keyword','gemini','post_classifier')),
        "content_hash"  VARCHAR(64),
        "violation_type" VARCHAR(100),
        "severity"      VARCHAR(20)  NOT NULL DEFAULT 'low',
        "reviewed_by"   UUID,
        "reviewed_at"   TIMESTAMPTZ,
        "status"        VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cleared','actioned')),
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_safety_reviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_safety_pending" ON "ai_safety_reviews" ("status", "created_at") WHERE status = 'pending'`);
    await queryRunner.query(`CREATE INDEX "idx_safety_user" ON "ai_safety_reviews" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_safety_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_docs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_birth_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_conversations"`);
  }
}
