import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum HoldStatus {
  ACTIVE   = 'active',
  RELEASED = 'released',
  CAPTURED = 'captured',
  EXPIRED  = 'expired',
}

@Entity('wallet_holds')
@Index('idx_holds_wallet', ['walletId'])
@Index('idx_holds_reference', ['referenceId'])
export class WalletHold {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id' })
  walletId!: string;

  @Column({ name: 'ledger_entry_id', nullable: true })
  ledgerEntryId?: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  amount!: number;

  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt?: Date;

  @Column({ name: 'status', type: 'varchar', default: HoldStatus.ACTIVE })
  status!: HoldStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
