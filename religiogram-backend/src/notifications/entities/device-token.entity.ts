import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DevicePlatform {
  ANDROID = 'android',
  IOS     = 'ios',
  WEB     = 'web',
}

@Entity('device_tokens')
@Index('idx_device_tokens_user', ['userId', 'platform'])
@Index('idx_device_token_unique', ['token'], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'token', length: 500 })
  token!: string;

  @Column({ name: 'platform', type: 'varchar', enum: DevicePlatform })
  platform!: DevicePlatform;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
