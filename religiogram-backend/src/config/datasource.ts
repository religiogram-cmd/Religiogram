import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as path from 'path';

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

/**
 * Path resolution — CRITICAL for prod deploys.
 *
 * The CLI can be invoked two ways:
 *   • Local dev: `npm run migration:run` → typeorm-ts-node-commonjs reads
 *     this .ts file directly. __dirname = <repo>/src/config. Entities and
 *     migrations exist as .ts.
 *   • Prod (Railway): `npx typeorm migration:run -d dist/src/config/datasource.js`
 *     reads the compiled .js file. __dirname = /app/dist/src/config. Entities
 *     and migrations exist as .js.
 *
 * Anchor globs to __dirname (not cwd!) and accept both extensions so the
 * same file works in both worlds — no separate prod datasource file.
 *
 * Extra caution: for SSL in prod (Railway Postgres or managed DB), we need
 * `rejectUnauthorized: false` unless a CA cert is provided. The startup
 * app uses the same rule via typeorm.factory.ts.
 */
const migrationsSsl: boolean | { rejectUnauthorized: boolean; ca?: string } =
  process.env.DATABASE_SSL === 'true'
    ? process.env.DATABASE_SSL_CA
      ? {
          rejectUnauthorized: true,
          ca: Buffer.from(process.env.DATABASE_SSL_CA, 'base64').toString('utf-8'),
        }
      : { rejectUnauthorized: false }
    : false;

export default new DataSource({
  type: 'postgres',
  url,
  entities:   [path.join(__dirname, '../**/*.entity.{js,ts}')],
  migrations: [path.join(__dirname, '../migrations/*.{js,ts}')],
  migrationsTransactionMode: 'each',
  ssl: migrationsSsl,
  logging: ['error', 'warn', 'migration'],
});

