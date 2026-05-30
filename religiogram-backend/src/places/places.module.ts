import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Temple } from '../temples/entities/temple.entity';
import { PlaceEvent } from './entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from './entities/place-service.entity';
import { PlaceClaim } from './entities/place-claim.entity';
import { PlaceDonation } from './entities/place-donation.entity';
import { PlaceReview } from './entities/place-review.entity';
import { EventReminder } from './entities/event-reminder.entity';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { AdminPlacesController } from './admin-places.controller';
import { PlaceClaimsService } from './place-claims.service';
import { PlaceClaimsController } from './place-claims.controller';
import { AdminPlaceClaimsController } from './admin-place-claims.controller';
import { OwnerPlacesController } from './owner-places.controller';
import { OwnerOrAdminGuard } from './guards/owner-or-admin.guard';
import { EventRemindersService } from './event-reminders.service';
import { EventRemindersController } from './event-reminders.controller';
import {
  EventRemindersDispatcherProcessor,
  REMINDER_DISPATCH_QUEUE,
} from './event-reminders.processor';
import { EventRemindersScheduler } from './event-reminders.scheduler';
import { GooglePlacesService } from './google-places.service';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceDonationsService } from './place-donations.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Temple,
      PlaceEvent,
      PlaceServiceEntity,
      PlaceClaim,
      PlaceDonation,
      PlaceReview,
      EventReminder,
    ]),
    BullModule.registerQueue({ name: REMINDER_DISPATCH_QUEUE }),
    RedisModule,
    UploadsModule,
  ],
  controllers: [
    PlacesController,
    AdminPlacesController,
    PlaceClaimsController,
    AdminPlaceClaimsController,
    OwnerPlacesController,
    EventRemindersController,
  ],
  providers: [
    PlacesService,
    GooglePlacesService,
    PlaceReviewsService,
    PlaceDonationsService,
    PlaceClaimsService,
    OwnerOrAdminGuard,
    EventRemindersService,
    EventRemindersDispatcherProcessor,
    EventRemindersScheduler,
  ],
  exports: [
    PlacesService,
    GooglePlacesService,
    PlaceReviewsService,
    PlaceDonationsService,
    PlaceClaimsService,
    EventRemindersService,
  ],
})
export class PlacesModule {}
