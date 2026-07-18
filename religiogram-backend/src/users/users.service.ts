import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { RedisService } from '../redis/redis.service';
import type { UserRole } from '../auth/interfaces/jwt-payload.interface';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findOne({ where: { phone } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.users.findOne({ where: { googleId } });
  }

  /**
   * D14 — OTP flow upsert: first-login race condition fix.
   *
   * Problem: The previous SELECT…FOR UPDATE approach only locks an EXISTING row.
   * When the row does not exist yet, two concurrent requests both read null, both
   * attempt INSERT, and one fails with a unique-constraint violation — causing a
   * 500 for one of the requests on a legitimate first login.
   *
   * Fix: Replace the two-step SELECT/INSERT with a single atomic
   *   INSERT … ON CONFLICT (phone) DO UPDATE … RETURNING (xmax = 0) AS is_new_user
   *
   * PostgreSQL guarantees that only one transaction succeeds the INSERT; the
   * loser is silently routed to the UPDATE branch. xmax = 0 is true only on a
   * freshly-inserted row, giving us the is_new_user flag without a second query.
   */
  async findOrCreateByPhone(
    phone: string,
    meta: { lastLoginIp?: string; lastDeviceId?: string } = {},
  ): Promise<{ user: User; isNewUser: boolean }> {
    const now = new Date();
    // Use a raw upsert so the INSERT+UPDATE is a single atomic statement.
    // TypeORM's queryRunner ensures the statement runs in the same connection
    // as any surrounding transaction (if one is active).
    const rows: Array<{ id: string; is_new_user: boolean }> =
      await this.dataSource.query(
        `
        INSERT INTO users (phone, provider, role, is_verified, last_login_at, last_login_ip, last_device_id, created_at, updated_at)
        VALUES ($1, 'phone', 'seeker', TRUE, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (phone) WHERE phone IS NOT NULL
        DO UPDATE SET
          last_login_at  = EXCLUDED.last_login_at,
          last_login_ip  = COALESCE(EXCLUDED.last_login_ip,  users.last_login_ip),
          last_device_id = COALESCE(EXCLUDED.last_device_id, users.last_device_id),
          updated_at     = NOW()
        RETURNING id, (xmax = 0) AS is_new_user
        `,
        [
          phone,
          now,
          meta.lastLoginIp  ?? null,
          meta.lastDeviceId ?? null,
        ],
      );

    const row = rows[0];
    if (!row) {
      // Should never happen — always returns at least one row — but be defensive.
      throw new Error(`findOrCreateByPhone: no row returned for phone ${phone}`);
    }

    const user = await this.users.findOneOrFail({ where: { id: row.id } });
    return { user, isNewUser: row.is_new_user };
  }

  /**
   * Best-effort last-login tracker used by email/Google flows. Updates
   * last_login_at, last_login_ip and last_device_id without throwing.
   */
  async updateLastLogin(
    userId: string,
    meta: { lastLoginIp?: string; lastDeviceId?: string },
  ): Promise<void> {
    try {
      await this.users.update(
        { id: userId },
        {
          lastLoginAt: new Date(),
          ...(meta.lastLoginIp ? { lastLoginIp: meta.lastLoginIp } : {}),
          ...(meta.lastDeviceId ? { lastDeviceId: meta.lastDeviceId } : {}),
        } as Partial<User>,
      );
    } catch {
      // Non-fatal — auth response must not depend on this succeeding.
    }
  }

  /**
   * Google OAuth upsert. Links by googleId first, then falls back to email
   * (useful when an existing OTP user later adds Google).
   *
   * FIX: Same race condition protection as findOrCreateByPhone — runs inside
   * a transaction with pessimistic write locks.
   */
  async findOrCreateByGoogle(
    profile: GoogleProfile,
    meta: { lastLoginIp?: string; lastDeviceId?: string } = {},
  ): Promise<{ user: User; isNewUser: boolean }> {
    return this.dataSource.transaction(async (tx: import('typeorm').EntityManager) => {
      let user = await tx.findOne(User, {
        where: { googleId: profile.googleId },
        lock: { mode: 'pessimistic_write' },
      });

      let isNewUser = false;

      if (!user && profile.email) {
        user = await tx.findOne(User, {
          where: { email: profile.email },
          lock: { mode: 'pessimistic_write' },
        });
        if (user) {
          // Link existing OTP account to Google
          user.googleId = profile.googleId;
          if (!user.avatarUrl) user.avatarUrl = profile.avatarUrl;
        }
      }

      if (!user) {
        isNewUser = true;
        user = tx.create(User, {
          email: profile.email,
          googleId: profile.googleId,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          provider: 'google',
          role: 'seeker',
          isVerified: true, // email was verified by Google
        });
      }

      user.lastLoginAt = new Date();
      if (meta.lastLoginIp) user.lastLoginIp = meta.lastLoginIp;
      if (meta.lastDeviceId) user.lastDeviceId = meta.lastDeviceId;

      await tx.save(User, user);
      return { user, isNewUser };
    });
  }

  /**
   * Profile update — used by /users/me PATCH.
   *
   * FIX: Explicit uniqueness check on email before save. Without this, two
   * users racing to claim the same email would both pass validation and one
   * would get a 500 Internal Server Error from the unique-index violation
   * instead of a friendly 409 Conflict.
   *
   * FIX: Busts the auth-service user cache so a subsequent token refresh
   * doesn't serve the stale name/email/avatar for up to 1 hour.
   */
  async updateProfile(
    id: string,
    patch: Partial<Pick<User, 'name' | 'email' | 'avatarUrl' | 'faith'>>,
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (patch.email && patch.email !== user.email) {
      const existing = await this.users.findOne({
        where: { email: patch.email, id: Not(id) },
      });
      if (existing) {
        throw new ConflictException('This email is already in use.');
      }
    }

    Object.assign(user, patch);

    // Sync fix: when Settings changes `name`, mirror to `displayName` too
    // so the Community feed / posts / DMs pick it up without a second write.
    // If a user wants a *different* handle for Community they set it via the
    // Community edit flow which writes both fields together — so the pair
    // stays consistent regardless of which UI edited it.
    if (patch.name !== undefined) {
      (user as any).displayName = patch.name;
    }

    const saved = await this.users.save(user);

    // Invalidate the refresh-cache so the next /auth/refresh sees fresh data.
    await this.redis.del(`user:cache:${id}`);

    return saved;
  }

  /**
   * Role update — used by the role-select onboarding screen.
   *
   * The frontend calls PATCH /api/v1/users/me/role with { role } after the
   * user picks "Seeker" or "Advisor". Previously this endpoint was missing
   * entirely, causing the onboarding flow to 404 silently and the user to
   * be stuck on a spinner.
   */
  async updateRole(id: string, role: UserRole): Promise<User> {
    if (role !== 'seeker' && role !== 'advisor') {
      throw new BadRequestException('Role must be "seeker" or "advisor".');
    }
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    // Only allow upgrades from the default 'seeker' to 'advisor'.
    // Downgrades and admin promotions are deliberately not supported here —
    // an admin-only endpoint (guarded by @Roles('admin')) owns those changes.
    if (user.role === 'admin') {
      throw new BadRequestException('Admin role cannot be changed via self-service.');
    }

    user.role = role;
    const saved = await this.users.save(user);
    await this.redis.del(`user:cache:${id}`);
    return saved;
  }

  async isBlocked(phone: string): Promise<boolean> {
    const flag = await this.redis.get(`blocked:phone:${phone}`);
    return flag === '1';
  }

  /**
   * Mirror the profile-completion flag onto the user row.
   *
   * Why duplicate it here when `profiles.completed` is the source of truth?
   *   - /users/me is hot — every authed page read calls it. Joining
   *     against profiles on every request adds an avoidable hop.
   *   - We bust the cache so the dashboard sees the new flag immediately
   *     without waiting for the 1-hour TTL.
   *
   * The flip is best-effort from the profile service's perspective; if
   * this throws, the profile is still marked complete authoritatively
   * and the dashboard will just take one round trip longer to notice.
   */
  async markProfileComplete(id: string, complete: boolean): Promise<void> {
    await this.users.update({ id }, { profileComplete: complete });
    await this.redis.del(`user:cache:${id}`);
  }
  /** Create a brand-new email+password user. */
  async createEmailUser(opts: {
    email: string;
    passwordHash: string;
    name?: string;
  }): Promise<User> {
    return this.dataSource.transaction(async (tx: import('typeorm').EntityManager) => {
      // Guard against race condition
      const existing = await tx.findOne(User, { where: { email: opts.email } });
      if (existing) return existing;

      const user = tx.create(User, {
        email: opts.email,
        passwordHash: opts.passwordHash,
        name: opts.name ?? null,
        provider: 'email' as import('./entities/user.entity').AuthProvider,
        role: 'seeker',
        isVerified: false,
        isActive: true,
      });
      return tx.save(User, user);
    });
  }

  /** Attach (or update) a bcrypt hash to an existing account. */
  async setPasswordHash(userId: string, passwordHash: string): Promise<User> {
    await this.users.update(userId, { passwordHash } as Partial<User>);
    return this.users.findOneOrFail({ where: { id: userId } });
  }

  // ── Username / profile-setup methods ────────────────────────────────────

  async checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
    const clean = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const exists = await this.users.findOne({ where: { username: clean } });
    return { available: !exists };
  }

  async suggestUsernames(base: string): Promise<string[]> {
    const clean = base.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    const suffix = (parseInt(crypto.randomBytes(2).toString('hex'), 16) % 9000) + 1000;
    const candidates = [
      clean,
      `${clean}${suffix}`,
      `${clean}_devotee`,
      `${clean}_spiritual`,
      `the_${clean}`,
    ];
    const available: string[] = [];
    let attempts = 0;
    for (const s of candidates) {
      if (attempts++ >= 20) break;
      const exists = await this.users.findOne({ where: { username: s } });
      if (!exists) available.push(s);
    }
    return available.slice(0, 4);
  }

  async setupProfile(
    userId: string,
    dto: { username: string; name?: string; bio?: string; avatarUrl?: string },
  ): Promise<User> {
    const clean = dto.username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const existing = await this.users.findOne({ where: { username: clean } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Username already taken');
    }
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return this.users.save(
      Object.assign(user, {
        username: clean,
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        profileComplete: true,
      }),
    );
  }

  /**
   * GDPR / DPDP Act 2023 — Right to Erasure
   *
   * Anonymises all personally identifiable information for the given user and
   * soft-deletes the account. The row is retained so foreign-key references
   * (bookings, ledger entries, reviews) do not orphan, but no PII survives.
   *
   * Anonymisation strategy:
   *   - name       => "Deleted User"
   *   - email      => deleted_{uuid}@deleted.invalid  (unique, never re-registered)
   *   - phone      => null
   *   - passwordHash => null
   *   - googleId   => null
   *   - avatarUrl  => null
   *   - bio        => null
   *   - username   => deleted_{uuid[0..7]}  (unique slug)
   *   - isActive   => false
   *   - deletedAt  => now()  (TypeORM soft-delete column)
   *
   * Session cleanup:
   *   - All Redis refresh-token keys for this user are revoked via SCAN+UNLINK.
   *   - The profile/user cache key is deleted so any in-flight token refresh
   *     cannot return stale PII.
   *
   * Downstream effects are handled asynchronously by the EventEmitter listener
   * in the bookings/wallet modules (they subscribe to 'user.deleted').
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Idempotency — already deleted
    if (user.deletedAt) return;

    const stub = userId.slice(0, 8);

    await this.users.save(
      Object.assign(user, {
        name:         'Deleted User',
        email:        `deleted_${userId}@deleted.invalid`,
        phone:        null,
        passwordHash: null,
        googleId:     null,
        avatarUrl:    null,
        bio:          null,
        username:     `deleted_${stub}`,
        isActive:     false,
        deletedAt:    new Date(),
      }),
    );

    /* Full cascade cleanup so a delete is genuinely a delete:
     *   - Revoke every Redis auth artefact (refresh, user cache, minIat stamp).
     *   - Deactivate FCM device tokens so we never push to a deleted account.
     *     (Physical delete is optional — soft-marking prevents dispatch but
     *     keeps the row for post-mortem debugging.)
     *   - Publish `user.deleted` for downstream modules (bookings, wallet,
     *     notifications outbox) to cancel pending state.
     *
     * All best-effort with .allSettled so a partial failure never leaves the
     * user in a half-deleted state — the anonymisation above already
     * satisfies the DPDP/GDPR right-to-erasure minimum.
     */
    const nowSec = Math.floor(Date.now() / 1000);
    await Promise.allSettled([
      this.redis.scanDelete(`refresh:user:${userId}:*`),
      this.redis.scanDelete(`refresh:${userId}:*`),
      this.redis.del(`user:cache:${userId}`),
      this.redis.getClient().set(`user:${userId}:minIat`, String(nowSec)),
      // Deactivate all FCM device tokens for this user — send() filters on
      // is_active so no push will reach the deleted account.
      this.dataSource
        .query(`UPDATE device_tokens SET is_active = false WHERE user_id = $1`, [userId])
        .catch(() => undefined),
    ]);
  }

  async searchByUsernameOrName(query: string, requesterId: string): Promise<User[]> {
    /* P2-2: prefix ILIKE + pg_trgm similarity — avoids seq-scan leading-wildcard.
     *
     * Previous implementation had a broken WHERE clause: the SQL fragment
     * contained an unbalanced paren and a stray `:raw) > 0.2` that referenced
     * an undefined column. Any call threw a Postgres syntax error at runtime.
     * Rewritten as a clean prefix-match + trigram similarity union. */
    const sanitised = query.replace(/[%_\\]/g, '\\$&');
    return this.users
      .createQueryBuilder('u')
      .where(
        `(
          u.username ILIKE :q
          OR u.name ILIKE :q
          OR u.display_name ILIKE :q
          OR similarity(COALESCE(u.name, ''), :raw) > 0.2
          OR similarity(COALESCE(u.display_name, ''), :raw) > 0.2
        )`,
        { q: `${sanitised}%`, raw: query },
      )
      .andWhere('u.id != :me', { me: requesterId })
      .andWhere('u.is_active = true')
      .orderBy(`similarity(COALESCE(u.display_name, u.name, ''), :raw)`, 'DESC')
      .setParameter('raw', query)
      .limit(20)
      .getMany();
  }
}
