import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `faith` column to `users` so seekers can persist their faith
 * preference across devices. Nullable so existing accounts before this
 * migration remain valid. Values: all | hindu | muslim | sikh | christian
 * (enforced at the DTO layer in users.controller.ts).
 */
export class AddUserFaithColumn1700000000067 implements MigrationInterface {
  name = 'AddUserFaithColumn1700000000067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard against the column already existing — some dev environments
    // had TypeORM `synchronize: true` briefly and may already have it.
    const hasCol = await queryRunner.hasColumn('users', 'faith');
    if (!hasCol) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "faith" varchar(20)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.hasColumn('users', 'faith');
    if (hasCol) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "faith"`);
    }
  }
}
