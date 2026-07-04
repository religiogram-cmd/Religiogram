import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { ServiceProvidersModule } from '../service-providers/service-providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review]),
    // Needs RankingService to bump the provider's ranking_score after a
    // review's rating denorm changes.
    ServiceProvidersModule,
  ],
  providers: [ReviewsService],
  controllers: [ReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
