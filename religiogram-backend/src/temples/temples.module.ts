import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Temple } from './entities/temple.entity';
import { TemplesController } from './temples.controller';
import { TemplesService } from './temples.service';

/**
 * Temples module — discovery surface (nearby + search + detail).
 *
 * Read-only from the client's perspective; seeding is handled by the
 * migration. Admin CRUD will land in a separate `temples-admin` surface
 * when we open up temple self-registration.
 *
 * RedisService is provided globally (RedisModule is @Global) so we don't
 * re-export it here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Temple])],
  controllers: [TemplesController],
  providers: [TemplesService],
  exports: [TemplesService],
})
export class TemplesModule {}
