import {
  Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum EntryType {
  CREDIT   = 'credit',
  DEBIT    = 'debit',
  HOLD     = 'hold',
  RELEASE  = 'release',
  REFUND   = 'refund',
  PAYOUT   = 'payout',
  FEE      = 'fee',
  ADJUST   = 'adjustment',
}

/**
 * Immutable financial event — NEVER update, only append.
 * Balance is always derived as SUM(amount * direction).
 */
@Entity('ledger_entries')
@Index('idx_ledger_wallet_created', ['walletId', 'createdAt'])
@Index('idx_ledger_idem', ['idempotencyKey'], { unique: true })
@Index('idx_ledger_reference', ['referenceId'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id' })
  walletId!: string;

  @ManyToOne(() => Wallet, (w: any) => w.entries)
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({ name: 'entry_type', type: 'varchar' })
  entryType!: EntryType;

  /** Always positive; direction indicates credit (+1) or debit (-1) */
  // D8: PostgreSQL returns NUMERIC columns as strings to avoid JS float loss.
  // Add transformer so application code always receives a JS number, not "12345.0000".
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  amount!: number;

  @Column({ type: 'smallint' })
  direction!: 1 | -1;

  /** Denormalized snapshot of balance after this entry */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 14,
    scale: 4,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  balanceAfter!: number;

  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'idempotency_key', nullable: true, unique: true })
  idempotencyKey?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
