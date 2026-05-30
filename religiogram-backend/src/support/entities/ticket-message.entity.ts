import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum MessageAuthorType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

@Entity('ticket_messages')
@Index(['ticketId'])
export class TicketMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ticketId!: string;

  @Column()
  authorId!: string;

  @Column({ type: 'enum', enum: MessageAuthorType })
  authorType!: MessageAuthorType;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments?: { url: string; filename: string }[];

  @Column({ default: false })
  isInternal!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
