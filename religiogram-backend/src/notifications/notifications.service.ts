import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';
import { Notification, NotificationType } from './entities/notification.entity';
import { DeviceToken, DevicePlatform } from './entities/device-token.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import {
  PUSH_NOTIFICATION_QUEUE,
  PUSH_JOB,
  type SendSinglePushJobData,
  type SendBatchPushJobData,
  type SendMulticastPushJobData,
} from './push-notification.queue';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseReady = false;
  private firebaseApp: admin.app.App | null = null;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,

    @InjectQueue(PUSH_NOTIFICATION_QUEUE)
    private readonly pushQueue: Queue<SendSinglePushJobData | SendBatchPushJobData | SendMulticastPushJobData>,

    private readonly config: ConfigService,
  ) {}

  /**
   * Initialise Firebase Admin SDK.
   * Reads FIREBASE_SERVICE_ACCOUNT env var (base64-encoded JSON).
   * Gracefully skips if not set — all push sends become no-ops with a warning.
   */
  onModuleInit(): void {
    const raw = this.config.getOrThrow<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled. ' +
        'Set the env var to a base64-encoded Firebase service account JSON.',
      );
      return;
    }

    try {
      const json = Buffer.from(raw, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(json) as ServiceAccount;

      // Avoid double-initialisation on hot reload
      if (admin.apps.length === 0) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        this.firebaseApp = admin.apps[0] ?? null;
      }
      this.firebaseReady = true;
      this.logger.log('Firebase Admin SDK initialised');
    } catch (err) {
      this.logger.error(
        `Failed to initialise Firebase Admin SDK: ${(err as Error).message}`,
      );
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * N1/N2: Persist a notification + outbox row in a single transaction,
   * then enqueue the FCM push job from the outbox row.
   *
   * N1: A dedupKey can be supplied to prevent duplicate notifications for the
   * same event (partial unique index on user_id + type + dedup_key).
   * If a duplicate is detected the existing notification is returned silently.
   *
   * N2: The notification row and the outbox row are written inside the SAME
   * database transaction. The BullMQ enqueue happens AFTER the commit. This
   * means: if the enqueue step fails, the outbox row stays in 'pending' status
   * and a background poller (OutboxPollerService) will retry the enqueue on the
   * next tick — guaranteeing at-least-once delivery without a 2PC commit.
   */
  async send(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
    dedupKey?: string,
  ): Promise<Notification> {
    // N1: If a dedup key is provided and a matching notification already exists,
    // return the existing row without creating a duplicate.
    if (dedupKey) {
      const existing = await this.notificationRepo.findOne({
        where: { userId, type, dedupKey },
      });
      if (existing) return existing;
    }

    // N2: Write notification + outbox row in the same DB transaction.
    const saved = await this.notificationRepo.manager.transaction(async (tx) => {
      const notification = tx.create(Notification, {
        userId,
        type,
        title,
        body,
        data: data ?? null,
        dedupKey: dedupKey ?? null,
      });
      const row = await tx.save(Notification, notification);

      // Write outbox row — same transaction, so either both commit or both roll back.
      await tx.query(
        `INSERT INTO notification_outbox (notification_id, user_id, payload, status)
         VALUES ($1, $2, $3, 'pending')`,
        [row.id, userId, JSON.stringify({ userId, title, body, data })],
      );

      return row;
    });

    // Enqueue immediately as an optimistic fast path.
    // If this fails the outbox poller will retry (N2 guarantee).
    this.pushQueue
      .add(
        PUSH_JOB.SEND_SINGLE,
        { userId, title, body, data },
        {
          jobId: dedupKey ? `notif-${userId}-${type}-${dedupKey}` : undefined,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        },
      )
      .then(() =>
        // Mark outbox row enqueued on success
        this.notificationRepo.manager.query(
          `UPDATE notification_outbox SET status='enqueued', enqueued_at=NOW() WHERE notification_id=$1`,
          [saved.id],
        ),
      )
      .catch((err: Error) => {
        this.logger.warn(
          `Push enqueue failed (outbox will retry): ${err.message} [notifId=${saved.id}]`,
        );
      });

    return saved;
  }

  /**
   * P2-2: Send the same notification to multiple users.
   * Each user gets their own DB row (for per-user read tracking).
   *
   * Token lookup + chunking happens HERE, before enqueueing, so each
   * BullMQ job represents exactly one FCM multicast call (≤500 tokens).
   * This makes jobs atomic and retries cheap — one failed job only retries
   * one FCM call, not the entire fan-out.
   */
  async sendBatch(
    userIds: string[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!userIds.length) return;

    // 1. Persist per-user DB rows (unchanged)
    const rows = userIds.map((uid) =>
      this.notificationRepo.create({ userId: uid, type, title, body, data: data ?? null }),
    );
    await this.notificationRepo.save(rows, { chunk: 500 });

    // 2. Fetch all active tokens for these users in one query
    const tokenRows = await this.deviceTokenRepo
      .createQueryBuilder('dt')
      .where('dt.user_id IN (:...userIds)', { userIds })
      .andWhere('dt.is_active = true')
      .select(['dt.token'])
      .getMany();

    if (!tokenRows.length) return;

    const tokens = tokenRows.map((t: any) => t.token as string);

    // 3. Chunk into ≤500 and enqueue one SEND_MULTICAST job per chunk
    //    One BullMQ job = one FCM sendEachForMulticast call
    const FCM_CHUNK = 500;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < tokens.length; i += FCM_CHUNK) {
      jobs.push(
        this.pushQueue.add(
          PUSH_JOB.SEND_MULTICAST,
          { tokens: tokens.slice(i, i + FCM_CHUNK), title, body, data } satisfies SendMulticastPushJobData,
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 500 },
            removeOnFail: { count: 200 },
          },
        ),
      );
    }
    await Promise.all(jobs);
  }

  /**
   * Cursor-based paginated notification feed for a user.
   * cursor = base64-encoded JSON { d: ISO timestamp, i: uuid } of last seen item.
   * Uses composite (createdAt, id) keyset to avoid duplicates when timestamps collide.
   * Returns items strictly older than cursor (or all if no cursor), newest-first.
   */
  async getMyNotifications(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: Notification[]; nextCursor: string | null; unreadCount: number }> {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .limit(safeLimit + 1); // fetch one extra to determine if there's a next page

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { d: string; i: string };
        qb.andWhere(
          '(n.created_at < :d OR (n.created_at = :d AND n.id < :i))',
          { d: new Date(d), i },
        );
      } catch {
        // malformed cursor — ignore and return from beginning
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    const items = hasMore ? rows.slice(0, safeLimit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(JSON.stringify({ d: last.createdAt.toISOString(), i: last.id })).toString('base64')
        : null;

    const unreadCount = await this.notificationRepo.count({
      where: { userId, isRead: false },
    });

    return { items, nextCursor, unreadCount };
  }

  /**
   * Return the count of unread notifications for a user.
   * Cheap COUNT(*) — hits the partial index idx_notifications_user_unread
   * added by migration 032.
   */
  async countUnread(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, isRead: false },
    });
  }

  /** Mark a single notification as read (must belong to userId). */
  async markOneRead(userId: string, notificationId: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('id = :id',             { id: notificationId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();
  }

  /** Mark specific notifications as read (must belong to userId). */
  async markRead(userId: string, notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) return;
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('id IN (:...ids)', { ids: notificationIds })
      .andWhere('is_read = false')
      .execute();
  }

  /** Mark all unread notifications as read for a user. */
  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();
  }

  /**
   * Upsert a device FCM token for a user.
   * If the token already exists (for any user), claim it for this user
   * (handles the case where a device re-registers after factory reset or
   * app reinstall).
   */
  async registerDevice(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<DeviceToken> {
    const existing = await this.deviceTokenRepo.findOne({
      where: { token: dto.token },
    });

    if (existing) {
      existing.userId   = userId;
      existing.platform = dto.platform;
      existing.isActive = true;
      return this.deviceTokenRepo.save(existing);
    }

    const deviceToken = this.deviceTokenRepo.create({
      userId,
      token:    dto.token,
      platform: dto.platform,
      isActive: true,
    });
    return this.deviceTokenRepo.save(deviceToken);
  }

  /** Deactivate a device token (called on logout or app uninstall). */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.deviceTokenRepo
      .createQueryBuilder()
      .update(DeviceToken)
      .set({ isActive: false })
      .where('user_id = :userId', { userId })
      .andWhere('token = :token', { token })
      .execute();
  }

  // ─── FCM Send Helpers (called by the processor) ────────────────────────────

  /**
   * Send a push notification to all active device tokens for a user.
   * Handles stale token cleanup (FCM returns UNREGISTERED error for removed apps).
   */
  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseReady || !this.firebaseApp) {
      this.logger.debug('FCM not ready — skipping push for userId=' + userId);
      return;
    }

    const tokens = await this.deviceTokenRepo.find({
      where: { userId, isActive: true },
      select: ['id', 'token'],
      take: 500,
    });

    if (!tokens.length) return;

    const tokenStrings = tokens.map((t: any) => t.token);
    await this.sendMulticast(tokenStrings, title, body, data);
  }

  /**
   * Send push to multiple users.
   * Loads all their active tokens and multicast in batches of 500
   * (FCM sendMulticast limit).
   *
   * NOTE: Still available for direct use. For queue-based fan-out, prefer
   * sendBatch() which pre-chunks tokens before enqueueing (P2-2).
   */
  async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseReady || !this.firebaseApp) {
      this.logger.debug('FCM not ready — skipping batch push');
      return;
    }

    if (!userIds.length) return;

    const PAGE_SIZE = 500;
    type TokenRow = { id: string; token: string };
    let lastId: string | undefined;
    let fetched: TokenRow[];

    // Cursor-based pagination — avoids OFFSET performance degradation on large token sets
    do {
      const qb = this.deviceTokenRepo
        .createQueryBuilder('dt')
        .where('dt.user_id IN (:...userIds)', { userIds })
        .andWhere('dt.is_active = true')
        .select(['dt.id', 'dt.token'])
        .orderBy('dt.id', 'ASC')
        .take(PAGE_SIZE);
      if (lastId) qb.andWhere('dt.id > :lastId', { lastId });
      fetched = await qb.getMany() as TokenRow[];
      if (fetched.length === 0) break;
      lastId = fetched[fetched.length - 1].id;
      const tokenStrings = fetched.map((t) => t.token);
      await this.sendMulticast(tokenStrings, title, body, data);
    } while (fetched.length === PAGE_SIZE);
  }

  /**
   * P2-2: Send FCM multicast to a pre-resolved list of tokens (max 500).
   * Called directly by the SEND_MULTICAST processor job — no DB lookup needed.
   * Thin public wrapper around the protected sendMulticast() helper.
   */
  async sendMulticastTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.sendMulticast(tokens, title, body, data);
  }

  // ─── Protected FCM helpers ─────────────────────────────────────────────────

  /**
   * Multicast to up to 500 tokens per FCM batch.
   * Removes stale (UNREGISTERED) tokens from DB automatically.
   */
  protected async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseApp) return;

    const FCM_BATCH_SIZE = 500;
    const staleTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
      const batch = tokens.slice(i, i + FCM_BATCH_SIZE);

      try {
        const response = await admin.messaging(this.firebaseApp).sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: data ?? {},
          android: {
            priority: 'high',
            notification: { sound: 'default' },
          },
          apns: {
            payload: {
              aps: { sound: 'default', badge: 1 },
            },
          },
        });

        // Collect stale tokens from failed sends
        response.responses.forEach((resp: any, idx: number) => {
          if (
            !resp.success &&
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            staleTokens.push(batch[idx]!);
          }
        });

        this.logger.debug(
          `FCM multicast: success=${response.successCount} fail=${response.failureCount}`,
        );
      } catch (err) {
        this.logger.error(`FCM sendEachForMulticast error: ${(err as Error).message}`);
      }
    }

    // Deactivate stale tokens in bulk
    if (staleTokens.length) {
      await this.deviceTokenRepo
        .createQueryBuilder()
        .update(DeviceToken)
        .set({ isActive: false })
        .where('token IN (:...tokens)', { tokens: staleTokens })
        .execute();
      this.logger.debug(`Deactivated ${staleTokens.length} stale device tokens`);
    }
  }
}
