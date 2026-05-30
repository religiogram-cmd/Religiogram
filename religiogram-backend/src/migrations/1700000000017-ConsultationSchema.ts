import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsultationSchema1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $do$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type_enum') THEN
          CREATE TYPE message_type_enum AS ENUM ('text', 'image', 'system');
        END IF;
      END
      $do$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultation_messages (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   UUID        NOT NULL,
        sender_id    UUID        NOT NULL,
        sender_role  VARCHAR(20) NOT NULL,
        message_type message_type_enum NOT NULL DEFAULT 'text',
        content      TEXT        NOT NULL,
        is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
        seq          INT         NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_session_time
        ON consultation_messages(session_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_session_seq
        ON consultation_messages(session_id, seq)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultation_messages CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS message_type_enum`);
  }
}
