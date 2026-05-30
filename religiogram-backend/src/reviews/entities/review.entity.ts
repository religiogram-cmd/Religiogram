import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ReviewableType {
  TEMPLE = 'temple',
  PROVIDER = 'provider',
  PLACE = 'place',
}

@Entity('reviews')
@Index('idx_reviews_target', ['reviewableType', 'reviewableId'])
@Index('idx_reviews_user_target', ['userId', 'reviewableType', 'reviewableId'], { unique: true })
@Check('"rating" >= 1 AND "rating" <= 5')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'reviewable_type', type: 'varchar', enum: ReviewableType })
  reviewableType!: ReviewableType;

  @Column({ name: 'reviewable_id' })
  reviewableId!: string;

  @Column({ type: 'smallint' })
  rating!: number; // 1-5

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'is_verified_purchase', default: false })
  isVerifiedPurchase!: boolean;

  @Column({ name: 'helpful_count', default: 0 })
  helpfulCount!: number;

  @Column({ name: 'is_hidden', default: false })
  isHidden!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
