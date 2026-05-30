-- ─────────────────────────────────────────────────────────────
-- ReligioGram — PostgreSQL initialisation script
-- Runs once when the Postgres container first boots.
--
-- NOTE: shared_preload_libraries is set via the docker-compose
-- postgres "command" override so it is active from first boot.
-- This script runs after the server starts, so CREATE EXTENSION
-- calls below work for libraries that were pre-loaded.
-- ─────────────────────────────────────────────────────────────

-- PostGIS: required for temple geo queries (ST_DWithin, ST_Distance, geography type)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- pg_trgm: powers ILIKE fuzzy search and GIN trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- uuid-ossp: gen_random_uuid() is available in PG 13+ without this,
-- but uuid_generate_v4() is sometimes used in raw SQL. Belt-and-suspenders.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_stat_statements: tracks per-query execution statistics.
-- Requires shared_preload_libraries='pg_stat_statements' at server start.
-- Set via docker-compose postgres command: -c shared_preload_libraries=...
-- Consumed by postgres_exporter custom queries (config/postgres-exporter/queries.yaml)
-- and by Prometheus slow-query alert rules (config/prometheus/rules/slow-query.yml).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- pg_partman: background worker for automatic partition management.
-- Required for PartmanService (POST /v1/admin/ops/partman/run) and the
-- K8s CronJob (k8s/partman/cronjob.yaml).
--
-- Installation note for Docker:
--   The postgis/postgis:16-3.4-alpine image does not include pg_partman.
--   For local development, use the custom postgres image:
--     docker compose up --build postgres
--   which installs postgresql16-partman via apk.
--
-- For AWS RDS: enable via:
--   aws rds modify-db-parameter-group \
--     --parameter-name shared_preload_libraries \
--     --parameter-value 'pg_stat_statements,pg_partman_bgw'
--   Then: CREATE EXTENSION pg_partman;
--         SELECT partman.create_parent('public.feed_items', 'created_at', 'native', 'monthly');
CREATE EXTENSION IF NOT EXISTS pg_partman CASCADE;

-- Set timezone for all sessions in this DB
ALTER DATABASE religiogram SET timezone TO 'Asia/Kolkata';

-- Set default search path
ALTER DATABASE religiogram SET search_path TO public;

-- pg_stat_statements configuration
-- track = 'all' captures utility statements (COPY, VACUUM) in addition to DML.
-- track_io_timing = on allows measuring actual I/O time per query (slight overhead).
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET pg_stat_statements.max = 10000;
ALTER SYSTEM SET track_io_timing = on;

-- Log slow queries to the Postgres log (also captured by pino if using pg driver).
ALTER SYSTEM SET log_min_duration_statement = 500;  -- ms; log queries > 500ms

-- Autovacuum: more aggressive defaults for high-write tables.
-- Per-table overrides are applied by Migration 037 (autovacuum tuning).
ALTER SYSTEM SET autovacuum_vacuum_scale_factor  = 0.05;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.025;

SELECT pg_reload_conf();
