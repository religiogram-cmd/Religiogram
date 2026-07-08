import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_birth_profiles')
export class AiBirthProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  /* Mixed sensitivity by design — do NOT change without touching both
   * AiOrchestratorService.saveBirthProfile and
   * ConsultationIntroService.fetchUserBirthContext, which each know exactly
   * which columns need decrypting on read:
   *   - full_name  — ENCRYPTED (AES-GCM `iv:tag:ct` hex). PII.
   *   - birth_date — ENCRYPTED (AES-GCM `iv:tag:ct` hex). PII.
   *   - birth_time — ENCRYPTED (AES-GCM `iv:tag:ct` hex). PII (when present).
   *   - birth_city — PLAINTEXT. Not PII on its own and we need to display /
   *                  search it directly in the astrologer's context brief
   *                  ("Place: Delhi, India") without a decrypt round-trip.
   * All four are stored as `text` because ciphertext exceeds varchar(200)
   * for full_name and isn't a valid date/time literal for birth_date/time
   * (see migration 1700000000077 for the type migration rationale). */
  @Column({ name: 'full_name', type: 'text' })
  fullName!: string;

  @Column({ name: 'birth_date', type: 'text' })
  birthDate!: string;

  @Column({ name: 'birth_time', type: 'text', nullable: true })
  birthTime?: string;

  @Column({ name: 'birth_city', type: 'text' })
  birthCity!: string;

  /** Plaintext — country isn't PII on its own and shows up in the
   *  astrologer's context brief ("Place: Delhi, India"). Migration
   *  1700000000078 adds this column idempotently. */
  @Column({ name: 'birth_country', type: 'varchar', length: 80, nullable: true })
  birthCountry?: string;

  @Column({ name: 'birth_lat', type: 'double precision', nullable: true })
  birthLat?: number;

  @Column({ name: 'birth_lng', type: 'double precision', nullable: true })
  birthLng?: number;

  @Column({ nullable: true })
  timezone?: string;

  @Column({ nullable: true })
  rashi?: string;

  @Column({ nullable: true })
  nakshatra?: string;

  @Column({ nullable: true })
  lagna?: string;

  @Column({ name: 'kundli_json', type: 'jsonb', nullable: true })
  kundliJson?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
