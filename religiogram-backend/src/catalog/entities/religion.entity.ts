import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { ProviderRole } from './provider-role.entity';
import { ServiceCategory } from './service-category.entity';

@Entity('religions')
export class Religion {
  @PrimaryColumn({ length: 50 })
  slug!: string;

  @Column({ name: 'display_name', length: 100 })
  displayName!: string;

  @Column({ name: 'icon_url', nullable: true })
  iconUrl?: string;

  @Column({ name: 'theme_primary', length: 7, default: '#C8920A' })
  themePrimary!: string;

  @Column({ name: 'theme_secondary', length: 7, default: '#E8B430' })
  themeSecondary!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @OneToMany(() => ProviderRole, (r: any) => r.religion)
  providerRoles!: ProviderRole[];

  @OneToMany(() => ServiceCategory, (c: any) => c.religion)
  categories!: ServiceCategory[];
}
