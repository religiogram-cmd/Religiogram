import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * user_blocks — one-way block from blocker → blocked. Feed and DM read
 * paths join against this table to filter out posts / messages from
 * blocked users (see FeedService.getTimeline, SocialService.getFeed,
 * SocialService.getConversation).
 */
@Entity({ name: 'user_blocks' })
@Index('idx_user_blocks_blocked', ['blockedId'])
export class UserBlock {
  @PrimaryColumn({ name: 'blocker_id', type: 'uuid' })
  blockerId!: string;

  @PrimaryColumn({ name: 'blocked_id', type: 'uuid' })
  blockedId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
