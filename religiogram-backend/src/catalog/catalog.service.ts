import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Religion } from './entities/religion.entity';
import { ProviderRole } from './entities/provider-role.entity';
import { ServiceCategory } from './entities/service-category.entity';
import { CatalogService as CatalogServiceEntity } from './entities/catalog-service.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Religion) private religions: Repository<Religion>,
    @InjectRepository(ProviderRole) private roles: Repository<ProviderRole>,
    @InjectRepository(ServiceCategory) private categories: Repository<ServiceCategory>,
    @InjectRepository(CatalogServiceEntity) private services: Repository<CatalogServiceEntity>,
  ) {}

  listReligions() {
    return this.religions.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  async getReligion(slug: string) {
    const r = await this.religions.findOne({
      where: { slug, isActive: true },
      relations: ['categories', 'providerRoles'],
    });
    if (!r) throw new NotFoundException(`Religion '${slug}' not found`);
    return r;
  }

  listRolesForReligion(religionSlug: string) {
    return this.roles.find({ where: { religionSlug, isActive: true } });
  }

  async listServices(religionSlug?: string, type?: string) {
    const qb = this.services.createQueryBuilder('s')
      .innerJoinAndSelect('s.category', 'cat')
      .where('s.is_active = true');
    if (religionSlug) qb.andWhere('cat.religion_slug = :religionSlug', { religionSlug });
    if (type) qb.andWhere('s.service_type IN (:...types)', { types: [type, 'both'] });
    return qb.orderBy('cat.sort_order').addOrderBy('s.name').getMany();
  }

  async getService(id: string) {
    const s = await this.services.findOne({
      where: { id, isActive: true },
      relations: ['category', 'addOns'],
    });
    if (!s) throw new NotFoundException(`Service '${id}' not found`);
    return s;
  }

  async getServiceBySlug(slug: string) {
    const s = await this.services.findOne({
      where: { slug, isActive: true },
      relations: ['category', 'addOns'],
    });
    if (!s) throw new NotFoundException(`Service '${slug}' not found`);
    return s;
  }
}
