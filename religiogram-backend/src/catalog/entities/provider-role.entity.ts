import { Column, Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Religion } from './religion.entity';

@Entity('provider_roles')
export class ProviderRole {
  @PrimaryColumn({ length: 50 })
  slug!: string;

  @Column({ name: 'religion_slug', length: 50 })
  religionSlug!: string;

  @ManyToOne(() => Religion, (r: any) => r.providerRoles)
  @JoinColumn({ name: 'religion_slug' })
  religion!: Religion;

  @Column({ name: 'display_name', length: 100 })
  displayName!: string;

  /** JSON array of required document types for KYC */
  @Column({ name: 'verification_requirements', type: 'jsonb', default: '[]' })
  verificationRequirements!: string[];

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
