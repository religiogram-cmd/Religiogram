import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Dispute } from './dispute.entity';

@Entity('dispute_messages')
@Index('idx_dispute_messages_dispute', ['disputeId'])
export class DisputeMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dispute_id' })
  disputeId!: string;

  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute!: Dispute;

  @Column({ name: 'sender_id' })
  senderId!: string;

  @Column({ name: 'sender_role' })
  senderRole!: string;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
