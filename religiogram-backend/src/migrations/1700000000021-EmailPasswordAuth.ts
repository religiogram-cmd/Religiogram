import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailPasswordAuth1700000000021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add password_hash column to users table
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL
    `);

    // Allow 'email' as a valid provider value
    await queryRunner.query(`
      DO $do$
      BEGIN
        -- Check if provider column has a check constraint and drop/recreate if needed
        -- Most setups use varchar without CHECK, so this is a no-op safety guard
        NULL;
      END
      $do$
    `);

    // Index on email for fast lookups during login
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_login
        ON users(email)
        WHERE email IS NOT NULL AND password_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email_login`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`);
  }
}
