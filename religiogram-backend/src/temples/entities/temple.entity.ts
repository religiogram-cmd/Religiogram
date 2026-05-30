import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Temple entity -- maps to the `temples` table.
 *
 * Migrations:
 *   004 CreateTemples       : core columns
 *   008 CreatePlaceTypes    : type discriminator
 *   009 CreatePlaceClaims   : owner_id FK
 *   024 PlacesGalleryEtc    : gallery_urls, google_place_id, description,
 *                             donation_enabled, donation_upi_id
 *
 * Geo: PostGIS geography(Point,4326) on `location`.
 * select:false prevents raw WKB in responses; use lat/lng mirrors instead.
 */
@Entity('temples')
export class Temple {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index('IDX_temples_city')
  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Index('IDX_temples_location', { spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    select: false,
    nullable: true,
  })
  location!: string | null;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ name: 'rating_avg', type: 'numeric', precision: 3, scale: 2, nullable: true })
  ratingAvg!: string | null;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount!: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  hours!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  deity!: string | null;

  @Index('IDX_temples_type')
  @Column({ type: 'varchar', length: 20, default: 'temple' })
  type!: string;

  /** Primary cover photo URL (S3 / CDN). */
  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  /** HD photo gallery -- array of S3/CDN URLs (migration 024). */
  @Column({ name: 'gallery_urls', type: 'text', array: true, default: [] })
  galleryUrls!: string[];

  /** Google Places ID for live data sync (migration 024). */
  @Column({ name: 'google_place_id', type: 'varchar', length: 200, nullable: true, unique: true })
  googlePlaceId!: string | null;

  /** Long-form about text (migration 024). */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  /** Razorpay donation enabled flag (migration 024). */
  @Column({ name: 'donation_enabled', type: 'boolean', default: false })
  donationEnabled!: boolean;

  /** Optional UPI ID displayed on the donation screen (migration 024). */
  @Column({ name: 'donation_upi_id', type: 'varchar', length: 100, nullable: true })
  donationUpiId!: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
