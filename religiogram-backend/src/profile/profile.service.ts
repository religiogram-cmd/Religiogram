import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { UsersService } from '../users/users.service';

/**
 * Profile service.
 *
 * Three operations:
 *   - get(userId)            → read or 404
 *   - createOrGet(userId)    → idempotent insert (POST)
 *   - update(userId, patch)  → partial deep-merge (PATCH)
 *
 * The service intentionally:
 *   - Caps the `data` payload at 16 KB so a buggy client can't blow up
 *     the JSONB column. PostgreSQL will TOAST larger payloads but every
 *     read pays the cost; better to fail fast.
 *   - Does NOT validate the *contents* of `data` — per-step validation
 *     belongs in step-specific endpoints when product asks for it. Today
 *     the wizard sends free-form keys.
 *   - Treats `completed = true` as a one-way flip — we never let it go
 *     back to false, since the dashboard derives "show resume card"
 *     entirely from this flag.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private static readonly MAX_DATA_BYTES = 16 * 1024;

  constructor(
    @InjectRepository(Profile)
    private readonly repo: Repository<Profile>,
    private readonly users: UsersService,
  ) {}

  /** GET /profile — throws 404 if no row exists yet. Caller may catch. */
  async get(userId: string): Promise<Profile> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) throw new NotFoundException('Profile not found');
    return row;
  }

  /**
   * POST /profile — idempotent. If a row exists, return it. If not,
   * insert with the supplied initial values (or sensible defaults).
   * We do this in a single INSERT … ON CONFLICT so two concurrent
   * POSTs from the same user (e.g. wizard + dashboard hydrating in
   * parallel) can't deadlock or duplicate.
   */
  async createOrGet(userId: string, dto: UpsertProfileDto): Promise<Profile> {
    // Confirm the user actually exists. Cheap — usually a cache hit.
    const exists = await this.users.findById(userId);
    if (!exists) throw new NotFoundException('User not found');

    this.assertSize(dto.data);

    const draft: Partial<Profile> = {
      userId,
      step: dto.step ?? 0,
      data: dto.data ?? {},
      completed: dto.completed ?? false,
    };

    // Use the QueryBuilder's upsert. ON CONFLICT DO NOTHING so an existing
    // row isn't clobbered; we re-read after to return the canonical row.
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Profile)
      .values(draft as any)
      .orIgnore()
      .execute();

    return this.repo.findOneOrFail({ where: { userId } });
  }

  /**
   * PATCH /profile — partial deep-merge.
   *
   * `data` is JSONB-merged at the SQL layer (jsonb || $patch) so we don't
   * round-trip the whole document. `step` and `completed` are ordinary
   * column updates.
   *
   * If no row exists yet, we transparently create one — the wizard's
   * autosave shouldn't 404 just because the user never POSTed first.
   */
  async update(userId: string, dto: UpsertProfileDto): Promise<Profile> {
    this.assertSize(dto.data);

    const existing = await this.repo.findOne({ where: { userId } });
    if (!existing) {
      // Same as createOrGet but seeded from the PATCH body.
      return this.createOrGet(userId, dto);
    }

    // Build the SET clause selectively so an empty PATCH is a no-op.
    // We use positional ($1, $2, …) parameters directly — the underlying
    // node-postgres driver expects them, and emitting them by hand avoids
    // the brittle named→positional rewriting we'd otherwise need.
    const sets: string[] = [];
    const values: unknown[] = [];
    const next = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };

    if (dto.step !== undefined) {
      sets.push(`step = ${next(dto.step)}`);
    }
    if (dto.data !== undefined) {
      // jsonb || jsonb is PostgreSQL's JSON merge operator. It performs a
      // *shallow* merge at the top level — nested objects are replaced,
      // not deep-merged. That matches the wizard's semantics (each step
      // owns its own keys). If product ever wants true deep merge, swap
      // for jsonb_set() with a recursive helper.
      sets.push(`data = data || CAST(${next(JSON.stringify(dto.data))} AS jsonb)`);
    }
    if (dto.completed !== undefined) {
      // One-way flip: once true, stays true. We silently drop attempts
      // to un-complete a finished profile so a buggy client can't undo.
      if (dto.completed === true) {
        sets.push('completed = true');
      } else if (existing.completed === false) {
        sets.push('completed = false');
      }
    }

    if (sets.length === 0) {
      return existing;
    }

    sets.push('updated_at = now()');
    const userIdPlaceholder = next(userId);

    await this.repo.query(
      `UPDATE profiles SET ${sets.join(', ')} WHERE user_id = ${userIdPlaceholder}`,
      values,
    );

    // If we just flipped completed, mirror the flag on the user row so
    // /users/me can short-circuit without a profiles join on every call.
    if (dto.completed === true && !existing.completed) {
      try {
        await this.users.markProfileComplete(userId, true);
      } catch (err) {
        this.logger.warn(
          `Failed to mirror profileComplete on user ${userId}: ${(err as Error).message}`,
        );
        // Non-fatal — /users/me will fall back to the JOIN if needed.
      }
    }

    return this.repo.findOneOrFail({ where: { userId } });
  }

  /* ─── Helpers ─────────────────────────────────────────────── */
  private assertSize(data: Record<string, unknown> | undefined): void {
    if (!data) return;
    const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    if (bytes > ProfileService.MAX_DATA_BYTES) {
      throw new BadRequestException(
        `Profile data exceeds the ${ProfileService.MAX_DATA_BYTES}-byte limit.`,
      );
    }
  }
}
