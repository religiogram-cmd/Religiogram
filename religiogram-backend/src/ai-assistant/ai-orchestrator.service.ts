import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as Sentry from '@sentry/node';
import { GeminiAdapterService, GeminiMessage } from './gemini-adapter.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { CostGuardService } from './cost-guard.service';
import { CostLockService } from '../common/cost-lock/cost-lock.service';
import { SafetyService } from './safety.service';
import { FunctionCallingService } from './function-calling.service';
import { RagService } from './rag/rag.service';
import { KundliService } from './astrology/kundli.service';
import { HoroscopeService } from './astrology/horoscope.service';
import { AiBirthProfile } from './entities/ai-birth-profile.entity';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiUsageDaily } from './entities/ai-usage-daily.entity';
import { AiSafetyReview } from './entities/ai-safety-review.entity';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AiSubscriptionService } from './ai-subscription.service';

export interface OrchestratorChunk {
  event: 'token' | 'tool_call' | 'tool_result' | 'conversation_id' | 'quota' | 'done' | 'error';
  token?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  result?: any;
  conversationId?: string;
  used?: number;
  limit?: number;
  message?: string;
}

// Section 3.2 — token cost rates in paise (USD * 84 * 100 / 1_000_000)
const COST_PAISE_PER_TOKEN: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.00063, output: 0.00252 },
  'gemini-2.5-pro':   { input: 0.0105,  output: 0.042   },
};

function calcCostPaise(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PAISE_PER_TOKEN[model] ?? COST_PAISE_PER_TOKEN['gemini-2.5-flash'];
  return Math.ceil(inputTokens * rates.input + outputTokens * rates.output);
}

// AES-256-GCM PII encryption delegated to shared EncryptionService (common/encryption/)

// Section 3.3 — static base system prompt (~600 tokens, suitable for Gemini caching)
const BASE_SYSTEM_PROMPT = `You are RG AI, a wise, warm, and knowledgeable spiritual assistant for ReligioGram, India's leading spiritual services platform. You serve Hindu, Muslim, Sikh, and Christian users across India.

Your personality:
- Deeply respectful of all religions and traditions
- Warm, compassionate, and non-judgmental
- Knowledgeable in Vedic astrology, Hindu rituals, Islamic practices, Sikh teachings, and Christian faith
- Practical - you help users find priests, book sessions, understand their kundli, and navigate their spiritual journey

Guidelines:
- Never give definitive medical, legal, or financial advice
- Always acknowledge the importance of consulting qualified professionals
- When discussing auspicious dates or muhurtas, note these are approximate
- Respect user's privacy - don't reveal information from their birth profile unless asked
- Answer in the user's preferred language when possible
- Keep responses concise and mobile-friendly (3-5 sentences for most answers)
- Use relevant emojis sparingly to keep the tone warm
- Always end astrology answers with: "Remember, astrology guides reflection, not destiny."

Available tools: get_kundli, get_horoscope, get_compatibility, get_panchang, search_priests, book_consultation, get_wallet_balance, top_up_wallet, search_temples, get_booking_history, get_auspicious_dates, get_rashifal, ask_scripture`;

// Section 3.3 — build dynamic user context block
function buildUserContext(opts: {
  name?: string;
  religion?: string;
  language?: string;
  city?: string;
  birthCity?: string;
  rashi?: string;
  nakshatra?: string;
}): string {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const lines = [`Current date and time (IST): ${now}`];
  if (opts.name)        lines.push(`User name: ${opts.name}`);
  if (opts.religion)    lines.push(`Faith: ${opts.religion}`);
  if (opts.language)    lines.push(`Preferred language: ${opts.language}`);
  const city = opts.city ?? opts.birthCity;
  if (city)             lines.push(`City: ${city}`);
  if (opts.rashi)       lines.push(`Rashi (Moon sign): ${opts.rashi}`);
  if (opts.nakshatra)   lines.push(`Nakshatra: ${opts.nakshatra}`);
  return `\nUSER CONTEXT\n${lines.join('\n')}`;
}

