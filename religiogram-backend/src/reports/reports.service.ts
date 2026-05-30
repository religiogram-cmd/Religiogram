import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { PlaceEvent } from '../places/entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from '../places/entities/place-service.entity';
import { PlacesService } from '../places/places.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import {
  ContentReport,
  ReportStatus,
  ReportTargetType,
} from './entities/content-report.entity';

/**
 * Public DTO shape returned to the submitting user.
 * Deliberately omits `adminNote` and `reviewedBy` — those leak
 * moderator identity that the reporter shouldn't see.
 */
export interface ReportDto {
  id: string;
  placeId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin-surface variant — includes the full audit trail, a content
 * preview (so the reviewer doesn't click through to inspect every
 * row), and the reporter's identity.
 */
export interface AdminReportDto extends ReportDto {
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reporter: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  place: {
    id: string;
    name: string;
    city: string;
    type: string;
  } | null;
  targetPreview: {
    title: string | null;
    description: string | null;
    isHidden: boolean;
    exists: boolean;
  };
}

/**
 * Unique violation code. Postgres uses '23505' for unique_violation
 * — we catch it and translate to a 409 so a race between two clicks
 * of "Report" doesn't bubble up as a 500.
 */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ContentReport)
    private readonly reports: Repository<ContentReport>,
    @InjectRepository(PlaceEvent)
    private readonly events: Repository<PlaceEvent>,
    @InjectRepository(PlaceServiceEntity)
    private readonly services: Repository<PlaceServiceEntity>,
    private readonly placesCache: PlacesService,
    private readonly dataSource: DataSource,
  ) {}

  /* ──────────────── user-facing: submit ──────────────── */

  /**
   * Accept a report from a user.
   *
   * Validation chain:
   *   1. Target row exists AND belongs to the claimed place_id. If the
   *      caller ships a (placeId=A, eventId=B) where B lives on place C,
   *      we reject — otherwise the admin review surface shows nonsense.
   *   2. Reporter is not the place owner reporting their own content.
   *      (They can hide/delete via /manage; reporting is noise.)
   *   3. User hasn't already reported this target. The UNIQUE index is
   *      the hard guarantee; we probe first for a friendly 409 and fall
   *      back to catching the PG unique-violation on race.
   */
  async submit(userId: string, dto: CreateReportDto): Promise<ReportDto> {
    await this.assertTargetBelongsToPlace(
      dto.targetType,
      dto.targetId,
      dto.placeId,
      userId,
    );

    // Friendly pre-check so the common case doesn't rely on exception
    // flow. The UNIQUE index still guards the race.
    const existing = await this.reports.findOne({
      where: { userId, targetId: dto.targetId },
    });
    if (existing) {
      throw new ConflictException('You have already reported this content');
    }

    try {
      const saved = await this.reports.save(
        this.reports.create({
          userId,
          placeId: dto.placeId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason.trim(),
          status: 'pending',
        }),
      );
      this.logger.log(
        `Report ${saved.id} submitted by ${userId} against ${dto.targetType} ${dto.targetId}`,
      );
      return this.toDto(saved);
    } catch (err) {
      // Race: two tabs double-clicked Submit and both slipped past the
      // pre-check. The UNIQUE index caught it — translate to 409.
      if (
        err instanceof QueryFailedError &&
        // @ts-ignore — driverError carries the Postgres SQLSTATE (not in public TypeORM types)
        err.driverError?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('You have already reported this content');
      }
      throw err;
    }
  }

  /* ──────────────── admin: list ──────────────── */

  /**
   * Admin review queue.
   *
   * Strategy for the "target preview" is a CASE on target_type that
   * joins into place_events OR place_services so the whole list comes
   * back in one round-trip. At current scale (< a few hundred pending
   * at any time) this is cheap and keeps the UI copy-proof.
   *
   * A missing target row is returned with `exists: false` so the admin
   * knows "the event was already deleted; just dismiss".
   */
  async listForAdmin(status?: ReportStatus, limit = 200): Promise<AdminReportDto[]> {
    const cappedLimit = Math.max(1, Math.min(limit, 500));

    const qb = this.reports
      .createQueryBuilder('r')
      .leftJoin('temples', 'p', 'p.id = r.place_id')
      .leftJoin('users', 'u', 'u.id = r.user_id')
      .leftJoin(
        PlaceEvent,
        'e',
        "r.target_type = 'event' AND e.id = r.target_id",
      )
      .leftJoin(
        PlaceServiceEntity,
        's',
        "r.target_type = 'service' AND s.id = r.target_id",
      )
      .select([
        'r.id AS id',
        'r.user_id AS "userId"',
        'r.place_id AS "placeId"',
        'r.target_type AS "targetType"',
        'r.target_id AS "targetId"',
        'r.reason AS reason',
        'r.status AS status',
        'r.admin_note AS "adminNote"',
        'r.reviewed_by AS "reviewedBy"',
        'r.reviewed_at AS "reviewedAt"',
        'r.created_at AS "createdAt"',
        'r.updated_at AS "updatedAt"',
        'p.id AS "placeRowId"',
        'p.name AS "placeName"',
        'p.city AS "placeCity"',
        'p.type AS "placeType"',
        'u.id AS "userRowId"',
        'u.name AS "userName"',
        'u.phone AS "userPhone"',
        'u.email AS "userEmail"',
        // event columns
        'e.title AS "eventTitle"',
        'e.description AS "eventDescription"',
        'e.is_hidden AS "eventIsHidden"',
        // service columns
        's.name AS "serviceName"',
        's.description AS "serviceDescription"',
        's.is_hidden AS "serviceIsHidden"',
      ]);

    if (status) qb.where('r.status = :status', { status });
    qb.orderBy('r.created_at', 'DESC').limit(cappedLimit);

    const rows = await qb.getRawMany<{
      id: string;
      userId: string;
      placeId: string;
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
      status: ReportStatus;
      adminNote: string | null;
      reviewedBy: string | null;
      reviewedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      placeRowId: string | null;
      placeName: string | null;
      placeCity: string | null;
      placeType: string | null;
      userRowId: string | null;
      userName: string | null;
      userPhone: string | null;
      userEmail: string | null;
      eventTitle: string | null;
      eventDescription: string | null;
      eventIsHidden: boolean | null;
      serviceName: string | null;
      serviceDescription: string | null;
      serviceIsHidden: boolean | null;
    }>();

    return rows.map((r: any) => {
      const isEvent = r.targetType === 'event';
      const previewTitle = isEvent ? r.eventTitle : r.serviceName;
      const previewDesc = isEvent ? r.eventDescription : r.serviceDescription;
      const previewHidden = isEvent ? r.eventIsHidden : r.serviceIsHidden;
      // exists = we got a non-null title out of the conditional join.
      const exists = previewTitle !== null;

      return {
        id: r.id,
        placeId: r.placeId,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        adminNote: r.adminNote,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reporter: r.userRowId
          ? {
              id: r.userRowId,
              name: r.userName,
              phone: r.userPhone,
              email: r.userEmail,
            }
          : null,
        place: r.placeRowId
          ? {
              id: r.placeRowId,
              name: r.placeName ?? '',
              city: r.placeCity ?? '',
              type: r.placeType ?? 'temple',
            }
          : null,
        targetPreview: {
          title: previewTitle,
          description: previewDesc,
          isHidden: previewHidden ?? false,
          exists,
        },
      };
    });
  }

  /* ──────────────── admin: review ──────────────── */

  /**
   * Approve or reject a report.
   *
   * Approve path runs inside a transaction so the report flip and the
   * target hide happen atomically; a crashed pod can never leave a
   * "reviewed" report with a still-visible target row. Places cache is
   * busted afterward so /places/:id stops surfacing the hidden row.
   *
   * Reject path is a single row update; no cache bust needed (nothing
   * that public readers see changed).
   */
  async review(
    reportId: string,
    adminUserId: string,
    dto: ReviewReportDto,
  ): Promise<ReportDto> {
    if (dto.action === 'approve') {
      return this.dataSource.transaction(async (manager: import('typeorm').EntityManager) => {
        const report = await manager.findOne(ContentReport, {
          where: { id: reportId },
        });
        if (!report) throw new NotFoundException('Report not found');
        if (report.status !== 'pending') {
          throw new BadRequestException(`Report is already ${report.status}`);
        }

        report.status = 'reviewed';
        report.adminNote = dto.note ?? null;
        report.reviewedBy = adminUserId;
        report.reviewedAt = new Date();
        await manager.save(report);

        // Hide the offending row. If the row was deleted out from under
        // us we still mark the report reviewed — the moderation decision
        // stands, even if the enforcement was already unnecessary.
        if (report.targetType === 'event') {
          await manager
            .createQueryBuilder()
            .update(PlaceEvent)
            .set({ isHidden: true })
            .where('id = :id', { id: report.targetId })
            .execute();
        } else {
          await manager
            .createQueryBuilder()
            .update(PlaceServiceEntity)
            .set({ isHidden: true })
            .where('id = :id', { id: report.targetId })
            .execute();
        }

        await this.placesCache.bustCaches();
        this.logger.log(
          `Report ${report.id} approved by ${adminUserId}; target ${report.targetType}/${report.targetId} hidden`,
        );
        return this.toDto(report);
      });
    }

    // Reject.
    const report = await this.reports.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'pending') {
      throw new BadRequestException(`Report is already ${report.status}`);
    }

    report.status = 'rejected';
    report.adminNote = dto.note ?? null;
    report.reviewedBy = adminUserId;
    report.reviewedAt = new Date();
    await this.reports.save(report);

    this.logger.log(`Report ${report.id} rejected by ${adminUserId}`);
    return this.toDto(report);
  }

  /* ──────────────── admin helpers ──────────────── */

  /**
   * Admin un-hide: flips `is_hidden` back to false. Used when a report
   * is later judged incorrect, or when the owner appeals.
   */
  async unhide(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<{ success: true }> {
    if (targetType === 'event') {
      const res = await this.events.update({ id: targetId }, { isHidden: false });
      if ((res.affected ?? 0) === 0) throw new NotFoundException('Event not found');
    } else {
      const res = await this.services.update({ id: targetId }, { isHidden: false });
      if ((res.affected ?? 0) === 0) throw new NotFoundException('Service not found');
    }
    await this.placesCache.bustCaches();
    return { success: true };
  }

  /* ──────────────── internals ──────────────── */

  /**
   * Verifies that the (targetType, targetId) row exists AND its
   * place_id equals the user-supplied placeId. The belt-and-braces
   * check defeats tampered payloads that cross-wire a report against
   * a different place than the one the user is actually viewing.
   *
   * Also blocks an owner from reporting their own content (use
   * /manage endpoints instead).
   */
  private async assertTargetBelongsToPlace(
    targetType: ReportTargetType,
    targetId: string,
    placeId: string,
    reporterId: string,
  ): Promise<void> {
    if (targetType === 'event') {
      const row = await this.events.findOne({
        where: { id: targetId, placeId },
        select: { id: true, placeId: true },
      });
      if (!row) {
        throw new NotFoundException('Event not found on this place');
      }
    } else {
      const row = await this.services.findOne({
        where: { id: targetId, placeId },
        select: { id: true, placeId: true },
      });
      if (!row) {
        throw new NotFoundException('Service not found on this place');
      }
    }

    // Owner-self-report guard. We read place.owner_id via the events
    // repo (cheapest query — no extra module wiring needed).
    const place = await this.events.manager.query<
      { owner_id: string | null }[]
    >(`SELECT owner_id FROM temples WHERE id = $1`, [placeId]);
    const ownerId = place[0]?.owner_id ?? null;
    if (ownerId && ownerId === reporterId) {
      throw new BadRequestException(
        'Owners cannot report their own place content — use /manage to hide or delete it',
      );
    }
  }

  private toDto(r: ContentReport): ReportDto {
    return {
      id: r.id,
      placeId: r.placeId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
