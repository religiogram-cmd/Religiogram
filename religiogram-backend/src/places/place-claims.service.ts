import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlaceClaim, ClaimStatus } from './entities/place-claim.entity';
import { Temple } from '../temples/entities/temple.entity';
import { CreatePlaceClaimDto } from './dto/create-place-claim.dto';
import { ReviewPlaceClaimDto } from './dto/review-place-claim.dto';
import { PlacesService } from './places.service';

/**
 * Shape returned by the user-facing claim endpoints. No admin_notes on
 * pending (there aren't any yet); included on reviewed claims so a
 * rejected user can see why.
 */
export interface ClaimDto {
  id: string;
  placeId: string;
  userId: string;
  status: ClaimStatus;
  claimEvidence: string;
  contactEmail: string | null;
  contactPhone: string | null;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin-surface variant — embeds lightweight place + claimant info so
 * the review queue doesn't N+1.
 */
export interface AdminClaimDto extends ClaimDto {
  place: { id: string; name: string; city: string; type: string } | null;
  claimant: { id: string; name: string | null; phone: string | null; email: string | null } | null;
}

/**
 * PlaceClaimsService — submit, review, withdraw claims + flip ownership.
 *
 * Concurrency note: approve() runs inside a transaction so that
 *   (a) the claim row transitions to `approved`,
 *   (b) any other pending claim on the same place gets auto-rejected
 *       ("one owner at a time"),
 *   (c) temples.owner_id flips to the claimant,
 * all commit atomically. A crashed pod mid-approve can never leave a
 * place with multiple "approved" claim rows.
 */
@Injectable()
export class PlaceClaimsService {
  private readonly logger = new Logger(PlaceClaimsService.name);

  constructor(
    @InjectRepository(PlaceClaim)
    private readonly claims: Repository<PlaceClaim>,
    @InjectRepository(Temple)
    private readonly places: Repository<Temple>,
    private readonly placesCache: PlacesService,
    private readonly dataSource: DataSource,
  ) {}

  /** User submits a claim. Enforces "one pending at a time" + place exists. */
  async submit(
    placeId: string,
    userId: string,
    dto: CreatePlaceClaimDto,
  ): Promise<ClaimDto> {
    if (!dto.contactEmail && !dto.contactPhone) {
      throw new BadRequestException(
        'At least one of contactEmail or contactPhone is required',
      );
    }

    const place = await this.places.findOne({
      where: { id: placeId },
      select: { id: true, ownerId: true },
    });
    if (!place) throw new NotFoundException('Place not found');

    // Already owned? Refuse loudly — admins can transfer ownership via the
    // admin panel; ordinary users can't grab an owned place via /claim.
    if (place.ownerId) {
      throw new ConflictException('This place already has a verified owner');
    }

    // Already has a pending claim by this user? Return a 409 so the client
    // can show the existing claim rather than creating a duplicate.
    const existing = await this.claims.findOne({
      where: { placeId, userId, status: 'pending' },
    });
    if (existing) {
      throw new ConflictException('You already have a pending claim on this place');
    }

    const saved = await this.claims.save(
      this.claims.create({
        placeId,
        userId,
        status: 'pending',
        claimEvidence: dto.claimEvidence,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
      }),
    );
    return this.toClaimDto(saved);
  }

  /** User withdraws their own pending claim. Only pending rows may be withdrawn. */
  async withdraw(placeId: string, userId: string): Promise<{ success: true }> {
    const claim = await this.claims.findOne({
      where: { placeId, userId, status: 'pending' },
    });
    if (!claim) throw new NotFoundException('No pending claim found');

    claim.status = 'withdrawn';
    await this.claims.save(claim);
    return { success: true };
  }

  /** User checks status of their own claim on a place. */
  async myStatus(placeId: string, userId: string): Promise<ClaimDto | null> {
    const claim = await this.claims.findOne({
      where: { placeId, userId },
      order: { createdAt: 'DESC' },
    });
    return claim ? this.toClaimDto(claim) : null;
  }

