import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';

@Entity('social_posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  /** Legacy field — community posts use `text` instead */
  @Column({ type: 'text', nullable: true })
  caption!: string | null;

  /** Community v2: main post text (replaces caption) */
  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ name: 'image_urls', type: 'jsonb', default: [] })
  imageUrls!: string[];

  /** Single image URL for community posts */
  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'likes_count', type: 'int', default: 0 })
  likesCount!: number;

  @Column({ name: 'comments_count', type: 'int', default: 0 })
  commentsCount!: number;

  @Column({ name: 'shares_count', type: 'int', default: 0 })
  sharesCount!: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  // SOC3: native text[] array — allows GIN index + = ANY() query
  @Column({ name: 'hashtags', type: 'text', array: true, nullable: true, default: [] })
  hashtags!: string[] | null;

  @Column({ name: 'post_type', type: 'varchar', length: 20, default: 'text' })
  postType!: string;

  /** Category: Spiritual Guidance, Rituals, Experiences, Questions, Events, etc. */
  @Column({ name: 'category', type: 'varchar', length: 60, nullable: true, default: 'Experiences' })
  category!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @OneToMany(() => PostLike, (l: any) => l.post)
  likes!: PostLike[];

  @OneToMany(() => PostComment, (c: any) => c.post)
  comments!: PostComment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
