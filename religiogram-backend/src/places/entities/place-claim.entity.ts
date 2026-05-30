import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Temple } from '../../temples/entities/temple.entity';
import { User } from '../../users/entities/user.entity';

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/**
 * PlaceClaim — a user's bid to become the official custodian of a place.
 *
 * Lifecycle:
 *   pending   → on submit
 *   approved  → admin accepts; temples.owner_id flips to user_id
 *   rejected  → admin declines; admin_notes carry the reason
 *   withdrawn → user cancels their own pending claim
 *
 * One pending claim per (place, user) is enforced by a partial unique
 * index in migration 1700000000009. Approved/rejected rows are retained
 * for audit and to show a reviewer the claim history on resubmission.
 */
@Entity('place_claims')
@Index('IDX_place_claims_status_created', ['status', 'createdAt'])
@Index('IDX_place_claims_user_created', ['userId', 'createdAt'])
export class PlaceClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Temple;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /**
   * Intentionally a loose string type on the TS side so adding a new
   * status value is a one-line enum migration without an entity redeploy.
   */
  @Column({
    type: 'varchar',
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
    enumName: 'claim_status',
    default: 'pending',
  })
  status!: ClaimStatus;

  /**
   * Free-text evidence. v1 is prose ("I'm the head priest at this temple,
   * trust reg no. XYZ, see https://..."). A future migration will add a
   * `evidence_upload_ids uuid[]` column that FKs into `uploads` once we
   * ship file attachments.
   */
  @Column({ name: 'claim_evidence', type: 'text' })
  claimEvidence!: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone!: string | null;

  /** Admin-written reason on reject; optional welcome note on approve. */
  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
