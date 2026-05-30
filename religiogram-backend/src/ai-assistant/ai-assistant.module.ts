import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiBirthProfile } from './entities/ai-birth-profile.entity';
import { AiUsageDaily } from './entities/ai-usage-daily.entity';
import { KnowledgeDoc } from './entities/knowledge-doc.entity';
import { AiSafetyReview } from './entities/ai-safety-review.entity';
import { GeminiAdapterService } from './gemini-adapter.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { CostGuardService } from './cost-guard.service';
import { SafetyService } from './safety.service';
import { FunctionCallingService } from './function-calling.service';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiAssistantController } from './ai-assistant.controller';
import { SwissEphemerisService } from './astrology/swisseph.service';
import { KundliService } from './astrology/kundli.service';
import { CompatibilityService } from './astrology/compatibility.service';
import { HoroscopeService } from './astrology/horoscope.service';
import { PanchangService } from './astrology/panchang.service';
import { RagService } from './rag/rag.service';
import { RedisModule } from '../redis/redis.module';
import { AiSubscriptionService } from './ai-subscription.service';
import { CostLockModule } from '../common/cost-lock/cost-lock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiConversation,
      AiMessage,
      AiBirthProfile,
      AiUsageDaily,
      KnowledgeDoc,
      AiSafetyReview,
    ]),
    BullModule.registerQueue({ name: 'ai-safety-review' }),
    CostLockModule,
    RedisModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    GeminiAdapterService,
    ConversationMemoryService,
    CostGuardService,
    SafetyService,
    FunctionCallingService,
    AiOrchestratorService,
    SwissEphemerisService,
    KundliService,
    CompatibilityService,
    HoroscopeService,
    PanchangService,
    RagService,
    AiSubscriptionService,
  ],
  exports: [AiOrchestratorService, KundliService, CompatibilityService, HoroscopeService, PanchangService],
})
export class AiAssistantModule {}
