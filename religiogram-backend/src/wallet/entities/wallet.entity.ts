import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerEntry } from './ledger-entry.entity';

export enum WalletOwnerType { USER = 'user', PROVIDER = 'provider' }
export enum WalletStatus    { ACTIVE = 'active', FROZEN = 'frozen', CLOSED = 'closed' }

@Entity('wallets')
@Index('idx_wallets_owner', ['ownerType', 'ownerId'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Kept for backward compat -- same as ownerId when ownerType = 'user' */
  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 20, default: WalletOwnerType.USER })
  ownerType!: WalletOwnerType;

  @Column({ name: 'owner_id' })
  ownerId!: string;

  /** Cached available balance in paise -- derived from ledger; must never go negative */
  @Column({
    name: 'available_balance',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  availableBalance!: number;

  /** Funds locked for pending/active consultation sessions */
  @Column({
    name: 'held_balance',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  heldBalance!: number;

  @Column({ length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: WalletStatus.ACTIVE })
  status!: WalletStatus;

  /** @deprecated use status = frozen instead */
  @Column({ name: 'is_locked', default: false })
  isLocked!: boolean;

  @Column({ name: 'lock_reason', type: 'text', nullable: true })
  lockReason?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => LedgerEntry, (e: any) => e.wallet)
  entries!: LedgerEntry[];
}
