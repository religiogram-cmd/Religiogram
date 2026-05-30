import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { RedisService } from '../redis/redis.service';
import { GeminiAdapterService, GeminiMessage } from './gemini-adapter.service';

const CONV_TTL = 604_800; // 7 days in seconds
const MAX_SHORT_TERM = 20;
const SUMMARY_THRESHOLD = 20;

@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(
    @InjectRepository(AiConversation)
    private readonly convRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly msgRepo: Repository<AiMessage>,
    private readonly redis: RedisService,
    private readonly gemini: GeminiAdapterService,
  ) {}

  private redisKey(userId: string, convId: string) {
    return `rg-ai:conv:${userId}:${convId}`;
  }

  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    meta?: { religion?: string; language?: string },
  ): Promise<AiConversation> {
    if (conversationId) {
      const existing = await this.convRepo.findOne({ where: { id: conversationId, userId } });
      if (existing) return existing;
    }
    const conv = this.convRepo.create({
      userId,
      religion: meta?.religion,
      language: meta?.language ?? 'en',
    });
    return this.convRepo.save(conv);
  }

  async loadShortTermHistory(userId: string, convId: string): Promise<GeminiMessage[]> {
    const key = this.redisKey(userId, convId);
    const raw = await this.redis.get(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as GeminiMessage[];
    } catch {
      return [];
    }
  }

  async appendAndSave(opts: {
    userId: string;
    conversationId: string;
    userText: string;
    assistantText: string;
    tokensUsed?: number;
    tokensInput?: number;
    tokensOutput?: number;
    costPaise?: number;
    modelUsed?: string;
    latencyMs?: number;
  }): Promise<void> {
    const { userId, conversationId } = opts;

    // Persist to Postgres
    const userMsg = this.msgRepo.create({
      conversationId,
      userId,
      role: 'user',
      content: opts.userText,
    });
    const assistantMsg = this.msgRepo.create({
      conversationId,
      userId,
      role: 'assistant',
      content: opts.assistantText,
      tokensUsed: opts.tokensUsed,
      tokensInput: opts.tokensInput,
      tokensOutput: opts.tokensOutput,
      costPaise: opts.costPaise,
      modelUsed: opts.modelUsed,
      latencyMs: opts.latencyMs,
    });
    await this.msgRepo.save([userMsg, assistantMsg]);

    // Update Redis short-term memory
    const key = this.redisKey(userId, conversationId);
    const raw = await this.redis.get(key);
    let history: GeminiMessage[] = [];
    if (raw) {
      try { history = JSON.parse(raw); } catch { history = []; }
    }

    history.push(
      { role: 'user',  parts: [{ text: opts.userText }] },
      { role: 'model', parts: [{ text: opts.assistantText }] },
    );

    // Summarise when history exceeds threshold
    if (history.length > SUMMARY_THRESHOLD * 2) {
      history = await this.summariseAndTrim(history, conversationId);
    } else {
      history = history.slice(-MAX_SHORT_TERM * 2);
    }

    // RedisService.set(key, value, expiryMode, ttl)
    await this.redis.set(key, JSON.stringify(history), 'EX', CONV_TTL);

    // Increment turn count — updatedAt is handled automatically by @UpdateDateColumn
    await this.convRepo.increment({ id: conversationId }, 'turnCount', 2);
  }

  private async summariseAndTrim(
    history: GeminiMessage[],
    convId: string,
  ): Promise<GeminiMessage[]> {
    const older = history.slice(0, history.length - MAX_SHORT_TERM * 2);
    const recent = history.slice(-MAX_SHORT_TERM * 2);

    const text = older
      .map(m => `${m.role}: ${(m.parts[0] as { text?: string })?.text ?? ''}`)
      .join('\n');

    try {
      const summaryText = await this.gemini.complete({
        prompt: `Summarise this conversation history in 100 tokens or less:\n\n${text}`,
        maxTokens: 120,
      });
      // 'summary' is the correct column name in AiConversation entity
      await this.convRepo.update(convId, { summary: summaryText });
      recent.unshift({ role: 'user', parts: [{ text: `[Earlier context] ${summaryText}` }] });
    } catch (e: any) {
      this.logger.warn('Summary generation failed', e?.message);
    }

    return recent;
  }

  async listConversations(userId: string) {
    const rows = await this.convRepo.find({
      where: { userId, deletedAt: undefined as unknown as Date },
      order: { updatedAt: 'DESC' },
      take: 50,
      select: ['id', 'createdAt', 'updatedAt', 'turnCount', 'title', 'religion', 'language'],
    });
    // Map to spec §13 field names: startedAt, lastActivityAt, messageCount
    return rows.map(r => ({
      id: r.id,
      startedAt: r.createdAt,
      lastActivityAt: r.updatedAt,
      messageCount: r.turnCount,
      preview: r.title ?? '',
      religion: r.religion,
      language: r.language,
    }));
  }

  async getConversationWithMessages(userId: string, convId: string) {
    const conv = await this.convRepo.findOne({ where: { id: convId, userId } });
    if (!conv) return null;
    const messages = await this.msgRepo.find({
      where: { conversationId: convId },
      order: { createdAt: 'DESC' as const },
      take: 100,
    });
    return { ...conv, messages };
  }


  /** §8.2 — persist a tool call + result as a 'tool' role ai_message row */
  async appendToolCall(opts: {
    userId: string;
    conversationId: string;
    toolName: string;
    toolArgs: Record<string, any>;
    toolResult: any;
  }): Promise<void> {
    const msg = this.msgRepo.create({
      conversationId: opts.conversationId,
      userId: opts.userId,
      role: 'tool',
      content: JSON.stringify(opts.toolResult ?? {}),
      toolName: opts.toolName,
      toolArgs: opts.toolArgs,
      toolResult: opts.toolResult,
    });
    await this.msgRepo.save(msg);
  }

  async deleteConversation(userId: string, convId: string): Promise<void> {
    const key = this.redisKey(userId, convId);
    await this.redis.del(key);
    await this.convRepo.softDelete({ id: convId, userId });
  }

  // DPDP hard-delete cron: permanently remove conversations soft-deleted > 30 days ago
  @Cron('0 19 * * *', { timeZone: 'UTC' }) // 00:30 IST
  async hardDeleteOldConversations(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    try {
      const old = await this.convRepo.find({
        where: { deletedAt: LessThan(cutoff) },
        withDeleted: true,
        select: ['id'],
        take: 500,
      });
      if (old.length === 0) return;
      const ids = old.map(c => c.id);
      for (const id of ids) { await this.msgRepo.delete({ conversationId: id }); }
      await this.convRepo
        .createQueryBuilder()
        .delete()
        .where('id IN (:...ids)', { ids })
        .execute();
      this.logger.log(`Hard-deleted ${ids.length} old conversations`);
    } catch (e: any) {
      this.logger.error('Hard-delete cron failed', e?.message);
    }
  }
}
