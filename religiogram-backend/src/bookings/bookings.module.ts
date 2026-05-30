import { forwardRef, Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { PayoutModule } from '../payout/payout.module';
import { PricingModule } from '../pricing/pricing.module';
import { CatalogModule } from '../catalog/catalog.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingEvent } from './entities/booking-event.entity';
import { BookingAddon } from './entities/booking-addon.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { IdempotencyMiddleware } from '../common/middleware/idempotency.middleware';
import { WalletModule } from '../wallet/wallet.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PricingModule,
    CatalogModule,

    TypeOrmModule.forFeature([Booking, BookingEvent, BookingAddon, BookingStatusHistory]),
    EmailModule,
    forwardRef(() => WalletModule),
    forwardRef(() => PayoutModule),
    NotificationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes({ path: 'v1/bookings', method: RequestMethod.POST });
  }
}
