import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CatalogService } from './catalog-service.entity';

@Entity('service_add_ons')
export class ServiceAddOn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_id' })
  serviceId!: string;

  @ManyToOne(() => CatalogService, (s: any) => s.addOns)
  @JoinColumn({ name: 'service_id' })
  service!: CatalogService;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: 'price_paise', type: 'int' })
  pricePaise!: number;

  @Column({ name: 'is_optional', default: true })
  isOptional!: boolean;
}
