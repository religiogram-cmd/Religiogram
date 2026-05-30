import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("tds_records")
@Index("idx_tds_records_provider_fy", ["providerId", "financialYear"], { unique: true })
export class TdsRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "provider_id" })
  @Index()
  providerId!: string;

  @Column({ name: "financial_year", length: 10 })
  financialYear!: string;

  @Column({ name: "total_earnings_paise", type: "int", default: 0 })
  totalEarningsPaise!: number;

  @Column({ name: "tds_deducted_paise", type: "int", default: 0 })
  tdsDeductedPaise!: number;

  @Column({ name: "tds_threshold_paise", type: "int", default: 3000000 })
  tdsThresholdPaise!: number;

  @Column({
    name: "tds_pct",
    type: "numeric",
    precision: 5,
    scale: 2,
    default: 10.0,
  })
  tdsPct!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
