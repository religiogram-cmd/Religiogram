import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PlanType {
  INTRO_5    = 'intro_5',
  PACK_20    = 'pack_20',
  PACK_30    = 'pack_30',
  PER_MINUTE = 'per_minute',
}

@Entity('consultation_intro_sessions')
@Index('idx_consultation_intro_user', ['userId'])
export class ConsultationIntroSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid', unique: true })
  sessionId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @Column({ name: 'plan_type', type: 'varchar' })
  planType!: PlanType;

  @Column({ name: 'intro_paise', type: 'bigint' })
  introPaise!: number;

  @Column({ name: 'intro_minutes', type: 'int', default: 5 })
  introMinutes!: number;

  @Column({ name: 'per_minute_paise', type: 'int' })
  perMinutePaise!: number;

  @Column({ name: 'cashback_eligible', type: 'boolean', default: false })
  cashbackEligible!: boolean;

  @Column({ name: 'cashback_issued', type: 'boolean', default: false })
  cashbackIssued!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
