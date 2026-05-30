import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { Ticket, TicketStatus, TicketCategory, TicketPriority } from './entities/ticket.entity';
import { TicketMessage, MessageAuthorType } from './entities/ticket-message.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { AdminUpdateTicketDto } from './dto/admin-update-ticket.dto';

function derivePriority(category: TicketCategory): TicketPriority {
  if ([TicketCategory.PROVIDER_MISCONDUCT].includes(category)) return TicketPriority.P1_CRITICAL;
  if ([TicketCategory.REFUND_REQUEST, TicketCategory.WRONG_CHARGES].includes(category)) return TicketPriority.P2_HIGH;
  if ([TicketCategory.TECHNICAL_ISSUE, TicketCategory.DISPUTE_REVIEW].includes(category)) return TicketPriority.P3_MEDIUM;
  return TicketPriority.P4_LOW;
}

function slaHours(priority: TicketPriority): number {
  const map: Record<TicketPriority, number> = {
    [TicketPriority.P1_CRITICAL]: 2,
    [TicketPriority.P2_HIGH]: 8,
    [TicketPriority.P3_MEDIUM]: 24,
    [TicketPriority.P4_LOW]: 48,
  };
  return map[priority];
}

function genRef(): string {
  return `RG-T-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(Ticket) private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketMessage) private readonly messageRepo: Repository<TicketMessage>,
  ) {}

  async createTicket(userId: string, dto: CreateTicketDto): Promise<Ticket> {
    const priority = derivePriority(dto.category);
    const slaHrs = slaHours(priority);
    const slaDeadline = new Date(Date.now() + slaHrs * 3600 * 1000);

    const ticket = this.ticketRepo.create({
      ticketRef: genRef(),
      userId,
      category: dto.category,
      priority,
      subject: dto.subject,
      description: dto.description,
      providerId: dto.providerId,
      bookingId: dto.bookingId,
      sessionId: dto.sessionId,
      status: TicketStatus.OPEN,
      slaDeadline,
    });
    const saved = await this.ticketRepo.save(ticket);
    await this.addSystemMessage(
      saved.id,
      `Ticket created. Priority: ${priority}. SLA: ${slaHrs} hours. Ref: ${saved.ticketRef}`,
    );
    return saved;
  }

  async getMyTickets(userId: string): Promise<Ticket[]> {
    return this.ticketRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async getTicket(id: string, userId?: string): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (userId && ticket.userId !== userId) throw new ForbiddenException('Access denied');
    return ticket;
  }

  async getMessages(
    ticketId: string,
    userId?: string,
    includeInternal = false,
  ): Promise<TicketMessage[]> {
    await this.getTicket(ticketId, userId);
    const messages = await this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
    if (!includeInternal) return messages.filter((m: any) => !m.isInternal);
    return messages;
  }

  async addUserMessage(
    ticketId: string,
    userId: string,
    dto: AddMessageDto,
  ): Promise<TicketMessage> {
    const ticket = await this.getTicket(ticketId, userId);
    if (
      [TicketStatus.RESOLVED, TicketStatus.CLOSED_NO_RESPONSE].includes(ticket.status)
    ) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      if (ticket.resolvedAt && ticket.resolvedAt > sevenDaysAgo) {
        await this.ticketRepo.update(ticketId, {
          status: TicketStatus.REOPENED,
          reopenCount: ticket.reopenCount + 1,
        });
      }
    }
    if (ticket.status === TicketStatus.AWAITING_USER) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.IN_REVIEW });
    }
    return this.messageRepo.save(
      this.messageRepo.create({
        ticketId,
        authorId: userId,
        authorType: MessageAuthorType.USER,
        body: dto.body,
      }),
    );
  }

  async addAgentMessage(
    ticketId: string,
    agentId: string,
    dto: AddMessageDto,
  ): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.firstResponseAt) {
      await this.ticketRepo.update(ticketId, {
        firstResponseAt: new Date(),
        status: TicketStatus.IN_REVIEW,
      });
    }
    return this.messageRepo.save(
      this.messageRepo.create({
        ticketId,
        authorId: agentId,
        authorType: MessageAuthorType.AGENT,
        body: dto.body,
        isInternal: dto.isInternal ?? false,
      }),
    );
  }

  private async addSystemMessage(ticketId: string, body: string): Promise<void> {
    await this.messageRepo.save(
      this.messageRepo.create({
        ticketId,
        authorId: 'system',
        authorType: MessageAuthorType.SYSTEM,
        body,
        isInternal: true,
      }),
    );
  }

  async resolveTicket(ticketId: string, agentId: string, note: string): Promise<Ticket> {
    await this.ticketRepo.update(ticketId, {
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date(),
      resolutionNote: note,
    });
    await this.addSystemMessage(ticketId, `Resolved by agent ${agentId}: ${note}`);
    const resolved = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!resolved) throw new NotFoundException('Ticket not found');
    return resolved;
  }

  async adminUpdateTicket(
    ticketId: string,
    agentId: string,
    dto: AdminUpdateTicketDto,
  ): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const updates: Partial<Ticket> = {};
    if (dto.status) updates.status = dto.status;
    if (dto.priority) updates.priority = dto.priority;
    if (dto.assignedAgentId) updates.assignedAgentId = dto.assignedAgentId;
    if (dto.resolutionNote) {
      updates.resolutionNote = dto.resolutionNote;
      updates.resolvedAt = new Date();
    }
    await this.ticketRepo.update(ticketId, updates);
    await this.addSystemMessage(ticketId, `Updated by agent ${agentId}: ${JSON.stringify(dto)}`);
    const updated = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!updated) throw new NotFoundException('Ticket not found');
    return updated;
  }

  async getAdminQueue(
    filters: { status?: TicketStatus; priority?: TicketPriority } = {},
  ): Promise<Ticket[]> {
    const where: Partial<Ticket> = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    return this.ticketRepo.find({
      where,
      order: { slaDeadline: 'ASC', createdAt: 'ASC' },
      take: 100,
    });
  }

  async getTicketStats(): Promise<Record<string, number>> {
    const stats = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string }>();
    return stats.reduce(
      (acc: any, row: any) => ({ ...acc, [row.status]: Number(row.count) }),
      {} as Record<string, number>,
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async closeAbandonedTickets(): Promise<void> {
    const cutoff = new Date(Date.now() - 72 * 3600 * 1000);
    const abandoned = await this.ticketRepo.find({
      where: {
        status: TicketStatus.AWAITING_USER,
        updatedAt: LessThanOrEqual(cutoff) as any,
      },
    });
    for (const ticket of abandoned) {
      await this.ticketRepo.update(ticket.id, { status: TicketStatus.CLOSED_NO_RESPONSE });
      await this.addSystemMessage(ticket.id, 'Auto-closed: no user response within 72 hours.');
      this.logger.log(`Auto-closed ticket ${ticket.ticketRef}`);
    }
  }
}
