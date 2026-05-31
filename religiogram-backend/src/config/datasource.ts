import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('DataSource');

loadEnv();

/**
 * TypeORM CLI DataSource â€” used by `npm run migration:run / revert / generate`.
 *
 * â”€â”€ Why DATABASE_DIRECT_URL? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The production app routes Postgres connections through PgBouncer in transaction
 * pooling mode (DATABASE_VIA_PROXY=true). Transaction mode is optimal for app
 * traffic (many short queries, small pool footprint) but breaks TypeORM migrations
 * because:
 *
 *   â€¢ TypeORM acquires pg_advisory_lock() to serialize concurrent migration runners.
 *   â€¢ Advisory locks are SESSION-scoped. PgBouncer transaction mode can recycle the
 *     underlying server connection between statements, silently releasing the advisory
 *     lock and allowing a second migration runner to proceed concurrently â€” corrupting
 *     the schema.
 *
 * Solution: the migration CLI always connects via DATABASE_DIRECT_URL, which bypasses
 * PgBouncer and maintains a true persistent session, so advisory locks work correctly.
 *
 * In production set DATABASE_DIRECT_URL to the RDS primary endpoint directly (not the
 * PgBouncer host). In local dev and CI both variables can point to the same Postgres.
 *
 * If DATABASE_DIRECT_URL is not set, falls back to DATABASE_URL with a warning.
 */
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL (or DATABASE_DIRECT_URL) is required for migrations');
}

if (!process.env.DATABASE_DIRECT_URL && process.env.DATABASE_VIA_PROXY === 'true') {
  logger.warn(
    'DATABASE_VIA_PROXY=true but DATABASE_DIRECT_URL is not set. ' +
    'Migrations will run through PgBouncer, which may cause advisory lock issues. ' +
    'Set DATABASE_DIRECT_URL to the direct Postgres endpoint to avoid this.',
  );
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  migrationsTransactionMode: 'each',
  ssl: process.env.DATABASE_SSL === 'true'
    ? {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_SSL_CA
          ? Buffer.from(process.env.DATABASE_SSL_CA, 'base64').toString('utf-8')
          : undefined,
      }
    : false,
  logging: ['error', 'warn', 'migration'],
});

