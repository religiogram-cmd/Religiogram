import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanTypeToSession1700000000059 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE consultation_sessions 
      ADD COLUMN IF NOT EXISTS plan_type VARCHAR(30) NULL
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE consultation_sessions DROP COLUMN IF EXISTS plan_type`);
  }
}
