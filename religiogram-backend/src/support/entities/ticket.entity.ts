import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TicketStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  AWAITING_USER = 'awaiting_user',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
  CLOSED_NO_RESPONSE = 'closed_no_response',
  REOPENED = 'reopened',
}

export enum TicketCategory {
  REFUND_REQUEST = 'refund_request',
  PROVIDER_MISCONDUCT = 'provider_misconduct',
  TECHNICAL_ISSUE = 'technical_issue',
  WRONG_CHARGES = 'wrong_charges',
  DISPUTE_REVIEW = 'dispute_review',
  ACCOUNT_ISSUE = 'account_issue',
  GENERAL_QUERY = 'general_query',
}

export enum TicketPriority {
  P1_CRITICAL = 'p1_critical',
  P2_HIGH = 'p2_high',
  P3_MEDIUM = 'p3_medium',
  P4_LOW = 'p4_low',
}

@Entity('support_tickets')
@Index(['userId'])
@Index(['status'])
@Index(['priority'])
@Index(['slaDeadline'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  ticketRef!: string;

  @Column()
  @Index()
  userId!: string;

  @Column({ nullable: true })
  providerId?: string;

  @Column({ nullable: true })
  bookingId?: string;

  @Column({ nullable: true })
  sessionId?: string;

  @Column({ type: 'enum', enum: TicketCategory })
  category!: TicketCategory;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.P4_LOW })
  priority!: TicketPriority;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status!: TicketStatus;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ nullable: true })
  assignedAgentId?: string;

  @Column({ type: 'timestamp', nullable: true })
  slaDeadline?: Date;

  @Column({ type: 'timestamp', nullable: true })
  firstResponseAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNote?: string;

  @Column({ type: 'int', default: 0 })
  reopenCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
