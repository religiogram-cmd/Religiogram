import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   * Create or update the authenticated user's review for a temple/provider/place.
   * One review per user per entity — subsequent POSTs update the existing review.
   */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, dto);
  }

  /**
   * GET /reviews?reviewableType=temple&reviewableId=uuid&limit=20&offset=0
   * Public list of visible reviews for an entity.
   */
  @Get()
  async list(@Query() dto: ListReviewsDto) {
    return this.reviewsService.list(dto);
  }

  /**
   * DELETE /reviews/:id
   * User deletes their own review.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) reviewId: string,
  ) {
    await this.reviewsService.delete(user.id, reviewId);
  }

  /**
   * PATCH /reviews/:id/helpful
   * Increment helpful count on a review.
   */
  @Patch(':id/helpful')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markHelpful(@Param('id', ParseUUIDPipe) reviewId: string) {
    await this.reviewsService.markHelpful(reviewId);
  }

  /**
   * PATCH /reviews/:id/hide   [admin only]
   * Admin hides an abusive/spam review. Recalculates entity rating.
   */
  @Patch(':id/hide')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminHide(@Param('id', ParseUUIDPipe) reviewId: string) {
    await this.reviewsService.adminHide(reviewId);
  }
}
