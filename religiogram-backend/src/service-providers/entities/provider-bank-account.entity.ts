import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderEntity } from './provider.entity';

export enum BankVerificationStatus {
  UNVERIFIED = 'unverified',
  VERIFIED   = 'verified',
  FAILED     = 'failed',
}

@Entity('provider_bank_accounts')
@Index('idx_pba_provider', ['providerId'])
export class ProviderBankAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  providerId!: string;

  @ManyToOne(() => ProviderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider!: ProviderEntity;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName?: string | null;

  /** AES-256-GCM encrypted; key stored in AWS KMS */
  @Column({ name: 'account_number_encrypted', type: 'text' })
  accountNumberEncrypted!: string;

  @Column({ name: 'ifsc_code', type: 'varchar', length: 11, nullable: true })
  ifscCode?: string | null;

  @Column({ name: 'beneficiary_name', type: 'varchar', length: 200, nullable: true })
  beneficiaryName?: string | null;

  @Column({ name: 'upi_id', type: 'varchar', length: 100, nullable: true })
  upiId?: string | null;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 20,
    default: BankVerificationStatus.UNVERIFIED,
  })
  verificationStatus!: BankVerificationStatus;

  @Column({ name: 'is_primary', default: true })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
