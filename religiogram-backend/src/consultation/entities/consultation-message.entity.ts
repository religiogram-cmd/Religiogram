import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum MessageType {
  TEXT   = 'text',
  IMAGE  = 'image',
  SYSTEM = 'system',
}

@Entity('consultation_messages')
@Index('idx_consultation_session_time', ['sessionId', 'createdAt'])
export class ConsultationMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** bookingId — scopes all messages for one consultation session */
  @Column({ name: 'session_id' })
  sessionId!: string;

  @Column({ name: 'sender_id' })
  senderId!: string;

  /** 'user' | 'provider' | 'system' */
  @Column({ name: 'sender_role', length: 20 })
  senderRole!: string;

  @Column({
    name: 'message_type',
    type: 'varchar',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  messageType!: MessageType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  /**
   * Monotonically increasing sequence within a session.
   * Used by the client for session.resume — it sends its lastEventSeq
   * and the server replays all messages with seq > lastEventSeq.
   * Implemented as a sequence number stored on the message to avoid
   * a separate sequence table.
   */
  @Column({ name: 'seq', type: 'int', default: 0 })
  seq!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
