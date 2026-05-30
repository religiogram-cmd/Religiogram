import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('consultation_events')
@Index('idx_cev_session', ['sessionId'])
export class ConsultationEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @Column({ name: 'event_type', length: 50 })
  eventType!: string;

  @Column({ name: 'payload_json', type: 'jsonb', nullable: true })
  payloadJson?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
