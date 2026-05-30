import { Column, Entity, ManyToOne, OneToMany, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Religion } from './religion.entity';
import { CatalogService } from './catalog-service.entity';

@Entity('service_categories')
export class ServiceCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'religion_slug', length: 50 })
  religionSlug!: string;

  @ManyToOne(() => Religion, (r: any) => r.categories)
  @JoinColumn({ name: 'religion_slug' })
  religion!: Religion;

  @Column({ length: 100 })
  name!: string;

  @Column({ nullable: true })
  icon?: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @OneToMany(() => CatalogService, (s: any) => s.category)
  services!: CatalogService[];
}
