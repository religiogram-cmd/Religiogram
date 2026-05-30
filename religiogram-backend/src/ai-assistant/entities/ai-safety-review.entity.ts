import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_safety_reviews')
export class AiSafetyReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', nullable: true })
  messageId?: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'trigger_layer', length: 20 })
  triggerLayer!: 'keyword' | 'gemini' | 'post_classifier' | 'sample_review' | 'user_report';

  @Column({ name: 'content_hash', length: 64, nullable: true })
  contentHash?: string;

  @Column({ name: 'violation_type', nullable: true })
  violationType?: string;

  @Column({ default: 'low' })
  severity!: string;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', nullable: true })
  reviewedAt?: Date;

  @Column({ default: 'pending' })
  status!: 'pending' | 'cleared' | 'actioned';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
