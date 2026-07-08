import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderEntity } from './provider.entity';

export enum BankVerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING    = 'pending',   // RazorpayX fund_account created; awaiting webhook confirmation
  VERIFIED   = 'verified',
  FAILED     = 'failed',
  SKIPPED    = 'skipped',   // RazorpayX not configured — verification bypassed
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

  /**
   * Timestamp of the last automated verification attempt (RazorpayX penny
   * drop or equivalent). Null before any attempt has fired.
   */
  @Column({ name: 'verification_attempted_at', type: 'timestamptz', nullable: true })
  verificationAttemptedAt?: Date | null;

  /**
   * RazorpayX fund_account_id returned by
   * POST https://api.razorpay.com/v1/fund_accounts. Populated after a
   * successful contact + fund_account creation; used for payout requests
   * and to correlate the verification webhook.
   */
  @Column({ name: 'razorpay_fund_account_id', type: 'varchar', length: 64, nullable: true })
  razorpayFundAccountId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
