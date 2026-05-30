import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_birth_profiles')
export class AiBirthProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @Column({ name: 'full_name', length: 200 })
  fullName!: string;

  @Column({ name: 'birth_date', type: 'date' })
  birthDate!: string;

  @Column({ name: 'birth_time', type: 'time', nullable: true })
  birthTime?: string;

  @Column({ name: 'birth_city', length: 200 })
  birthCity!: string;

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
