import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SessionType   { CHAT = 'chat', AUDIO = 'audio', VIDEO = 'video' }
export enum SessionStatus {
  REQUESTED  = 'requested',
  CONNECTING = 'connecting',
  ACTIVE     = 'active',
  PAUSED     = 'paused',
  ENDED      = 'ended',
  ABANDONED  = 'abandoned',
}

@Entity('consultation_sessions')
@Index('idx_csess_user', ['userId'])
@Index('idx_csess_provider', ['providerId'])
@Index('idx_csess_status', ['sessionStatus'])
export class ConsultationSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_code', length: 20, unique: true })
  sessionCode!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'provider_id' })
  providerId!: string;

  @Column({ name: 'service_id' })
  serviceId!: string;

  @Column({ name: 'session_type', type: 'varchar', length: 20 })
  sessionType!: SessionType;

  @Column({ name: 'session_status', type: 'varchar', length: 20, default: SessionStatus.REQUESTED })
  sessionStatus!: SessionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true })
  connectedAt?: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt?: Date;

  @Column({ name: 'duration_seconds', default: 0 })
  durationSeconds!: number;

  @Column({ name: 'billable_seconds', default: 0 })
  billableSeconds!: number;

  @Column({ name: 'rate_per_minute', type: 'bigint', transformer: { from: (v: string | null) => (v == null ? 0 : parseInt(v, 10)), to: (v: number) => v } })
  ratePerMinute!: number;

  @Column({ name: 'minimum_charge_paise', type: 'bigint', default: 0, transformer: { from: (v: string | null) => (v == null ? 0 : parseInt(v, 10)), to: (v: number) => v } })
  minimumChargePaise!: number;

  @Column({ name: 'total_charge', type: 'bigint', default: 0, transformer: { from: (v: string | null) => (v == null ? 0 : parseInt(v, 10)), to: (v: number) => v } })
  totalCharge!: number;

  @Column({ name: 'disconnect_reason', length: 50, nullable: true })
  disconnectReason?: string;

  @Column({ name: 'plan_type', type: 'varchar', length: 30, nullable: true })
  planType: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
