import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Materialized balance — updated atomically alongside ledger entry.
 * Used for fast reads; source-of-truth is always the ledger.
 */
@Entity('wallet_balances')
export class WalletBalance {
  @PrimaryColumn({ name: 'wallet_id' })
  walletId!: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  available!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  held!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
