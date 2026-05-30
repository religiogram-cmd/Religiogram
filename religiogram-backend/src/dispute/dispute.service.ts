import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, LessThan } from 'typeorm';
import { randomBytes } from 'crypto';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { RaiseDisputeDto } from './dto/raise-dispute.dto';
import { ResolveForUserDto, ResolveForProviderDto } from './dto/resolve-dispute.dto';
import { WalletService } from '../wallet/wallet.service';

/** Generates a short unique ref like "RG-D-A3F9B2C1" using cryptographic randomness */
function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join('');
  return `RG-D-${suffix}`;
}

// ── Dispute state machine ────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  [DisputeStatus.RAISED]: [DisputeStatus.UNDER_INVESTIGATION],
  [DisputeStatus.UNDER_INVESTIGATION]: [
    DisputeStatus.RESOLVED_FOR_USER,
    DisputeStatus.RESOLVED_FOR_PROVIDER,
    DisputeStatus.ESCALATED,
  ],
  [DisputeStatus.ESCALATED]: [
    DisputeStatus.RESOLVED_FOR_USER,
    DisputeStatus.RESOLVED_FOR_PROVIDER,
  ],
  [DisputeStatus.RESOLVED_FOR_USER]: [],
  [DisputeStatus.RESOLVED_FOR_PROVIDER]: [],
  [DisputeStatus.CLOSED]: [],
};

function assertTransition(from: DisputeStatus, to: DisputeStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(`Cannot transition dispute from '${from}' to '${to}'`);
  }
}

const SLA_HOURS = 48;

