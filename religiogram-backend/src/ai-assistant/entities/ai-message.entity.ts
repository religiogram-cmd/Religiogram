import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

@Entity('ai_messages')
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id' })
  conversationId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column()
  role!: 'user' | 'assistant' | 'tool';

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'tool_name', nullable: true })
  toolName?: string;

  @Column({ name: 'tool_args', type: 'jsonb', nullable: true })
  toolArgs?: Record<string, any>;

  @Column({ name: 'tool_result', type: 'jsonb', nullable: true })
  toolResult?: Record<string, any>;

  // Total tokens (legacy; prefer tokens_input + tokens_output)
  @Column({ name: 'tokens_used', nullable: true })
  tokensUsed?: number;

  // Gap 2: separate input/output token counts + cost in paise
  @Column({ name: 'tokens_input', nullable: true })
  tokensInput?: number;

  @Column({ name: 'tokens_output', nullable: true })
  tokensOutput?: number;

  @Column({ name: 'cost_paise', nullable: true })
  costPaise?: number;

  @Column({ name: 'model_used', nullable: true })
  modelUsed?: string;

  @Column({ name: 'latency_ms', nullable: true })
  latencyMs?: number;

  @Column({ default: false })
  flagged!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => AiConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AiConversation;
}
