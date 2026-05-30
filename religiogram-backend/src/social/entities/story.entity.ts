import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('stories')
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({
    name: 'media_type',
    type: 'varchar',
    length: 20,
    default: 'text',
  })
  mediaType!: string;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl!: string | null;

  @Column({ name: 'text_content', type: 'varchar', length: 300, nullable: true })
  textContent!: string | null;

  @Column({ name: 'background_color', type: 'varchar', length: 30, nullable: true })
  backgroundColor!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  // viewedBy moved to story_views table — do not use this column
  // @Column removed in migration 1700000000060-StoryViews

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author!: User;
}
