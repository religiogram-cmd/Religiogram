import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_usage_daily')
export class AiUsageDaily {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ length: 60 })
  action!: string;

  @Column({ default: 0 })
  count!: number;

  @Column({ name: 'is_premium', default: false })
  isPremium!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