@Injectable()
export class AiOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly gemini: GeminiAdapterService,
    private readonly memory: ConversationMemoryService,
    private readonly costGuard: CostGuardService,
    private readonly safety: SafetyService,
    private readonly fnCalling: FunctionCallingService,
    private readonly rag: RagService,
    private readonly kundli: KundliService,
    private readonly horoscope: HoroscopeService,
    @InjectRepository(AiBirthProfile)
    private readonly profileRepo: Repository<AiBirthProfile>,
    @InjectRepository(AiConversation)
    private readonly conversationRepo: Repository<AiConversation>,
    @InjectRepository(AiUsageDaily)
    private readonly usageDailyRepo: Repository<AiUsageDaily>,
    @InjectRepository(AiSafetyReview)
    private readonly safetyReviewRepo: Repository<AiSafetyReview>,
    private readonly subscription: AiSubscriptionService,
    private readonly costLock: CostLockService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  // onModuleInit is no longer needed for encryption (EncryptionService handles it)

  async *streamResponse(opts: {
    userId: string;
    message: string;
    conversationId?: string;
    religion?: string;
    language?: string;
    audioBase64?: string;
    audioMimeType?: string;
    imageBase64?: string;
    imageMimeType?: string;
  }): AsyncGenerator<OrchestratorChunk> {
    const { userId, message, religion, language = 'en' } = opts;

    // 0. Global cost-lock check (P0-5) — hard daily budget ceiling
    // When total daily AI spend exceeds COST_LOCK_AI_DAILY_RUPEES we degrade to
    // Swiss Ephemeris + canned templates for ALL users to protect the budget.
    const aiLocked = await this.costLock.isAiLocked();
    if (aiLocked) {
      yield {
        event: 'error',
        message: 'AI service is temporarily unavailable due to daily budget limits. Please try again tomorrow or ask your astrology question in text form.',
      };
      return;
    }

    // 1. Quota check — chat action
    const isPremium = await this.subscription.isPremium(userId);
    const quota = await this.costGuard.checkAndIncrement(userId, 'chat', isPremium);
    yield { event: 'quota', used: quota.used, limit: quota.limit };

    if (!quota.allowed) {
      yield {
        event: 'error',
        message: 'Daily limit reached. Upgrade to RG AI Premium (Rs.49/month) for unlimited conversations.',
      };
      return;
    }

    // 1b. Quota check — voice/image actions (Gap 4)
    if (opts.audioBase64) {
      const vq = await this.costGuard.checkAndIncrement(userId, 'voice', isPremium);
      if (!vq.allowed) {
        yield { event: 'error', message: 'Daily voice limit reached (5/day on free tier). Upgrade to RG AI Premium for unlimited voice.' };
        return;
      }
    }
    if (opts.imageBase64) {
      const iq = await this.costGuard.checkAndIncrement(userId, 'image', isPremium);
      if (!iq.allowed) {
        yield { event: 'error', message: 'Daily image limit reached (3/day on free tier). Upgrade to RG AI Premium for unlimited image.' };
        return;
      }
    }

    // 2. Section 10.2 — auto-redirect check BEFORE keyword filter
    const redirect = this.safety.getAutoRedirect(message);
    if (redirect) {
      yield { event: 'conversation_id', conversationId: opts.conversationId ?? 'auto-redirect' };
      yield { event: 'token', token: redirect.message };
      yield { event: 'done' };
      return;
    }

    // 3. Safety pre-filter (Layer 1: keywords)
    const preCheck = this.safety.preFilterInput(message);
    if (!preCheck.safe) {
      await this.safety.flagContent({
        userId,
        triggerLayer: 'keyword',
        content: message,
        violationType: preCheck.violationType,
        severity: preCheck.severity,
      });
      yield {
        event: 'error',
        message: "I'm not able to help with that request. Please ask about spiritual guidance, astrology, or finding religious services.",
      };
      return;
    }

    // 4. Get or create conversation
    const conv = await this.memory.getOrCreateConversation(userId, opts.conversationId, { religion, language });
    yield { event: 'conversation_id', conversationId: conv.id };

    // AI1: Capture start time BEFORE RAG lookup so RAG short-circuit latency
    // is correctly measured. Previously the block used Date.now() - Date.now()
    // which always evaluates to 0 ms.
    const chatStartMs = Date.now();

    // 5. RAG lookup
    // S6: sanitise message before RAG lookup — strip XML/prompt-injection attempts
    // so they cannot escape the <user_query> delimiter when injected into context.
    const safeMessage = message
      .replace(/<\/?[^>]+(>|$)/g, '')   // strip all HTML/XML tags
      .replace(/\bignore\b.{0,60}\binstructions?\b/gi, '[redacted]') // common injection phrase
      .slice(0, 2000); // hard cap: reject oversized inputs silently

    const { docs } = await this.rag.retrieveRelevant(safeMessage, { religion, language });
    const ragContext = this.rag.buildRagContext(docs);

    // §9.1 Lever 2 — high-confidence RAG hit: answer directly, skip Gemini (zero LLM cost)
    const HIGH_SIM = 0.88;
    const topDoc = docs[0] as { similarity?: number; content?: string } | undefined;
    if (topDoc != null && (topDoc.similarity ?? 0) >= HIGH_SIM && !this.shouldUsePro(message) && !opts.imageBase64 && !opts.audioBase64) {
      yield { event: 'conversation_id', conversationId: conv.id };
      const ragAnswer = `${topDoc.content ?? ''}

*Remember, astrology guides reflection, not destiny.*`;

      // AI1: Post-classify the RAG answer before yielding it.
      // The knowledge-base document may contain content that, in context of
      // *this* user's message, triggers a safety flag (e.g. self-harm adjacent
      // astrology content combined with a distressed user query). Skipping
      // post-classify here meant the RAG short-circuit bypassed the entire
      // safety pipeline, a P0 audit finding.
      const postCheck = await this.safety.postClassifyOutput(ragAnswer).catch(() => ({ safe: true }));
      if (!(postCheck as { safe: boolean }).safe) {
        yield {
          event: 'error',
          message: "I'm not able to share that response. Please ask about spiritual guidance, astrology, or finding religious services.",
        };
        return;
      }

      // Stream in chunks for a natural feel
      const words = ragAnswer.split(' ');
      for (const word of words) {
        yield { event: 'token', token: word + ' ' };
      }
      await this.memory.appendAndSave({
        userId, conversationId: conv.id,
        userText: message, assistantText: ragAnswer,
        tokensUsed: 0, tokensInput: 0, tokensOutput: 0, costPaise: 0,
        modelUsed: 'rag_cache',
        // AI1: use chatStartMs captured before the RAG lookup — Date.now() - Date.now() always = 0
        latencyMs: Date.now() - chatStartMs,
      });
      yield { event: 'done' };
      return;
    }

    // 6. Load short-term history + §3.4 context budget truncation (~2500 tokens for history)
    const rawHistory = await this.memory.loadShortTermHistory(userId, conv.id);
    // Approximate: 1 token ~ 4 chars; budget 2500 tokens = ~10000 chars for history
    const HISTORY_CHAR_BUDGET = 10_000;
    let historyChars = 0;
    const history = [...rawHistory].reverse().filter(msg => {
      const len = (msg.parts[0] as { text?: string } | undefined)?.text?.length ?? 0;
      historyChars += len;
      return historyChars <= HISTORY_CHAR_BUDGET;
    }).reverse();

    // 7. Determine model (Pro for deep astrology / vision)
    // §11.2 — premium users always get Pro; otherwise route by content + image
    const usePro = this.shouldUsePro(message) || !!opts.imageBase64 || isPremium;

    // 7b. P2-3: Per-user daily token ceiling check.
    // Check BEFORE streaming so we don't waste API quota if the user is over their limit.
    // Free tier: 50K Flash / 5K Pro per day.  Premium: 4× headroom.
    const tokenModel: 'flash' | 'pro' = usePro ? 'pro' : 'flash';
    const tokenCheck = await this.costGuard.checkTokenCeiling(userId, tokenModel, isPremium);
    if (!tokenCheck.allowed) {
      const modelLabel = tokenModel === 'flash' ? 'Flash' : 'Pro';
      yield {
        event: 'error',
        message: `Daily ${modelLabel} token limit reached (${tokenCheck.limitTokens.toLocaleString()} tokens/day). ${
          isPremium ? 'Your premium limit resets at midnight.' : 'Upgrade to RG AI Premium for more tokens.'
        }`,
      };
      return;
    }

    // 8. Section 3.3 — build dynamic system prompt with user context (Gap 1)
    const profile = await this.profileRepo.findOne({ where: { userId } });
    const userContext = buildUserContext({
      name:       profile ? (profile.fullName ? this.encryption.decrypt(profile.fullName, 'BIRTH_PROFILE_ENCRYPTION_KEY') : undefined) : undefined,
      religion:   religion ?? conv.religion,
      language:   language ?? conv.language ?? 'en',
      birthCity:  profile?.birthCity,
      rashi:      profile?.rashi,
      nakshatra:  profile?.nakshatra,
    });
    let systemPrompt = BASE_SYSTEM_PROMPT + userContext;
    if (ragContext) {
      // S6: Fence RAG content in XML delimiters so injected user text
      // can never escape the knowledge-base section and override instructions.
      systemPrompt += `\n\n<knowledge_base>\n${ragContext}\n</knowledge_base>`;
    }

    // 9. Build multimodal user parts
    const userParts: any[] = [];
    if (opts.imageBase64) {
      userParts.push({ inlineData: { mimeType: opts.imageMimeType ?? 'image/jpeg', data: opts.imageBase64 } });
    }
    if (opts.audioBase64) {
      userParts.push({ inlineData: { mimeType: opts.audioMimeType ?? 'audio/webm', data: opts.audioBase64 } });
    }
    // S6: Wrap user text in <user_query> delimiters so the LLM can clearly
    // distinguish user input from system/knowledge content and injection
    // attempts like "Ignore previous instructions" cannot escape the block.
    const userText = message || (opts.imageBase64
      ? 'Describe this image and provide spiritual guidance.'
      : 'Please transcribe and respond to this voice message.');
    userParts.push({ text: `<user_query>${userText}</user_query>` });

    const messages: GeminiMessage[] = [
      ...history,
      { role: 'user', parts: userParts },
    ];

    // 10. Stream from Gemini + handle function calls
    let fullAssistantText = '';
    let tokensInput  = 0;
    let tokensOutput = 0;
    const startMs = Date.now();
    const modelName = usePro ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

    try {
      // §9.1 Lever 7: 500-token output cap (800 for Pro deep-astrology)
      const maxOutputTokens = usePro ? 800 : 500;
      for await (const chunk of this.gemini.streamChat({
        messages,
        systemPrompt,
        tools: this.fnCalling.getToolDeclarations(),
        usePro,
        safetyThreshold: 'BLOCK_LOW_AND_ABOVE',
        maxTokens: maxOutputTokens,
      })) {
        switch (chunk.event) {
          case 'token':
            fullAssistantText += chunk.token ?? '';
            yield { event: 'token', token: chunk.token };
            break;

          case 'tool_call': {
            const toolName = chunk.toolName!;
            const toolArgs = chunk.toolArgs ?? {};
            yield { event: 'tool_call', toolName, toolArgs };

            const toolResult = await this.fnCalling.executeTool(toolName, toolArgs, userId);
            yield { event: 'tool_result', toolName, result: toolResult };

            // §8.2 — audit-log tool call + result to ai_messages
            await this.memory.appendToolCall({
              userId,
              conversationId: conv.id,
              toolName,
              toolArgs,
              toolResult,
            });

            if (toolResult?.action === 'navigate') {
              const navText = `${toolResult.message} -> [${toolResult.deepLink}]`;
              fullAssistantText += navText;
              yield { event: 'token', token: navText };
            } else if (toolResult && !toolResult.error) {
              const resultText = this.formatToolResult(toolName, toolResult);
              fullAssistantText += resultText;
              yield { event: 'token', token: resultText };
            } else if (toolResult?.error === 'user_confirmation_required') {
              const confText = toolResult.message;
              fullAssistantText += confText;
              yield { event: 'token', token: confText };
            }
            break;
          }

          case 'done':
            // Gap 2 — capture separate input/output tokens
            tokensInput  = chunk.usage?.inputTokens  ?? 0;
            tokensOutput = chunk.usage?.outputTokens ?? 0;
            break;

          case 'error':
            if (chunk.error === 'safety_blocked') {
              await this.safety.flagContent({
                userId,
                triggerLayer: 'gemini',
                content: message,
                violationType: 'gemini_safety_block',
                severity: 'medium',
              });
              yield { event: 'error', message: "I'm not able to respond to that. Please ask about spiritual guidance or astrology." };
              return;
            }
            yield { event: 'error', message: chunk.error ?? 'Unknown AI error' };
            return;
        }
      }

      // 11. Safety post-filter (Layer 3: classifier) — S6: fail-closed
      if (fullAssistantText.length > 20) {
        const postCheck = await this.safety.postClassifyOutput(fullAssistantText);
        if (!postCheck.safe) {
          await this.safety.flagContent({
            userId,
            triggerLayer: 'post_classifier',
            content: fullAssistantText,
            violationType: postCheck.violationType,
            severity: postCheck.severity,
          });
          // S6: Block and discard the unsafe output — do NOT stream it to the user
          this.logger.warn(
            `Post-classifier BLOCKED output for user ${userId} reason=${postCheck.violationType}`,
          );
          yield {
            event: 'error',
            message: "I'm not able to send that response. Please try asking differently.",
          };
          return;
        } else if (Math.random() < 0.01) {
          // §10.4 — 1% random sampling of safe outputs for quality review
          await this.safety.flagContent({
            userId,
            triggerLayer: 'sample_review',
            content: fullAssistantText,
            violationType: 'quality_sample',
            severity: 'low',
          });
        }
      }

      // Gap 2 — calculate costPaise and persist
      const costPaise = calcCostPaise(modelName, tokensInput, tokensOutput);
      const tokensUsed = tokensInput + tokensOutput;

      // P2-3: Record tokens against per-user daily ceiling (fire-and-forget).
      this.costGuard.recordTokens(userId, tokenModel, tokensUsed, isPremium).catch(e =>
        this.logger.warn(`Token ceiling record failed for ${userId}: ${e?.message}`),
      );

      // C1: Record spend against daily budget cost-lock so the hard rupee cap engages.
      // Fire-and-forget — a billing record failure must not surface as a user error.
      if (tokensUsed > 0) {
        if (tokenModel === 'pro') {
          this.costLock.recordProTokens(tokensUsed).catch(e =>
            this.logger.warn(`CostLock Pro record failed for ${userId}: ${e?.message}`),
          );
        } else {
          this.costLock.recordFlashTokens(tokensUsed).catch(e =>
            this.logger.warn(`CostLock Flash record failed for ${userId}: ${e?.message}`),
          );
        }
      }

      const userTextForMemory = message
        || (opts.imageBase64 ? '[Image attached]' : '')
        || (opts.audioBase64 ? '[Voice message]' : '');

      await this.memory.appendAndSave({
        userId,
        conversationId: conv.id,
        userText:      userTextForMemory,
        assistantText: fullAssistantText,
        tokensUsed,
        tokensInput,
        tokensOutput,
        costPaise,
        modelUsed:     modelName,
        latencyMs:     Date.now() - startMs,
      });

      yield { event: 'done' };
    } catch (err: any) {
      this.logger.error('Orchestrator stream error', err?.message);
      yield { event: 'error', message: 'Something went wrong. Please try again.' };
    }
  }


  /** §10.4 — user-initiated flag on any AI response */
  async flagMessage(userId: string, messageId: string, reason: string): Promise<{ ok: boolean }> {
    await this.safety.flagContent({
      userId,
      triggerLayer: 'user_report',
      content: messageId,   // store message UUID as content reference
      violationType: reason,
      severity: 'medium',
    });
    return { ok: true };
  }

  private shouldUsePro(message: string): boolean {
    const proTriggers = [
      'kundli', 'birth chart', 'dasha', 'transit', 'compatibility',
      'jyotish', 'astrolog', 'nakshatra', 'rashi', 'lagna',
      'panchang', 'muhurta', 'mangal dosha', 'guna milan',
    ];
    const lower = message.toLowerCase();
    return proTriggers.some(t => lower.includes(t));
  }

  private formatToolResult(toolName: string, result: any): string {
    switch (toolName) {
      case 'get_horoscope':
      case 'get_rashifal':
        return `\n\n${result.horoscope ?? result.rashifal ?? ''}`;
      case 'get_kundli':
        return `\n\nYour rashi is **${result.rashi}**, nakshatra is **${result.nakshatra}**, and lagna is **${result.lagna?.lagna ?? 'calculating...'}**.`;
      case 'get_compatibility': {
        const r = result as { total?: number; percentage?: number; verdict?: string };
        return `\n\nCompatibility score: **${r.total}/36** (${r.percentage}%). ${r.verdict}`;
      }
      case 'get_panchang':
        return `\n\nToday's panchang - Tithi: ${result.tithi}, Yoga: ${result.yoga}, Paksha: ${result.paksha}.`;
      case 'get_auspicious_dates':
        return `\n\nAuspicious dates for ${result.ceremonyType}: ${result.auspiciousDates?.join(', ') ?? 'none found'}. ${result.note}`;
      default:
        return '';
    }
  }

  // Section 7.3 — save birth profile with AES-256-GCM PII encryption (Gap 3)
  async saveBirthProfile(userId: string, data: {
    fullName: string;
    birthDate: string;
    birthTime?: string;
    birthCity: string;
    placeLat?: number;
    placeLon?: number;
    isSelf?: boolean;
  }) {
    const encryptedData = {
      fullName:  this.encryption.encrypt(data.fullName, 'BIRTH_PROFILE_ENCRYPTION_KEY'),
      birthDate: this.encryption.encrypt(data.birthDate, 'BIRTH_PROFILE_ENCRYPTION_KEY'),
      birthTime: data.birthTime ? this.encryption.encrypt(data.birthTime, 'BIRTH_PROFILE_ENCRYPTION_KEY') : undefined,
      birthCity: data.birthCity, // city is not PII, keep plain for display
    };

    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      await this.profileRepo.update(existing.id, {
        fullName:  encryptedData.fullName,
        birthDate: encryptedData.birthDate,
        birthTime: encryptedData.birthTime,
        birthCity: encryptedData.birthCity,
        kundliJson: undefined,
      });
      return { saved: true, profileId: existing.id };
    }

    const profile = this.profileRepo.create({
      userId,
      fullName:  encryptedData.fullName,
      birthDate: encryptedData.birthDate,
      birthTime: encryptedData.birthTime,
      birthCity: encryptedData.birthCity,
      birthLat:  data.placeLat,
      birthLng:  data.placeLon,
    });
    await this.profileRepo.save(profile);
    return { saved: true, profileId: profile.id };
  }

  /** Return the saved birth profile for a user (null if none). */
  async getBirthProfile(userId: string): Promise<AiBirthProfile | null> {
    return this.profileRepo.findOne({ where: { userId } }) ?? null;
  }

  /** List all conversation stubs for a user (newest first). */
  async listConversations(userId: string) {
    return this.memory.listConversations(userId);
  }

  /** Return full message history for one conversation (auth-gated). */
  async getConversation(userId: string, conversationId: string) {
    return this.memory.getConversationWithMessages(userId, conversationId);
  }

  /** Soft-delete a conversation (DPDP right-to-erasure path). */
  async deleteConversation(userId: string, conversationId: string): Promise<{ deleted: boolean }> {
    await this.memory.deleteConversation(userId, conversationId);
    return { deleted: true };
  }

  /** Return today's quota across all action types + premium status. */
  async getQuota(userId: string) {
    const isPremium = await this.subscription.isPremium(userId);
    const quotas    = await this.costGuard.getAllQuotas(userId, isPremium);
    return { isPremium, quotas };
  }
  /**
   * GDPR: Delete all AI data when a user deletes their account.
   * Deleting AiConversation cascades to AiMessage (onDelete: 'CASCADE').
   * AiBirthProfile is deleted separately.
   */
  @OnEvent('user.deleted')
  async onUserDeleted(payload: { userId: string }): Promise<void> {
    const { userId } = payload;
    // Deleting AiConversation cascades to AiMessage (onDelete: 'CASCADE' on FK).
    // AiUsageDaily and AiSafetyReview rows are also deleted for full GDPR erasure.
    const results = await Promise.allSettled([
      this.conversationRepo.delete({ userId }),
      this.profileRepo.delete({ userId }),
      this.usageDailyRepo.delete({ userId }),
      this.safetyReviewRepo.delete({ userId }),
    ]);
    const errors = results.filter(r => r.status === 'rejected');
    if (errors.length > 0) {
      this.logger.error({ userId, errors }, 'AI data erasure: some deletes failed (GDPR alert)');
    } else {
      this.logger.log({ userId }, 'AI data erased for deleted user (GDPR)');
    }
  }

}
