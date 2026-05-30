import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToMany } from 'typeorm';

@Entity('ai_conversations')
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  religion?: string;

  @Column({ default: 'en' })
  language!: string;

  @Column({ nullable: true, type: 'text' })
  summary?: string;

  @Column({ name: 'turn_count', default: 0 })
  turnCount!: number;

  @Column({ name: 'is_premium', default: false })
  isPremium!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
