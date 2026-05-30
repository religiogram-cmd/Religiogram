import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `user_files` table — metadata for every S3 upload.
 *
 * Design notes:
 *   - `id` is a uuid generated server-side (we hand it to the client in
 *     the presign response). Doubles as the S3 object id so presence on
 *     S3 is always resolvable from the DB row alone.
 *   - `user_id` cascades on user delete so closing an account scrubs the
 *     metadata. Actual S3 bytes are cleaned up by a separate lifecycle
 *     rule + the delete hook in users.service.
 *   - Composite index (user_id, kind, status) supports the two hottest
 *     queries: "give me this user's profile photo" and "list their
 *     confirmed documents".
 *   - Partial index on status='pending' lets the sweeper find expired
 *     rows without scanning the whole table.
 */
export class CreateUserFiles1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_files" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       uuid NOT NULL,
        "kind"          varchar(20) NOT NULL,
        "key"           text NOT NULL,
        "url"           text NOT NULL,
        "content_type"  varchar(100) NOT NULL,
        "size_bytes"    bigint NOT NULL,
        "status"        varchar(20) NOT NULL DEFAULT 'pending',
        "original_name" varchar(255),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_files_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_user_files_kind"
          CHECK ("kind" IN ('profile','document','certificate')),
        CONSTRAINT "CHK_user_files_status"
          CHECK ("status" IN ('pending','confirmed','expired'))
      )
    `);

    // Hot read: "this user's profile image" / "this user's confirmed docs"
    await queryRunner.query(`
      CREATE INDEX "IDX_user_files_user_kind_status"
        ON "user_files" ("user_id", "kind", "status")
    `);

    // Sweeper: "pending rows older than 1 hour" → partial so it stays small.
    await queryRunner.query(`
      CREATE INDEX "IDX_user_files_pending_created"
        ON "user_files" ("created_at")
        WHERE status = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_files_pending_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_files_user_kind_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_files"`);
  }
}
