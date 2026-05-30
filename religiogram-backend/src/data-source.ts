import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildMigrationDataSourceOptions } from './config/typeorm.factory';

/**
 * TypeORM CLI DataSource — used by `typeorm migration:run` and `migration:generate`.
 *
 * Always connects via DATABASE_DIRECT_URL (bypassing PgBouncer) so that
 * migration advisory locks (pg_advisory_lock) work correctly in environments
 * where the application uses PgBouncer transaction pooling mode.
 *
 * Usage:
 *   npx typeorm -d src/data-source.ts migration:run
 *   npx typeorm -d src/data-source.ts migration:revert
 *   npx typeorm -d src/data-source.ts migration:show
 *
 * In CI (GitHub Actions), set DATABASE_DIRECT_URL to the RDS primary endpoint.
 * The ci.yml step already does this; see .github/workflows/ci.yml.
 */
export const AppDataSource = new DataSource(
  buildMigrationDataSourceOptions() as any,
);
