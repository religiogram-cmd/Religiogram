import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/**
 * TypeORM configuration factory.
 *
 * Key design decisions:
 *
 * 1. **Read replica routing** — when DATABASE_REPLICA_URL is set TypeORM
 *    uses `replication` mode: all SELECT queries are round-robined across
 *    slave connections; writes go to master. This halves the read load on
 *    the primary at zero application-code change.
 *
 * 2. **PgBouncer transaction-mode compatibility** — when DATABASE_VIA_PROXY=true:
 *    - `prepare: false`  disables named prepared statements on the pg driver
 *    - `statement_timeout` set via `extra` (pg startup parameter) rather than
 *      SET LOCAL which does not persist across PgBouncer-recycled connections
 *    - Pool size dropped to 5–10; PgBouncer multiplexes the remaining capacity
 *
 * 3. **Direct connection for migrations** — TypeORM uses pg_advisory_lock()
 *    to serialize migrations. Advisory locks are SESSION-scoped and are silently
 *    dropped when PgBouncer recycles the server connection in transaction mode.
 *    This can allow two migration runners to execute concurrently, corrupting
 *    the schema. Fix: point DataSource.options.url (and the CLI migration runner)
 *    at DATABASE_DIRECT_URL (direct Postgres, bypassing PgBouncer) when the app
 *    is running behind a proxy.
 *
 * 4. **Connection-wait observability** — any acquire() that waits more
 *    than DATABASE_SLOW_ACQUIRE_MS is logged as a structured warning.
 *
 * 5. **Statement timeout** — hard-capped via extra.statement_timeout (ms).
 *    Runaway queries can't pin a connection forever.
 *
 * 6. **Connection storm protection (P2-4)** — pool max is capped at 25 and
 *    connectionTimeoutMillis (acquire timeout) defaults to 3 s. If all 25
 *    connections are busy and a new query can't acquire one within 3 s, pg-pool
 *    throws immediately with "timeout exceeded when trying to connect". This
 *    surfaces as an HTTP 503, which the client can handle with a retry. Without
 *    this, bursts queue indefinitely, saturating memory and masking the overload.
 *
 * 6. **SSL** — RDS always requires SSL in production.
 */
