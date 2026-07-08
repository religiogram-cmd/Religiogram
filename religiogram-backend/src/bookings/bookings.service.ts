import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, QueryFailedError, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Booking, BookingStatus, BookingType, PaymentMethod } from './entities/booking.entity';
import { BookingEvent } from './entities/booking-event.entity';
import { BookingStatusHistory, ActorType } from './entities/booking-status-history.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { WalletService } from '../wallet/wallet.service';
import { PayoutService } from '../payout/payout.service';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { encodeCursor, decodeCursor } from '../common/pagination/cursor';
import { CatalogService } from '../catalog/catalog.service';
import { RankingService } from '../service-providers/ranking.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(BookingEvent)
    private readonly eventRepo: Repository<BookingEvent>,
    @InjectRepository(BookingStatusHistory)
    private readonly historyRepo: Repository<BookingStatusHistory>,
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService,
    private readonly notifs: NotificationsService,
    private readonly catalogService: CatalogService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly payoutService: PayoutService,
    private readonly ranking: RankingService,
  ) {}

  /**
   * Bump the provider's ranking + increment their completed bookings count
   * after a booking transitions to COMPLETED. Best-effort — any error is
   * logged so a failed ranking refresh doesn't break the booking flow.
   */
  private async refreshProviderRanking(providerId: string): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE providers
           SET completed_bookings_count = completed_bookings_count + 1,
               last_activity_at = NOW()
         WHERE id::text = $1`,
        [providerId],
      );
      this.ranking.bump(providerId).catch((e) =>
        this.logger.warn(`ranking bump after booking complete failed: ${(e as Error).message}`),
      );
    } catch (err) {
      this.logger.warn(`refreshProviderRanking failed: ${(err as Error).message}`);
    }
  }

  /**
   * Server-side price preview for a prospective booking.
   * Lets the client show the user "you will be charged ₹X" before they
   * actually commit. Pure read — never persists, never holds wallet funds.
   */
  async previewPrice(args: {
    serviceId: string;
    scheduledAt: string;
    durationMinutes?: number;
  }): Promise<{
    serviceName: string;
    religionSlug: string;
    totalPaise: number;
    platformFeePaise: number;
    providerAmountPaise: number;
  }> {
    const catalogService = await this.catalogService.getService(args.serviceId);
    if (!catalogService) throw new NotFoundException('Service not found in catalog');
    const religionSlug = catalogService.category?.religionSlug ?? 'other';
    const price = await this.pricingService.computeBookingPrice({
      serviceId: args.serviceId,
      basePricePaise: 0,
      religionSlug,
      serviceDate: args.scheduledAt.slice(0, 10),
    });
    return {
      serviceName: catalogService.name,
      religionSlug,
      totalPaise: price.totalPaise,
      platformFeePaise: price.platformFeePaise,
      providerAmountPaise: price.providerAmountPaise,
    };
  }

  async createBooking(dto: CreateBookingDto, user: AuthenticatedUser): Promise<Booking> {
    // Derive religionSlug and serviceName from the catalog — never trust the client
    const catalogService = await this.catalogService.getService(dto.serviceId);
    if (!catalogService) throw new NotFoundException('Service not found in catalog');
    const religionSlug = catalogService.category?.religionSlug ?? 'other';
    const serviceName  = catalogService.name;

    // Compute price server-side — client never supplies amountPaise
    const priceResult = await this.pricingService.computeBookingPrice({
      serviceId: dto.serviceId,
      basePricePaise: 0,
      religionSlug,
      serviceDate: dto.scheduledAt.slice(0, 10),
    });

    // Check for overlapping confirmed bookings for this provider at this slot
    const conflict = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.providerId = :providerId', { providerId: dto.providerId })
      .andWhere('b.scheduledAt = :scheduledAt', { scheduledAt: dto.scheduledAt })
      .andWhere('b.status IN (:...statuses)', { statuses: ['pending', 'confirmed'] })
      .getOne();
    if (conflict) {
      throw new ConflictException('This time slot is already booked');
    }

    const booking = this.bookingRepo.create({
      userId: user.id,
      providerId: dto.providerId,
      serviceId: dto.serviceId,
      serviceName,
      type: dto.type,
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes: dto.durationMinutes,
      notes: dto.notes,
      amountPaise: priceResult.totalPaise,
      platformFeePaise: priceResult.platformFeePaise,
      providerAmountPaise: priceResult.providerAmountPaise,
      status: BookingStatus.PENDING,
      paymentMethod: PaymentMethod.WALLET,
      paymentStatus: 'unpaid',
    });

    let saved: Booking;
    try {
      saved = await this.dataSource.transaction(async (em) => {
        const persisted = await em.save(booking);

        await em.save(
          this.eventRepo.create({
            bookingId: persisted.id,
            eventType: 'booking.created',
            actorId: user.id,
            actorRole: user.role,
            payload: { amountPaise: persisted.amountPaise, scheduledAt: dto.scheduledAt },
          }),
        );

        return persisted;
      });
    } catch (err: unknown) {
      const qfe = err as QueryFailedError & { code?: string; constraint?: string };
      if (qfe.code === '23505' || (qfe.constraint && qfe.constraint.includes('slot'))) {
        throw new ConflictException('This time slot is already booked. Please choose another.');
      }
      throw err;
    }

    // Hold wallet funds outside the DB transaction — WalletService.hold has its own internal transaction.
    // If the hold fails, we cancel and delete the booking as a compensating action so the slot is freed.
    if (booking.paymentMethod === PaymentMethod.WALLET) {
      try {
        await this.walletService.hold(
          user.id,
          priceResult.totalPaise,
          saved.id,
          'booking',
        );
        await this.bookingRepo.update(saved.id, { status: BookingStatus.CONFIRMED, paymentStatus: 'HELD' });
        saved.status = BookingStatus.CONFIRMED;
        saved.paymentStatus = 'HELD';
      } catch (holdErr) {
        // Compensate: remove the orphaned booking so the slot is freed immediately
        await this.bookingRepo.delete(saved.id).catch(() => {});
        this.logger.error({ err: holdErr, bookingId: saved.id }, 'Wallet hold failed — booking cancelled');
        throw new BadRequestException('Insufficient wallet balance or wallet unavailable');
      }
    }

    return saved;
  }

  async getMyBookings(
    userId: string,
    cursor?: string,
    limit = 20,
    status?: BookingStatus,
    from?: string,
    to?: string,
  ) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.provider', 'provider')
      .where('b.userId = :userId', { userId })
      .orderBy('b.scheduledAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .take(safeLimit + 1);

    if (status) qb.andWhere('b.status = :status', { status });
    if (from) qb.andWhere('b.scheduledAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('b.scheduledAt <= :to', { to: new Date(to) });

    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere(
        '(b.scheduledAt < :d OR (b.scheduledAt = :d AND b.id < :i))',
        { d, i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];

    return {
      data: rows.map((b) => ({
        ...b,
        providerName: b.provider?.fullName ?? null,
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor(last.scheduledAt, last.id)
          : null,
    };
  }

  async exportMyBookingsCsv(
    userId: string,
    from?: string,
    to?: string,
    status?: BookingStatus,
  ): Promise<string> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .where('b.userId = :userId', { userId })
      .orderBy('b.scheduledAt', 'DESC')
      .take(5_000);

    if (status) qb.andWhere('b.status = :status', { status });
    if (from) qb.andWhere('b.scheduledAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('b.scheduledAt <= :to', { to: new Date(to) });

    const rows = await qb.getMany();

    const header = 'id,bookingRef,serviceName,status,scheduledAt,amountPaise,paymentStatus,createdAt\n';
    const body = rows
      .map(
        (b) =>
          [
            b.id,
            b.bookingRef,
            `"${b.serviceName.replace(/"/g, '""')}"`,
            b.status,
            b.scheduledAt?.toISOString() ?? '',
            b.amountPaise,
            b.paymentStatus,
            b.createdAt?.toISOString() ?? '',
          ].join(','),
      )
      .join('\n');

    return header + body;
  }

  async getProviderBookings(
    providerId: string,
    cursor?: string,
    limit = 20,
    status?: BookingStatus,
  ) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .where('b.providerId = :providerId', { providerId })
      .orderBy('b.scheduledAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .take(safeLimit + 1);

    if (status) qb.andWhere('b.status = :status', { status });

    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere(
        '(b.scheduledAt < :d OR (b.scheduledAt = :d AND b.id < :i))',
        { d, i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];

    return {
      data: rows,
      nextCursor:
        hasMore && last
          ? encodeCursor(last.scheduledAt, last.id)
          : null,
    };
  }

  async getBookingById(id: string, user: AuthenticatedUser): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (
      user.role !== 'admin' &&
      booking.userId !== user.id &&
      booking.providerId !== user.id
    ) {
      throw new ForbiddenException('Access denied');
    }

    return booking;
  }

  async updateBooking(
    id: string,
    dto: UpdateBookingDto,
    user: AuthenticatedUser,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (dto.status === BookingStatus.CANCELLED) {
      return this.cancelBooking(id, user.id, user.role, dto.cancellationReason);
    }

    if (dto.status === BookingStatus.COMPLETED) {
      if (user.role !== 'advisor' && user.role !== 'admin') {
        throw new ForbiddenException('Only providers or admins can complete a booking');
      }
      const casResult = await this.bookingRepo.update(
        { id, status: BookingStatus.IN_PROGRESS },
        { status: BookingStatus.COMPLETED, completedAt: new Date() }
      );
      if (casResult.affected === 0) {
        throw new ConflictException('Booking is not in progress or already completed');
      }

      await this.recordHistory(id, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, ActorType.PROVIDER, user.id);
      await this.recordEvent(id, 'booking.completed', user.id, user.role, {});

      this.notifs.send(
        booking.userId,
        NotificationType.BOOKING_COMPLETED,
        'Booking Completed',
        `Your booking for ${booking.serviceName} has been completed.`,
        { bookingId: id },
      ).catch(() => {});

      // Ranking refresh — non-blocking. Bumps completed_bookings_count and
      // recomputes ranking_score so the provider's marketplace ranking
      // reflects the new completed session immediately.
      this.refreshProviderRanking(booking.providerId).catch(() => {});

      return this.bookingRepo.findOne({ where: { id } }) as Promise<Booking>;
    }

    throw new BadRequestException('Invalid status transition');
  }

  async cancelBooking(
    id: string,
    actorId: string,
    actorRole: string,
    reason = 'user_request',
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (
      actorRole !== 'admin' &&
      booking.userId !== actorId &&
      booking.providerId !== actorId
    ) {
      throw new ForbiddenException('Access denied');
    }

    const cancelable = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];
    if (!cancelable.includes(booking.status)) {
      throw new BadRequestException(
        `Booking in ${booking.status} state cannot be cancelled`,
      );
    }

    const previousStatus = booking.status;
    const casResult = await this.bookingRepo.update(
      { id, status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]) },
      { status: BookingStatus.CANCELLED, cancellationReason: reason, cancelledBy: actorRole, cancelledAt: new Date() },
    );
    if (!casResult.affected || casResult.affected === 0) {
      throw new ConflictException('Booking cannot be cancelled in its current state');
    }
    const saved = await this.bookingRepo.findOne({ where: { id } }) as Booking;

    // Release wallet hold if payment was held
    if (booking.paymentMethod === PaymentMethod.WALLET && ['CONFIRMED', 'IN_PROGRESS'].includes(previousStatus)) {
      await this.walletService.releaseHoldByReference(id).catch(async (err) => {
        this.logger.error(
          { err, bookingId: id, userId: booking.userId, action: 'RELEASE_HOLD_FAILED', requiresReconciliation: true },
          'Failed to release hold on cancel — emitting reconciliation event',
        );
        // No eventBus injected — reconciliation job will pick this up via structured log above
      });
    }

    await this.recordHistory(
      id,
      previousStatus as BookingStatus,
      BookingStatus.CANCELLED,
      actorRole === 'admin' ? ActorType.ADMIN : actorRole === 'advisor' ? ActorType.PROVIDER : ActorType.USER,
      actorId,
      reason,
    );
    await this.recordEvent(id, 'booking.cancelled', actorId, actorRole, { reason });

    this.notifs.send(
      booking.userId,
      NotificationType.BOOKING_CANCELLED,
      'Booking Cancelled',
      `Your booking for ${booking.serviceName} has been cancelled.`,
      { bookingId: id },
    ).catch(() => {});

    return saved;
  }

  async startBooking(
    bookingId: string,
    user: AuthenticatedUser,
    lat?: number,
    lng?: number,
  ): Promise<Booking> {
    // CAS guard: atomically transition CONFIRMED -> IN_PROGRESS.
    // Only the first caller wins; any concurrent or duplicate call sees affected=0
    // and gets a clear error rather than silently double-starting.
    const claimed = await this.bookingRepo.update(
      { id: bookingId, status: BookingStatus.CONFIRMED },
      { status: BookingStatus.IN_PROGRESS },
    );
    if (!claimed.affected) {
      throw new BadRequestException(
        'Booking is not in CONFIRMED state or was already started',
      );
    }

    await this.recordHistory(
      bookingId,
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
      user.role === 'advisor' ? ActorType.PROVIDER : ActorType.USER,
      user.id,
    );

    const payload: Record<string, unknown> = { startedAt: new Date().toISOString() };
    if (lat !== undefined) payload['lat'] = lat;
    if (lng !== undefined) payload['lng'] = lng;
    await this.recordEvent(bookingId, 'booking.started', user.id, user.role, payload);

    const booking = await this.bookingRepo.findOneOrFail({ where: { id: bookingId } });
    return booking;
  }

  async completeBooking(bookingId: string, userId: string): Promise<Booking> {
    // Verify provider owns this booking before the CAS attempt
    const preCheck = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!preCheck) throw new NotFoundException('Booking not found');
    if (preCheck.providerId !== userId) {
      throw new ForbiddenException('Only the provider can complete the booking');
    }

    // CAS update — only succeeds if status is IN_PROGRESS (prevents double credit)
    const result = await this.bookingRepo.update(
      { id: bookingId, status: BookingStatus.IN_PROGRESS },
      { status: BookingStatus.COMPLETED, completedAt: new Date() }
    );
    if (result.affected === 0) {
      // Already completed or not in progress — idempotent return
      const existing = await this.bookingRepo.findOne({ where: { id: bookingId } });
      if (existing?.status === BookingStatus.COMPLETED) return existing;
      throw new ConflictException('Booking is not in progress');
    }
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId }, relations: ['provider'] });

    // Settle payment: capture user hold (consume funds) → credit provider
    if (booking!.paymentMethod === PaymentMethod.WALLET) {
      await this.walletService.captureHoldByReference(booking!.id).catch(err =>
        this.logger.error({ err, bookingId: booking!.id }, 'Capture hold failed on completion')
      );

      // Record provider earning for T+2 payout
      try {
        const grossPaise = booking!.providerAmountPaise ?? Math.round(booking!.amountPaise * 0.75);
        const feePaise   = booking!.platformFeePaise ?? Math.round(booking!.amountPaise * 0.15);
        const tdsPaise   = Math.round(grossPaise * 0.10);
        await this.payoutService.recordEarning(
          booking!.providerId,
          booking!.id,
          'booking',
          grossPaise,
          feePaise,
          tdsPaise,
        );
        this.logger.log(
          { bookingId: booking!.id, providerId: booking!.providerId },
          'Booking completed — provider earning recorded for T+2 payout',
        );
      } catch (err) {
        this.logger.error({ err, bookingId: booking!.id }, 'recordEarning failed after booking completion');
      }
    }

    await this.recordHistory(
      bookingId,
      BookingStatus.IN_PROGRESS,
      BookingStatus.COMPLETED,
      ActorType.PROVIDER,
      userId,
    );
    await this.recordEvent(bookingId, 'booking.completed', userId, 'advisor', {});

    this.notifs.send(
      booking!.userId,
      NotificationType.BOOKING_COMPLETED,
      'Booking Completed',
      `Your booking for ${booking!.serviceName} has been completed.`,
      { bookingId },
    ).catch(() => {});

    // Ranking refresh — bumps completed_bookings_count + recomputes score.
    this.refreshProviderRanking(booking!.providerId).catch(() => {});

    return booking!;
  }


  /**
   * Free-form "Invite a Priest" booking.
   *
   * Two-leg flow:
   *
   *   leg 1 — { status: 'draft', ... }
   *     creates a new booking in PENDING state with a synthetic serviceId
   *     (the well-known "invite_ceremony" catalog row) and the ceremony name
   *     stored in `notes` for the priest to read. providerId is omitted (no
   *     specific priest selected yet).
   *
   *   leg 2 — { status: 'confirm', priestId, requestId, ... }
   *     updates the draft booking (looked up by requestId) — sets providerId,
   *     computes price via PricingService against the priest's price-card,
   *     transitions to PENDING_PAYMENT, and returns it. The frontend then
   *     creates a Razorpay order against the same bookingId.
   *
   * No catalog UUID is exposed to the client.
   */
  async createInviteBooking(
    dto: import('./dto/create-invite-booking.dto').CreateInviteBookingDto,
    user: AuthenticatedUser,
  ): Promise<Booking> {
    // Well-known synthetic catalog id used for invite-flow bookings.
    // Seeded via migration / data-init for each environment.
    const INVITE_CEREMONY_SERVICE_ID = process.env.INVITE_CEREMONY_SERVICE_ID
      ?? '00000000-0000-0000-0000-00000000beef';

    const isDraft = dto.status === 'draft';

    // Pack the free-form ceremony + venue + contact details into notes JSON
    // so the priest sees them on their dashboard. Booking entity already has
    // a JSONB metadata column for this kind of payload.
    const notesPayload = {
      ceremony:     dto.ceremony,
      faith:        dto.faith,
      venue:        dto.venue,
      address:      dto.address,
      city:         dto.city,
      contactName:  dto.contactName,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail ?? null,
      notes:        dto.notes ?? '',
    };

    if (isDraft) {
      // Create a brand-new draft booking with no provider yet.
      const draft = this.bookingRepo.create({
        userId: user.id,
        providerId: '00000000-0000-0000-0000-000000000000', // sentinel — overwritten on confirm
        serviceId: INVITE_CEREMONY_SERVICE_ID,
        serviceName: dto.ceremony,
        type: BookingType.OFFLINE,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: 120, // sensible default for an invite ceremony
        notes: JSON.stringify(notesPayload),
        amountPaise: 0,
        platformFeePaise: 0,
        providerAmountPaise: 0,
        status: BookingStatus.PENDING,
        paymentMethod: PaymentMethod.WALLET,
        paymentStatus: 'unpaid',
      });
      const saved = await this.bookingRepo.save(draft);
      await this.recordEvent(saved.id, 'invite.draft.created', user.id, user.role, { faith: dto.faith, ceremony: dto.ceremony });
      return saved;
    }

    // Confirm leg — need priestId + requestId.
    if (!dto.priestId || !dto.requestId) {
      throw new BadRequestException('priestId and requestId are required to confirm an invite booking');
    }

    const draft = await this.bookingRepo.findOne({ where: { id: dto.requestId, userId: user.id } });
    if (!draft) throw new NotFoundException('Invite draft not found');
    if (draft.status !== BookingStatus.PENDING) {
      throw new BadRequestException(`Invite draft is not in PENDING state (current: ${draft.status})`);
    }

    // Compute price from the chosen priest's price-card.
    // The priest's per-ceremony fee for "invite_ceremony" comes from PricingService.
    const priceResult = await this.pricingService.computeBookingPrice({
      serviceId: INVITE_CEREMONY_SERVICE_ID,
      basePricePaise: 0,
      religionSlug: dto.faith,
      serviceDate: dto.scheduledAt.slice(0, 10),
    }).catch(() => ({ totalPaise: 0, platformFeePaise: 0, providerAmountPaise: 0 } as { totalPaise: number; platformFeePaise: number; providerAmountPaise: number }));

    draft.providerId = dto.priestId;
    draft.amountPaise = priceResult.totalPaise;
    draft.platformFeePaise = priceResult.platformFeePaise;
    draft.providerAmountPaise = priceResult.providerAmountPaise;
    draft.notes = JSON.stringify(notesPayload);
    // Stay in PENDING until /payments/order is created — confirmBooking()
    // will transition PENDING → CONFIRMED on successful payment verify.
    const updated = await this.bookingRepo.save(draft);

    await this.recordEvent(updated.id, 'invite.confirm.pending_payment', user.id, user.role, {
      priestId: dto.priestId, requestId: dto.requestId,
    });

    return updated;
  }

  /**
   * CAS: PENDING → CONFIRMED. Idempotent — if already CONFIRMED, returns the booking.
   *
   * On the first CONFIRMED transition (i.e. when we actually flip the row)
   * we fire two notifications:
   *   1. To the PROVIDER — "You have a new confirmed booking"
   *   2. To the USER     — "Your booking is confirmed"
   * Both are best-effort (non-blocking .catch) so a notification transport
   * outage doesn't roll back the confirmation. This is the fix for the
   * production audit finding that priests were never told they'd been
   * booked.
   */
  async confirmBooking(bookingId: string, paymentId: string): Promise<Booking> {
    // First check if already confirmed (idempotency)
    const existing = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!existing) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (existing.status === BookingStatus.CONFIRMED) return existing;

    const result = await this.bookingRepo.update(
      { id: bookingId, status: BookingStatus.PENDING },
      { status: BookingStatus.CONFIRMED, paymentRef: paymentId },
    );
    if (!result.affected) {
      // Race: another process already confirmed; fetch fresh
      return this.bookingRepo.findOneOrFail({ where: { id: bookingId } });
    }
    const booking = await this.bookingRepo.findOneOrFail({ where: { id: bookingId } });

    /* Notifications on first confirmation only (idempotency-safe because
     * we only reach this branch when result.affected > 0). */
    this.notifs.send(
      booking.providerId,
      NotificationType.BOOKING_CONFIRMED,
      'New booking confirmed',
      `You have a new confirmed booking for ${booking.serviceName ?? 'a ceremony'}. Open the app to see the details.`,
      { bookingId: booking.id, scheduledAt: booking.scheduledAt },
    ).catch((err) =>
      this.logger.warn({ err, bookingId }, 'confirmBooking: notify provider failed'),
    );
    this.notifs.send(
      booking.userId,
      NotificationType.BOOKING_CONFIRMED,
      'Booking confirmed',
      `Your booking for ${booking.serviceName ?? 'the ceremony'} is confirmed. The provider will reach out shortly.`,
      { bookingId: booking.id, scheduledAt: booking.scheduledAt },
    ).catch((err) =>
      this.logger.warn({ err, bookingId }, 'confirmBooking: notify user failed'),
    );

    return booking;
  }

  /**
   * Mark booking as REFUNDED. Idempotent.
   */
  async markRefunded(bookingId: string): Promise<void> {
    await this.bookingRepo.update(
      { id: bookingId },
      { status: BookingStatus.REFUNDED },
    );
  }


  /**
   * Mark booking as PAYMENT_FAILED. Idempotent.
   */
  async markPaymentFailed(bookingId: string, reason: string): Promise<void> {
    await this.bookingRepo.update(
      { id: bookingId },
      { status: BookingStatus.PAYMENT_FAILED, cancellationReason: reason },
    );
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  /**
   * Called when a provider is suspended or banned.
   * Cancels all PENDING and CONFIRMED bookings for that provider and releases wallet holds.
   * Fires notifications to affected users.
   */
  async cancelBookingsByProvider(
    providerId: string,
    reason = 'provider_suspended',
  ): Promise<number> {
    const affected = await this.bookingRepo.find({
      where: [
        { providerId, status: BookingStatus.PENDING },
        { providerId, status: BookingStatus.CONFIRMED },
      ],
      take: 500, // safety cap — very unlikely to exceed in one suspension
    });

    let cancelled = 0;
    for (const booking of affected) {
      try {
        await this.cancelBooking(booking.id, 'system', 'admin', reason);
        cancelled++;
      } catch (err) {
        this.logger.error(
          { err, bookingId: booking.id, providerId },
          'cancelBookingsByProvider: failed to cancel individual booking',
        );
      }
    }

    this.logger.warn(
      { providerId, cancelled, total: affected.length },
      `cancelBookingsByProvider: cancelled ${cancelled}/${affected.length} bookings on provider suspension`,
    );
    return cancelled;
  }

  private async recordEvent(
    bookingId: string,
    eventType: string,
    actorId: string | null,
    actorRole: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({ bookingId, eventType, actorId, actorRole, payload }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to record booking event ${eventType} for ${bookingId}: ${(err as Error).message}`,
      );
    }
  }

  private async recordHistory(
    bookingId: string,
    previousStatus: BookingStatus,
    newStatus: BookingStatus,
    changedByType: ActorType,
    changedById?: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.historyRepo.save(
        this.historyRepo.create({
          bookingId,
          previousStatus,
          newStatus,
          changedByType,
          changedById,
          reason,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to record booking status history for ${bookingId}: ${(err as Error).message}`,
      );
    }
  }
}
