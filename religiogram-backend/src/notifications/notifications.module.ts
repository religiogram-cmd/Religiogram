import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationPrefs } from './entities/notification-prefs.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationPrefsController } from './notification-prefs.controller';
import { PushNotificationProcessor } from './processors/push-notification.processor';
import { PUSH_NOTIFICATION_QUEUE } from './push-notification.queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeviceToken, NotificationPrefs]),
    BullModule.registerQueue({ name: PUSH_NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationsService, PushNotificationProcessor],
  controllers: [NotificationsController, NotificationPrefsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
