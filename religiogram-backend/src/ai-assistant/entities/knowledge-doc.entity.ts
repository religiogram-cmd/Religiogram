import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('knowledge_docs')
export class KnowledgeDoc {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  source!: string;

  @Column({ nullable: true })
  religion?: string;

  @Column({ default: 'en' })
  language!: string;

  @Column({ length: 500 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'chunk_index', default: 0 })
  chunkIndex!: number;

  // pgvector column stored as raw SQL — TypeORM treats it as simple string
  @Column({ type: 'text', nullable: true, select: false })
  embedding?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
