import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingSlotUniqueConstraint1700000000058 implements MigrationInterface {
  public transaction = false;
  name = 'BookingSlotUniqueConstraint1700000000058';

  async up(qr: QueryRunner): Promise<void> {
    // Partial unique index: one confirmed/pending booking per provider per slot
    await qr.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS bookings_provider_slot_uq
        ON bookings (provider_id, scheduled_at)
        WHERE status NOT IN ('CANCELLED', 'PAYMENT_FAILED', 'REFUNDED', 'EXPIRED')
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX CONCURRENTLY IF EXISTS bookings_provider_slot_uq`);
  }
}