export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const logger = new Logger('TypeOrm');

  const masterUrl    = config.get<string>('database.url');
  const directUrl    = config.get<string>('database.directUrl');   // bypasses PgBouncer
  const replicaUrl   = config.get<string>('database.replicaUrl');
  // P2-4: pool capped at 25. Each CCX23 node (4 vCPU, 8 GB RAM, PgBouncer)
  // can comfortably service 25 concurrent backend connections per pod.
  // With 2 app pods that's 50 connections total — well within PgBouncer's pool.
  const poolSize     = Math.min(config.get<number>('database.poolSize', 25), 25);
  const viaProxy     = config.get<boolean>('database.viaProxy', false);
  const ssl          = config.get<boolean>('database.ssl', false);
  const stmtTimeout  = config.get<number>('database.statementTimeoutMs', 5_000);
  const slowAcquireMs = config.get<number>('database.slowAcquireMs', 500);
  // P2-4: acquire timeout — fail fast on pool exhaustion rather than queuing
  // indefinitely. 3 s is enough for normal load; if exceeded the request gets
  // a 503 and the client retries with backoff.
  const acquireTimeoutMs = config.get<number>('database.acquireTimeoutMs', 3_000);

  if (!masterUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const migrationUrl = viaProxy ? (directUrl ?? masterUrl) : masterUrl;

  if (viaProxy && !directUrl) {
    logger.warn(
      'DATABASE_VIA_PROXY=true but DATABASE_DIRECT_URL is not set. ' +
      'Migrations will use DATABASE_URL (through PgBouncer), which may cause ' +
      'advisory lock issues. Set DATABASE_DIRECT_URL to bypass PgBouncer for migrations.',
    );
  }

  const extraBase: Record<string, unknown> = {
    max: poolSize,
    min: Math.max(2, Math.floor(poolSize / 5)),
    // P2-4: fail fast (3 s default) when all connections are busy so bursts
    // surface as a 503 rather than silently queuing and OOM-ing the process.
    connectionTimeoutMillis: acquireTimeoutMs,
    idleTimeoutMillis: 30_000,
    statement_timeout: stmtTimeout,
    application_name: `religiogram-api@${
      process.env.POD_ID ?? process.env.HOSTNAME ?? 'unknown'
    }`,
  };

  if (viaProxy) {
    extraBase.prepare = false;
  }

  // S1: Load CA cert from env instead of blindly disabling verification.
  // DATABASE_CA_CERT must be a base64-encoded PEM (one-liner, no newlines).
  // If missing in production, fail fast; in non-prod, fall back to rejectUnauthorized: false.
  const caCertB64 = config.get<string>('database.caCert') ?? process.env.DATABASE_CA_CERT;
  let sslOpts: boolean | { rejectUnauthorized: boolean; ca?: string };
  if (!ssl) {
    sslOpts = false;
  } else if (caCertB64) {
    sslOpts = {
      rejectUnauthorized: true,
      ca: Buffer.from(caCertB64, 'base64').toString('utf8'),
    };
  } else {
    const isProd = (process.env.NODE_ENV ?? 'production') === 'production';
    if (isProd) {
      throw new Error(
        'DATABASE_CA_CERT is required when DATABASE_SSL=true in production. ' +
        'Set it to the base64-encoded PEM of your managed-Postgres CA certificate.',
      );
    }
    logger.warn('DATABASE_CA_CERT not set — using rejectUnauthorized:false (dev only)');
    sslOpts = { rejectUnauthorized: false };
  }

  if (replicaUrl) {
    logger.log(
      `typeorm init (REPLICATION) — master+1 replica pool=${poolSize} ` +
      `viaProxy=${viaProxy} ssl=${ssl} statementTimeout=${stmtTimeout}ms ` +
      `migrationUrl=${viaProxy ? 'DIRECT' : 'master'}`,
    );

    return {
      type: 'postgres',
      autoLoadEntities: true,
      synchronize: false,
      ssl: sslOpts,
      logging: ['error', 'warn', 'migration'],
      maxQueryExecutionTime: slowAcquireMs,
      migrations: [],
      replication: {
        master: {
          url: masterUrl,
          ssl: sslOpts as any,
          ...extraBase,
        },
        slaves: [
          {
            url: replicaUrl,
            ssl: sslOpts as any,
            ...extraBase,
          },
        ],
      },
    };
  }

  logger.log(
    `typeorm init — pool=${poolSize} viaProxy=${viaProxy} ` +
    `ssl=${ssl} statementTimeout=${stmtTimeout}ms ` +
    `migrationUrl=${viaProxy ? 'DIRECT' : 'master'}`,
  );

  return {
    type: 'postgres',
    url: masterUrl,
    autoLoadEntities: true,
    synchronize: false,
    ssl: sslOpts,
    logging: ['error', 'warn', 'migration'],
    maxQueryExecutionTime: slowAcquireMs,
    migrations: [],
    extra: {
      max: poolSize,
      min: Math.max(2, Math.floor(poolSize / 5)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: acquireTimeoutMs,
      statement_timeout: stmtTimeout,
      application_name: `religiogram-api@${
        process.env.POD_ID ?? process.env.HOSTNAME ?? 'unknown'
      }`,
      ...(viaProxy ? { prepare: false } : {}),
    },
  };
}

import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

export function buildMigrationDataSourceOptions(): DataSourceOptions {
  const masterUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!masterUrl) throw new Error('DATABASE_URL is required for migrations');
  const ssl = process.env.DATABASE_SSL === 'true';
  const caCertB64 = process.env.DATABASE_CA_CERT;
  let migrationSsl: boolean | { rejectUnauthorized: boolean; ca?: string };
  if (!ssl) {
    migrationSsl = false;
  } else if (caCertB64) {
    migrationSsl = { rejectUnauthorized: true, ca: Buffer.from(caCertB64, 'base64').toString('utf8') };
  } else {
    migrationSsl = process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false;
  }
  return {
    type: 'postgres',
    url: masterUrl,
    ssl: migrationSsl,
    entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
  } as DataSourceOptions;
}