  /** User lists all their claims across all places. */
  async listMine(userId: string): Promise<ClaimDto[]> {
    const rows = await this.claims.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r: any) => this.toClaimDto(r));
  }

  /** Admin queue — defaults to `pending` when no status given. */
  async listForAdmin(status?: ClaimStatus): Promise<AdminClaimDto[]> {
    const qb = this.claims
      .createQueryBuilder('c')
      .leftJoin(Temple, 'p', 'p.id = c.place_id')
      .leftJoin('users', 'u', 'u.id = c.user_id')
      .select([
        'c.id AS id',
        'c.place_id AS "placeId"',
        'c.user_id AS "userId"',
        'c.status AS status',
        'c.claim_evidence AS "claimEvidence"',
        'c.contact_email AS "contactEmail"',
        'c.contact_phone AS "contactPhone"',
        'c.admin_notes AS "adminNotes"',
        'c.reviewed_at AS "reviewedAt"',
        'c.created_at AS "createdAt"',
        'c.updated_at AS "updatedAt"',
        'p.id AS "placePlaceId"',
        'p.name AS "placeName"',
        'p.city AS "placeCity"',
        'p.type AS "placeType"',
        'u.id AS "userUserId"',
        'u.name AS "userName"',
        'u.phone AS "userPhone"',
        'u.email AS "userEmail"',
      ]);

    if (status) qb.where('c.status = :status', { status });
    qb.orderBy('c.created_at', 'DESC').limit(200);

    const rows = await qb.getRawMany<{
      id: string;
      placeId: string;
      userId: string;
      status: ClaimStatus;
      claimEvidence: string;
      contactEmail: string | null;
      contactPhone: string | null;
      adminNotes: string | null;
      reviewedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      placePlaceId: string | null;
      placeName: string | null;
      placeCity: string | null;
      placeType: string | null;
      userUserId: string | null;
      userName: string | null;
      userPhone: string | null;
      userEmail: string | null;
    }>();

    return rows.map((r: any) => ({
      id: r.id,
      placeId: r.placeId,
      userId: r.userId,
      status: r.status,
      claimEvidence: r.claimEvidence,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      adminNotes: r.adminNotes,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      place: r.placePlaceId
        ? {
            id: r.placePlaceId,
            name: r.placeName ?? '',
            city: r.placeCity ?? '',
            type: r.placeType ?? 'temple',
          }
        : null,
      claimant: r.userUserId
        ? {
            id: r.userUserId,
            name: r.userName,
            phone: r.userPhone,
            email: r.userEmail,
          }
        : null,
    }));
  }

  /**
   * Admin approves a claim.
   *
   * Transaction does three things atomically:
   *   1. Flip this claim to `approved`.
   *   2. Any other pending claims on the same place → `rejected` with a
   *      standard "another claim was approved" note. This prevents racy
   *      double-approvals and gives every other pending user a clear "no".
   *   3. Set temples.owner_id to the claimant.
   */
  async approve(
    claimId: string,
    adminUserId: string,
    dto: ReviewPlaceClaimDto,
  ): Promise<ClaimDto> {
    return this.dataSource.transaction(async (manager: import('typeorm').EntityManager) => {
      const claim = await manager.findOne(PlaceClaim, { where: { id: claimId } });
      if (!claim) throw new NotFoundException('Claim not found');
      if (claim.status !== 'pending') {
        throw new BadRequestException(`Claim is already ${claim.status}`);
      }

      claim.status = 'approved';
      claim.adminNotes = dto.adminNotes ?? null;
      claim.reviewedBy = adminUserId;
      claim.reviewedAt = new Date();
      await manager.save(claim);

      // Auto-reject every other pending claim on this place.
      await manager
        .createQueryBuilder()
        .update(PlaceClaim)
        .set({
          status: 'rejected',
          adminNotes: 'Another claim for this place was approved.',
          reviewedBy: adminUserId,
          reviewedAt: new Date(),
        })
        .where('place_id = :placeId AND status = :pending AND id != :claimId', {
          placeId: claim.placeId,
          pending: 'pending',
          claimId: claim.id,
        })
        .execute();

      // Flip ownership.
      await manager
        .createQueryBuilder()
        .update(Temple)
        .set({ ownerId: claim.userId })
        .where('id = :id', { id: claim.placeId })
        .execute();

      this.logger.log(
        `Claim ${claim.id} approved — owner of place ${claim.placeId} is now user ${claim.userId}`,
      );

      // Bust the public places cache so /places/:id shows fresh state.
      await this.placesCache.bustCaches();

      return this.toClaimDto(claim);
    });
  }

  /** Admin rejects a claim. No ownership change; other pending claims untouched. */
  async reject(
    claimId: string,
    adminUserId: string,
    dto: ReviewPlaceClaimDto,
  ): Promise<ClaimDto> {
    const claim = await this.claims.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== 'pending') {
      throw new BadRequestException(`Claim is already ${claim.status}`);
    }

    claim.status = 'rejected';
    claim.adminNotes = dto.adminNotes ?? null;
    claim.reviewedBy = adminUserId;
    claim.reviewedAt = new Date();
    await this.claims.save(claim);

    this.logger.log(`Claim ${claim.id} rejected by admin ${adminUserId}`);
    return this.toClaimDto(claim);
  }

  /**
   * Guard helper used by OwnerOrAdminGuard.
   * Returns true if the user owns the place OR is an admin.
   *
   * We take the role string as a param (not from a second DB fetch) because
   * the JWT payload already carries role — skipping a read keeps the
   * per-request hot-path cheap.
   */
  async canManagePlace(
    placeId: string,
    userId: string,
    role: string,
  ): Promise<boolean> {
    if (role === 'admin') return true;
    const place = await this.places.findOne({
      where: { id: placeId },
      select: { id: true, ownerId: true },
    });
    if (!place) throw new NotFoundException('Place not found');
    return place.ownerId === userId;
  }

  /** Admin transfers ownership directly, bypassing the claim flow. */
  async setOwner(placeId: string, newOwnerId: string | null): Promise<void> {
    const place = await this.places.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');
    place.ownerId = newOwnerId;
    await this.places.save(place);
    await this.placesCache.bustCaches();
  }

  /** Guard against a user submitting on behalf of someone else via body spoof. */
  private requireOwner(claim: PlaceClaim, userId: string): void {
    if (claim.userId !== userId) {
      throw new ForbiddenException('You do not own this claim');
    }
  }

  private toClaimDto(c: PlaceClaim): ClaimDto {
    return {
      id: c.id,
      placeId: c.placeId,
      userId: c.userId,
      status: c.status,
      claimEvidence: c.claimEvidence,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      adminNotes: c.adminNotes,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
