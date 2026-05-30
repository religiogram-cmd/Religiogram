import { Column, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

export enum DeviceType { IOS = 'ios', ANDROID = 'android', WEB = 'web' }
export enum DeviceStatus { ACTIVE = 'active', REVOKED = 'revoked' }

@Entity('user_devices')
@Index('idx_ud_user', ['userId'])
@Index('idx_ud_user_device', ['userId', 'deviceId'], { unique: true })
export class UserDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'device_id', length: 255 })
  deviceId!: string;

  @Column({ name: 'device_type', type: 'varchar', length: 20 })
  deviceType!: DeviceType;

  @Column({ name: 'push_token', type: 'text', nullable: true })
  pushToken?: string;

  @UpdateDateColumn({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ name: 'app_version', length: 30, nullable: true })
  appVersion?: string;

  @Column({ name: 'os_version', length: 30, nullable: true })
  osVersion?: string;

  @Column({ type: 'varchar', length: 20, default: DeviceStatus.ACTIVE })
  status!: DeviceStatus;
}
