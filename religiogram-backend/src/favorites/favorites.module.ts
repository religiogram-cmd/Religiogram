import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Temple } from '../temples/entities/temple.entity';
import { UserFavorite } from './entities/user-favorite.entity';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/**
 * Favorites module — per-user temple bookmarks.
 *
 * Imports the Temple entity (read-only, for the existence check on POST)
 * in addition to UserFavorite. We deliberately don't depend on
 * TemplesService here — the only Temple interaction is a trivial
 * `findOne({ id })`, and taking the service would pull its Redis cache
 * dependency into this module for no gain.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserFavorite, Temple])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
