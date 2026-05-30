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

  @Column({ name: 'bank_name', length: 100, nullable: true })
  bankName?: string;

  /** AES-256-GCM encrypted; key stored in AWS KMS */
  @Column({ name: 'account_number_encrypted', type: 'text' })
  accountNumberEncrypted!: string;

  @Column({ name: 'ifsc_code', length: 11, nullable: true })
  ifscCode?: string;

  @Column({ name: 'beneficiary_name', length: 200, nullable: true })
  beneficiaryName?: string;

  @Column({ name: 'upi_id', length: 100, nullable: true })
  upiId?: string;

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