@Injectable()
export class DisputeService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,

    @InjectRepository(DisputeMessage)
    private readonly messageRepo: Repository<DisputeMessage>,
    private readonly walletService: WalletService,
  ) {}

  // ── raise ──────────────────────────────────────────────────────────────────
  async raise(userId: string, dto: RaiseDisputeDto): Promise<Dispute> {
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + SLA_HOURS * 60 * 60 * 1000);

    const dispute = this.disputeRepo.create({
      disputeRef:     generateRef(),
      raisedById:     userId,
      referenceId:    dto.referenceId,
      referenceType:  dto.referenceType,
      title:          dto.title,
      description:    dto.description,
      status:         DisputeStatus.RAISED,
      slaDeadline,
      evidence:       [],
      refundAmountPaise: 0,
    });

    return this.disputeRepo.save(dispute);
  }

  // ── investigate ────────────────────────────────────────────────────────────
  async investigate(disputeId: string, adminId: string): Promise<Dispute> {
    const dispute = await this.findOrFail(disputeId);
    assertTransition(dispute.status, DisputeStatus.UNDER_INVESTIGATION);
    dispute.status         = DisputeStatus.UNDER_INVESTIGATION;
    dispute.resolvedById   = adminId;
    return this.disputeRepo.save(dispute);
  }

  // ── resolveForUser ─────────────────────────────────────────────────────────
  async findById(id: string): Promise<any> {
    return this.disputeRepo.findOne({ where: { id }, relations: ['booking'] });
  }

  async resolveForUser(
    disputeId: string,
    adminId: string,
    dto: ResolveForUserDto,
  ): Promise<Dispute> {
    const dispute = await this.findOrFail(disputeId);
    assertTransition(dispute.status, DisputeStatus.RESOLVED_FOR_USER);
    dispute.status             = DisputeStatus.RESOLVED_FOR_USER;
    dispute.resolvedById       = adminId;
    dispute.resolutionNote     = dto.note;
    dispute.refundAmountPaise  = dto.refundAmountPaise;
    dispute.resolvedAt         = new Date();
    const savedDispute = await this.disputeRepo.save(dispute);

    // Issue wallet refund when resolving in user's favour
    if (dto.refundAmountPaise > 0) {
      await this.walletService.credit(dispute.raisedById, {
        amount: dto.refundAmountPaise,
        description: `Dispute refund for ${dispute.disputeRef}`,
        referenceId: dispute.id,
        referenceType: 'dispute_refund',
        idempotencyKey: `dispute-refund:${dispute.id}`,
      });
    }

    return savedDispute;
  }

  // ── resolveForProvider ─────────────────────────────────────────────────────
  async resolveForProvider(
    disputeId: string,
    adminId: string,
    dto: ResolveForProviderDto,
  ): Promise<Dispute> {
    const dispute = await this.findOrFail(disputeId);
    assertTransition(dispute.status, DisputeStatus.RESOLVED_FOR_PROVIDER);
    dispute.status         = DisputeStatus.RESOLVED_FOR_PROVIDER;
    dispute.resolvedById   = adminId;
    dispute.resolutionNote = dto.note;
    dispute.resolvedAt     = new Date();
    return this.disputeRepo.save(dispute);
  }

  // ── escalate ───────────────────────────────────────────────────────────────
  async escalate(disputeId: string, adminId: string): Promise<Dispute> {
    const dispute = await this.findOrFail(disputeId);
    assertTransition(dispute.status, DisputeStatus.ESCALATED);
    dispute.status        = DisputeStatus.ESCALATED;
    dispute.resolvedById  = adminId;
    return this.disputeRepo.save(dispute);
  }

  // ── addMessage ─────────────────────────────────────────────────────────────
  async addMessage(
    disputeId: string,
    senderId: string,
    senderRole: string,
    message: string,
  ): Promise<DisputeMessage> {
    await this.findOrFail(disputeId);
    const msg = this.messageRepo.create({ disputeId, senderId, senderRole, message });
    return this.messageRepo.save(msg);
  }

  // ── getDispute ─────────────────────────────────────────────────────────────
  async getDispute(id: string, requestingUserId: string, requestingRole: string): Promise<Dispute & { messages: DisputeMessage[] }> {
    const dispute = await this.findOrFail(id);

    // Ownership check: only the dispute raiser, named provider, or admin may view
    if (
      dispute.raisedById !== requestingUserId &&
      requestingRole !== 'admin'
    ) {
      throw new ForbiddenException('Access denied');
    }

    // Paginated messages — last 50, newest first
    const messages = await this.messageRepo.find({
      where: { disputeId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return Object.assign(dispute, { messages });
  }

  // ── getUserDisputes ────────────────────────────────────────────────────────
  /**
   * Keyset cursor-paginated list of disputes for a user.
   * Cursor encodes (createdAt DESC, id ASC) of the last row returned.
   */
  async getUserDisputes(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: Dispute[]; nextCursor: string | null; hasMore: boolean }> {
    const PAGE = Math.min(limit, 100);
    let cursorCreatedAt: Date | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        cursorCreatedAt = decoded.c ? new Date(decoded.c) : undefined;
        cursorId = decoded.i;
      } catch { /* ignore malformed cursor */ }
    }

    const qb = this.disputeRepo.createQueryBuilder('d')
      .where('d.raisedById = :userId', { userId })
      .orderBy('d.createdAt', 'DESC')
      .addOrderBy('d.id', 'ASC')
      .take(PAGE + 1);

    if (cursorCreatedAt && cursorId) {
      qb.andWhere(
        '(d.createdAt < :cat OR (d.createdAt = :cat AND d.id > :cid))',
        { cat: cursorCreatedAt.toISOString(), cid: cursorId },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > PAGE;
    const data = rows.slice(0, PAGE);
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ c: last.createdAt.toISOString(), i: last.id }), 'utf8').toString('base64url')
      : null;

    return { data, nextCursor, hasMore };
  }

  // ── getAdminQueue ──────────────────────────────────────────────────────────
  /**
   * Returns unresolved disputes sorted by SLA deadline ascending
   * (most urgent first). Optionally filtered by status.
   */
  async getAdminQueue(status?: string): Promise<Dispute[]> {
    const pendingStatuses: DisputeStatus[] = [
      DisputeStatus.RAISED,
      DisputeStatus.UNDER_INVESTIGATION,
      DisputeStatus.ESCALATED,
    ];

    const qb = this.disputeRepo.createQueryBuilder('d');

    if (status) {
      qb.where('d.status = :status', { status });
    } else {
      qb.where('d.status IN (:...statuses)', { statuses: pendingStatuses });
    }

    return qb.orderBy('d.sla_deadline', 'ASC').take(100).getMany();
  }

  // ── private helpers ────────────────────────────────────────────────────────
  private async findOrFail(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);
    return dispute;
  }
}
