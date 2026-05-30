import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum TickStatus {
  PENDING = 'pending',
  DEBITED = 'debited',
  FAILED = 'failed',
}

@Entity('session_billing_ticks')
@Unique('uq_tick_session_minute', ['sessionId', 'tickMinute'])
@Index('idx_billing_tick_session', ['sessionId'])
export class SessionBillingTick {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** bookingId used as sessionId */
  @Column({ name: 'session_id' })
  sessionId!: string;

  /** 1-based minute counter within the session */
  @Column({ name: 'tick_minute', type: 'int' })
  tickMinute!: number;

  /** Amount charged for this minute in paise */
  @Column({ name: 'amount_paise', type: 'int' })
  amountPaise!: number;

  @Column({ name: 'wallet_tx_id', type: 'uuid', nullable: true })
  walletTxId!: string | null;

  @Column({ name: 'debited_at', type: 'timestamptz', nullable: true })
  debitedAt!: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    enum: TickStatus,
    default: TickStatus.PENDING,
  })
  status!: TickStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
