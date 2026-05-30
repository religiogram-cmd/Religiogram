import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — users + auth_events (audit log for DPDP Act 2023).
 * Run: npm run migration:run
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone"           varchar(15),
        "email"           varchar(255),
        "name"            varchar(100),
        "provider"        varchar(20) NOT NULL DEFAULT 'phone',
        "google_id"       varchar(100),
        "role"            varchar(20) NOT NULL DEFAULT 'seeker',
        "avatar_url"      text,
        "is_verified"     boolean NOT NULL DEFAULT false,
        "is_active"       boolean NOT NULL DEFAULT true,
        "last_login_at"   timestamptz,
        "last_login_ip"   inet,
        "last_device_id"  varchar(100),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_users_identifier
          CHECK (phone IS NOT NULL OR email IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_phone" ON "users" ("phone") WHERE phone IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE email IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_google_id" ON "users" ("google_id") WHERE google_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_role" ON "users" ("role")
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_events" (
        "id"          bigserial PRIMARY KEY,
        "user_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "event_type"  varchar(40) NOT NULL,
        "phone"       varchar(15),
        "ip_address"  inet,
        "user_agent"  text,
        "device_id"   varchar(100),
        "metadata"    jsonb,
        "created_at"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_events_user" ON "auth_events" ("user_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_events_type" ON "auth_events" ("event_type", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
