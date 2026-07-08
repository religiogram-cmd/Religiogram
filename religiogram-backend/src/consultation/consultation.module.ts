import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ConsultationMessage } from './entities/consultation-message.entity';
import { SessionBillingTick } from './entities/session-billing-tick.entity';
import { ConsultationSession } from './entities/consultation-session.entity';
import { ConsultationEvent } from './entities/consultation-event.entity';
import { ConsultationIntroSession } from './entities/consultation-intro-session.entity';
import { ConsultationGateway } from './consultation.gateway';
import { ConsultationController } from './consultation.controller';
import { ConsultationBillingService } from './consultation-billing.service';
import { ConsultationIntroService } from './consultation-intro.service';
import { SessionGraceService } from './session-grace.service';
import { TurnCredentialsService } from './turn-credentials.service';
import { BillingTickProcessor } from './billing-tick.processor';
import { WalletModule } from '../wallet/wallet.module';
import { RedisModule } from '../redis/redis.module';
import { AlertsModule } from '../common/alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProviderEntity } from '../service-providers/entities/provider.entity';
import { QUEUE } from '../common/queues/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsultationMessage,
      SessionBillingTick,
      ConsultationSession,
      ConsultationEvent,
      ConsultationIntroSession,
      ProviderEntity,
    ]),
    // P1-2: BullMQ repeatable jobs for consultation billing ticks.
    BullModule.registerQueue({ name: QUEUE.CONSULTATION_BILLING }),
    JwtModule.register({}),
    EventEmitterModule.forRoot(),
    ScheduleModule,
    WalletModule,
    RedisModule,
    AlertsModule,
    NotificationsModule,
  ],
  controllers: [ConsultationController],
  providers: [
    // ConsultationGateway ↔ ConsultationIntroService is a mutual dep — the
    // gateway calls the service on session.rejoin (indirectly via
    // SessionGraceService) and the service calls back into the gateway to
    // emit the ring / timeout events. `forwardRef` on the service-side
    // Inject() breaks the cycle at DI resolution time.
    ConsultationGateway,
    ConsultationBillingService,
    ConsultationIntroService,
    SessionGraceService,
    TurnCredentialsService,
    BillingTickProcessor, // P1-2
  ],
  exports: [
    ConsultationGateway,
    ConsultationBillingService,
    ConsultationIntroService,
    SessionGraceService,
    TurnCredentialsService,
  ],
})
export class ConsultationModule {}
