import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum FolloweeType {
  Provider = 'provider',
  Temple   = 'temple',
}

/**
 * follows — a user follows a provider or a temple.
 *
 * Composite unique index prevents duplicate follows.
 * followee_type distinguishes whether the target is a provider or temple
 * so a single table serves both use-cases (avoids two nearly-identical tables).
 */
@Entity({ name: 'follows' })
@Index('idx_follows_follower', ['followerId'])
@Index('idx_follows_followee', ['followeeType', 'followeeId'])
@Index('uq_follows', ['followerId', 'followeeType', 'followeeId'], { unique: true })
export class FollowEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'follower_id', type: 'uuid' })
  followerId!: string;

  @Column({
    name: 'followee_type',
    type: 'varchar',
    length: 20,
  })
  followeeType!: FolloweeType;

  /** provider.id (bigint as string) or temple.id (uuid) */
  @Column({ name: 'followee_id', type: 'varchar', length: 40 })
  followeeId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
