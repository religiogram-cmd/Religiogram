import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 024 — Places: Gallery, Donations, Google Places integration
 *
 * Changes:
 *   1. temples table
 *      + gallery_urls   text[]  DEFAULT '{}'  — HD photo gallery per place
 *      + google_place_id varchar(200) UNIQUE  — link to Google Places
 *      + donation_enabled boolean DEFAULT false
 *      + donation_upi_id  varchar(100)         — optional UPI for offline display
 *      + description  text                     — long-form "about" text
 *
 *   2. place_donations table (new)
 *      Full Razorpay donation lifecycle per place.
 *
 *   3. place_reviews table (new)
 *      1-5 star reviews by verified users.
 *      Partial unique index: one non-deleted review per (user, place).
 *      Trigger: after insert/update/delete → recalculate temples.rating_avg + rating_count.
 */
export class PlacesGalleryDonationsGoogle1700000000024
  implements MigrationInterface
{
  public async up(qr: QueryRunner): Promise<void> {
    /* ── 1. Extend temples table ──────────────────────────────────────── */
    await qr.query(`
      ALTER TABLE temples
        ADD COLUMN IF NOT EXISTS gallery_urls       text[]        NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS google_place_id    varchar(200)  NULL,
        ADD COLUMN IF NOT EXISTS donation_enabled   boolean       NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS donation_upi_id    varchar(100)  NULL,
        ADD COLUMN IF NOT EXISTS description        text          NULL;
    `);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS IDX_temples_google_place_id
        ON temples (google_place_id)
        WHERE google_place_id IS NOT NULL;
    `);

    /* ── 2. place_donations table ─────────────────────────────────────── */
    await qr.query(`
      CREATE TABLE IF NOT EXISTS place_donations (
        id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id              uuid          NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        user_id               uuid          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        amount_paise          integer       NOT NULL CHECK (amount_paise >= 100),
        currency              varchar(3)    NOT NULL DEFAULT 'INR',
        status                varchar(20)   NOT NULL DEFAULT 'created'
                                            CHECK (status IN ('created','captured','failed','refunded')),
        razorpay_order_id     varchar(200)  NULL UNIQUE,
        razorpay_payment_id   varchar(200)  NULL UNIQUE,
        razorpay_signature    text          NULL,
        message               text          NULL,
        is_anonymous          boolean       NOT NULL DEFAULT false,
        idempotency_key       varchar(64)   NOT NULL UNIQUE,
        webhook_payload       jsonb         NULL,
        failure_reason        text          NULL,
        created_at            timestamptz   NOT NULL DEFAULT now(),
        updated_at            timestamptz   NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_donations_place
        ON place_donations (place_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS IDX_place_donations_user
        ON place_donations (user_id, created_at DESC);
    `);

    /* ── 3. place_reviews table ───────────────────────────────────────── */
    await qr.query(`
      CREATE TABLE IF NOT EXISTS place_reviews (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id      uuid        NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        user_id       uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        rating        smallint    NOT NULL CHECK (rating >= 1 AND rating <= 5),
        body          text        NULL,
        is_hidden     boolean     NOT NULL DEFAULT false,
        helpful_count integer     NOT NULL DEFAULT 0,
        visit_date    date        NULL,
        photo_urls    text[]      NOT NULL DEFAULT '{}',
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
    `);

    /* One active review per (user, place) — hidden ones don't count */
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_place_reviews_user_place
        ON place_reviews (user_id, place_id)
        WHERE is_hidden = false;

      CREATE INDEX IF NOT EXISTS IDX_place_reviews_place
        ON place_reviews (place_id, created_at DESC)
        WHERE is_hidden = false;
    `);

    /* ── 4. Aggregate trigger — keep temples.rating_avg / rating_count in sync */
    await qr.query(`
      CREATE OR REPLACE FUNCTION fn_update_place_rating()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE
        v_place_id uuid;
      BEGIN
        v_place_id := COALESCE(NEW.place_id, OLD.place_id);
        UPDATE temples
        SET
          rating_avg   = (
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM place_reviews
            WHERE place_id = v_place_id AND is_hidden = false
          ),
          rating_count = (
            SELECT COUNT(*)
            FROM place_reviews
            WHERE place_id = v_place_id AND is_hidden = false
          )
        WHERE id = v_place_id;
        RETURN NULL;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_place_rating ON place_reviews;
      CREATE TRIGGER trg_place_rating
        AFTER INSERT OR UPDATE OR DELETE ON place_reviews
        FOR EACH ROW EXECUTE FUNCTION fn_update_place_rating();
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TRIGGER  IF EXISTS trg_place_rating ON place_reviews;`);
    await qr.query(`DROP FUNCTION IF EXISTS fn_update_place_rating();`);
    await qr.query(`DROP TABLE    IF EXISTS place_reviews;`);
    await qr.query(`DROP TABLE    IF EXISTS place_donations;`);
    await qr.query(`DROP INDEX    IF EXISTS IDX_temples_google_place_id;`);
    await qr.query(`
      ALTER TABLE temples
        DROP COLUMN IF EXISTS description,
        DROP COLUMN IF EXISTS donation_upi_id,
        DROP COLUMN IF EXISTS donation_enabled,
        DROP COLUMN IF EXISTS google_place_id,
        DROP COLUMN IF EXISTS gallery_urls;
    `);
  }
}
