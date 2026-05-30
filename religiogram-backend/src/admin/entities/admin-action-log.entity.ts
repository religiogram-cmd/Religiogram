import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Admin } from './admin.entity';

@Entity('admin_action_logs')
@Index('idx_aal_admin', ['adminId'])
@Index('idx_aal_target', ['targetType', 'targetId'])
export class AdminActionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'admin_id' })
  adminId!: string;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin!: Admin;

  @Column({ name: 'action_type', length: 50 })
  actionType!: string;

  @Column({ name: 'target_type', length: 30 })
  targetType!: string;

  @Column({ name: 'target_id' })
  targetId!: string;

  @Column({ name: 'payload_json', type: 'jsonb', nullable: true })
  payloadJson?: Record<string, any>;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
