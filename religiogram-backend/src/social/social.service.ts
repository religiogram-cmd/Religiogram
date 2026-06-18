import { RedisService } from '../redis/redis.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'; // patched
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository, In, Not } from 'typeorm';
import { Friendship } from './entities/friendship.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostBookmark } from './entities/post-bookmark.entity';
import { PostComment } from './entities/post-comment.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { User } from '../users/entities/user.entity';
import { CreatePostDto, CreateCommentDto, SendDmDto } from './dto/social.dto';
import { FeedService } from './feed.service';
import { FeatureFlagsService } from '../common/feature-flags/feature-flags.service';
import { DomainEventPublisher } from '../events/domain-event-publisher';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { QUEUE } from '../common/queues/queue.constants';
import type { FanOutJobData } from './processors/fan-out.processor';

/**
 * Friends count above which fan-out is deferred to a BullMQ job
 * (when ENABLE_ASYNC_FANOUT is true).
 * Configurable via FEED_ASYNC_FANOUT_THRESHOLD env var.
 * Default: 50 — at launch no user has 500 followers; async path was never
 * exercised and sync fan-out silently failed for everyone above the old 500
 * threshold that no real user ever hit.
 */
const DEFAULT_ASYNC_FANOUT_THRESHOLD = 50; // reduced from 500 — P1 fix

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly redis: RedisService,
    @InjectRepository(Friendship) private friendships: Repository<Friendship>,
    @InjectRepository(Post) private posts: Repository<Post>,
    @InjectRepository(PostLike) private likes: Repository<PostLike>,
    @InjectRepository(PostBookmark) private bookmarks: Repository<PostBookmark>,
    @InjectRepository(PostComment) private comments: Repository<PostComment>,
    @InjectRepository(DirectMessage) private dms: Repository<DirectMessage>,
    @InjectRepository(User) private users: Repository<User>,
    private readonly feed: FeedService,
    private readonly flags: FeatureFlagsService,
    private readonly events: DomainEventPublisher,
    private readonly config: ConfigService,
    private readonly notifs: NotificationsService,
    @InjectQueue(QUEUE.FEED_FANOUT) private readonly fanOutQueue: Queue,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ── User search ─────────────────────────────────────────────────────────
  async searchUsers(query: string, requesterId: string) {
    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 1) return [];
    // Simple ILIKE search across username, name, display_name — no full_name column dependency
    const rows: Array<{
      id: string; username: string | null; name: string | null;
      display_name: string | null; avatar_url: string | null; bio: string | null;
    }> = await this.ds.query(
      `SELECT id, username, name, display_name, avatar_url, bio
         FROM users
        WHERE id <> $1
          AND deleted_at IS NULL
          AND (
            LOWER(username)     LIKE $2 OR
            LOWER(display_name) LIKE $2 OR
            LOWER(name)         LIKE $2
          )
        LIMIT 20`,
      [requesterId, `%${q}%`],
    );

    return rows.map((u) => ({
      id: u.id,
      fullName: u.name ?? u.display_name,
      name: u.name ?? u.display_name,
      username: u.username,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      bio: u.bio,
      friendshipStatus: null,
    }));
  }

  // ── Friendships ──────────────────────────────────────────────────────────
  async sendFriendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) throw new BadRequestException('Cannot add yourself');

    // §11.3 Anti-spam: max 20 friend requests sent per user per day
    const sentKey = `social:friend_req:sent:${requesterId}`;
    const sentCount = await this.redis.incr(sentKey);
    if (sentCount === 1) await this.redis.expire(sentKey, 86_400); // 24 h TTL on first increment
    if (sentCount > 20) {
      throw new HttpException('Friend request limit reached (20/day). Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // §11.3 Soft-throttle: accounts < 7 days old with no profile photo
    const requesterUser = await this.users.findOne({ where: { id: requesterId } });
    if (requesterUser) {
      const ageMs = Date.now() - new Date(requesterUser.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const hasPhoto = !!requesterUser.avatarUrl;
      if (ageDays < 7 && !hasPhoto && sentCount > 5) {
        throw new HttpException('New accounts without a profile photo can send max 5 requests/day.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const exists = await this.friendships.findOne({
      where: [
        { requesterId, addresseeId },
        { requesterId: addresseeId, addresseeId: requesterId },
      ],
    });
    if (exists) throw new BadRequestException('Friendship already exists');
    const f = this.friendships.create({ requesterId, addresseeId, status: 'pending' });
    const saved = await this.friendships.save(f);
    // Notify addressee about new friend request
    const requester = await this.users.findOne({ where: { id: requesterId } });
    const name = requester?.name || requester?.username || 'Someone';
    this.notifs.send(
      addresseeId,
      NotificationType.FRIEND_REQUEST,
      '👤 Friend request',
      `${name} sent you a friend request`,
      { friendshipId: saved.id, actorId: requesterId },
    ).catch(() => {});
    return saved;
  }

  async respondToRequest(userId: string, requesterId: string, accept: boolean) {
    const f = await this.friendships.findOne({ where: { requesterId, addresseeId: userId, status: 'pending' } });
    if (!f) throw new NotFoundException('Friend request not found');
    f.status = accept ? 'accepted' : 'rejected';
    const saved = await this.friendships.save(f);

    // §11.3 Anti-spam: slow down farming — cooldown after 10 accepts in 24 hours
    if (accept) {
      const acceptKey = `social:friend_req:accepts:${userId}`;
      const acceptCount = await this.redis.incr(acceptKey);
      if (acceptCount === 1) await this.redis.expire(acceptKey, 86_400);
      if (acceptCount > 10) {
        // Soft-signal: log but don't block (cooldown is applied at send side)
        // Future: add a short delay via BullMQ if needed
      }
    }
    // On acceptance: backfill feeds + notify the original requester
    if (accept) {
      this.feed.backfillOnFriendship(f.requesterId, f.addresseeId).catch(() => {});
      const accepter = await this.users.findOne({ where: { id: userId } });
      const name = accepter?.name || accepter?.username || 'Someone';
      this.notifs.send(
        f.requesterId,
        NotificationType.FRIEND_ACCEPTED,
        '✅ Friend request accepted',
        `${name} accepted your friend request`,
        { friendshipId: saved.id, actorId: userId },
      ).catch(() => {});
    }
    return saved;
  }

  /**
   * Returns a cursor-paginated list of accepted friends.
   * Replaces the old take:500 hard cap — now safe for power users with 1000+ friends.
   */
  async getFriends(
    userId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: { id: string; fullName: string | null; avatarUrl: string | null; friendshipId: string; username: string | null }[]; nextCursor: string | null; hasMore: boolean }> {
    const PAGE = Math.min(limit, 100);
    let cursorId: string | undefined;
    if (cursor) {
      try {
        ({ id: cursorId } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
      } catch { /* ignore malformed cursor — start from beginning */ }
    }

    const qb = this.friendships.createQueryBuilder('f')
      .leftJoinAndSelect('f.requester', 'requester')
      .leftJoinAndSelect('f.addressee', 'addressee')
      .where('f.status = :status', { status: 'accepted' })
      .andWhere('(f.requesterId = :uid OR f.addresseeId = :uid)', { uid: userId })
      .orderBy('f.id', 'ASC')
      .take(PAGE + 1);

    if (cursorId) qb.andWhere('f.id > :cursorId', { cursorId });

    const rows = await qb.getMany();
    const hasMore = rows.length > PAGE;
    const data = rows.slice(0, PAGE).map((f) => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      // Explicitly project safe fields only — never expose passwordHash, role, or sensitive columns
      return {
        id: friend.id,
        fullName: friend.name,
        avatarUrl: friend.avatarUrl ?? null,
        friendshipId: f.id,
        username: friend.username ?? null,
      };
    });
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ id: last.friendshipId }), 'utf8').toString('base64url')
      : null;
    return { data, nextCursor, hasMore };
  }

  /**
   * Returns an array of user IDs that are accepted friends of the given user.
   * Used by community.controller.ts to populate the story feed.
   */
  async getFriendIds(userId: string): Promise<string[]> {
    // Cursor-based pagination to avoid silent take:500 truncation for power users
    const PAGE = 500;
    const ids: string[] = [];
    let lastId: string | undefined;

    do {
      const qb = this.friendships.createQueryBuilder('f')
        .select(['f.id', 'f.requesterId', 'f.addresseeId'])
        .where('f.status = :status', { status: 'accepted' })
        .andWhere('(f.requesterId = :uid OR f.addresseeId = :uid)', { uid: userId })
        .orderBy('f.id', 'ASC')
        .take(PAGE);

      if (lastId) qb.andWhere('f.id > :lastId', { lastId });

      const batch = await qb.getMany();
      for (const f of batch) {
        ids.push(f.requesterId === userId ? f.addresseeId : f.requesterId);
      }
      if (batch.length > 0) lastId = batch[batch.length - 1].id;
      if (batch.length < PAGE) break;
    } while (true);

    return ids;
  }

  async getPendingRequests(userId: string, cursor?: string, limit = 50) {
    const PAGE = Math.min(limit, 100);
    const qb = this.friendships.createQueryBuilder('f')
      .leftJoinAndSelect('f.requester', 'req')
      .where('f.addresseeId = :userId', { userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .orderBy('f.id', 'ASC')
      .take(PAGE + 1);

    if (cursor) {
      try {
        const { id: curId } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        qb.andWhere('f.id > :curId', { curId });
      } catch { /* malformed cursor — ignore */ }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > PAGE;
    const data = hasMore ? rows.slice(0, PAGE) : rows;
    const nextCursor = hasMore && data.length > 0
      ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id })).toString('base64url')
      : null;

    return {
      data: data.map((f) => ({
        ...f,
        requester: f.requester ? {
          id: f.requester.id,
          name: f.requester.name,
          avatar: f.requester.avatarUrl,
          username: f.requester.username,
        } : null,
      })),
      nextCursor,
      hasMore,
    };
  }

  async getSentRequests(userId: string, cursor?: string, limit = 50) {
    const PAGE = Math.min(limit, 100);
    const qb = this.friendships.createQueryBuilder('f')
      .leftJoinAndSelect('f.addressee', 'addr')
      .where('f.requesterId = :userId', { userId })
      .andWhere('f.status = :status', { status: 'pending' })
      .orderBy('f.id', 'ASC')
      .take(PAGE + 1);

    if (cursor) {
      try {
        const { id: curId } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        qb.andWhere('f.id > :curId', { curId });
      } catch { /* malformed cursor — ignore */ }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > PAGE;
    const data = hasMore ? rows.slice(0, PAGE) : rows;
    const nextCursor = hasMore && data.length > 0
      ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id })).toString('base64url')
      : null;

    // Project safe fields only — never expose passwordHash, email, phone, role
    return {
      data: data.map((f) => ({
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        addressee: f.addressee ? {
          id: f.addressee.id,
          displayName: f.addressee.displayName || f.addressee.name,
          avatarUrl: f.addressee.avatarUrl ?? null,
          username: f.addressee.username ?? null,
        } : null,
      })),
      nextCursor,
      hasMore,
    };
  }

  async removeFriend(userId: string, otherId: string) {
    const f = await this.friendships.findOne({
      where: [
        { requesterId: userId, addresseeId: otherId, status: 'accepted' },
        { requesterId: otherId, addresseeId: userId, status: 'accepted' },
      ],
    });
    if (!f) throw new NotFoundException();
    await this.friendships.remove(f);
    // Prune each user's posts from the other's feed.
    this.feed.pruneForUnfriend(userId, otherId).catch(() => {});
  }

  // ── Posts ────────────────────────────────────────────────────────────────
  async createPost(authorId: string, dto: CreatePostDto) {
    // Accept both naming conventions: caption|text, imageUrls|photoUrls
    const caption = dto.caption ?? (dto as any).text ?? null;
    const imageUrls = dto.imageUrls ?? (dto as any).photoUrls ?? [];
    if (!caption && (!imageUrls || imageUrls.length === 0)) {
      throw new BadRequestException('Post must have caption or at least one image');
    }
    const post = this.posts.create({
      authorId,
      caption,
      imageUrls,
    });
    const saved = await this.posts.save(post);

    // Insert into the author's own feed_items so they see their own post immediately
    try {
      await this.ds.query(
        `INSERT INTO feed_items (user_id, post_id, inserted_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [authorId, saved.id, saved.createdAt],
      );
    } catch (err) {
      console.error('[social] self-feed insert failed (non-fatal):', err);
    }

    // ── Fan-out strategy ──────────────────────────────────────────────────
    // For most users (< threshold friends): fan-out inline (sync, fire-and-forget).
    // For high-follower authors: defer to BullMQ when ENABLE_ASYNC_FANOUT is on.
    // Wrapped in try/catch so DB/queue/schema issues don't fail the user's post.
    try {
      await this._fanOutPost(saved.id, authorId, saved.createdAt);
    } catch (err) {
      // log but don't fail — post is saved, fan-out can be retried
      console.error('[social] fanOut failed (non-fatal):', err);
    }

    // Emit Kafka event for other async consumers.
    try {
      this.events.publishPostPublished({
        eventType: 'post.published',
        postId: saved.id,
        authorId,
        postCreatedAt: saved.createdAt.toISOString(),
      });
    } catch (err) {
      console.error('[social] event publish failed (non-fatal):', err);
    }

    return saved;
  }

  // ── Fan-out routing ────────────────────────────────────────────────────────

  /**
   * Decides whether to run feed fan-out synchronously or via BullMQ.
   *
   * Sync path  (default): fan-out inline before the HTTP response is sent.
   *   - Low latency addition (~5-50 ms), acceptable for typical users.
   *   - Fire-and-forget: errors are logged but not propagated.
   *
   * Async path (ENABLE_ASYNC_FANOUT=true + author above threshold):
   *   - Enqueues a FanOutJob; BullMQ processor calls FeedService.fanOut().
   *   - HTTP response returns immediately after post is saved.
   *   - Friends see the post in their feed within seconds (BullMQ processing time).
   *   - Idempotent: ON CONFLICT DO NOTHING in FeedService.fanOut().
   */
  private async _fanOutPost(
    postId: string,
    authorId: string,
    postCreatedAt: Date,
  ): Promise<void> {
    try {
      const asyncEnabled = await this.flags.isEnabled('ENABLE_ASYNC_FANOUT');

      if (asyncEnabled) {
        // Always enqueue async — skip the count entirely (ENABLE_ASYNC_FANOUT=true path)
        const jobData: FanOutJobData = {
          postId,
          authorId,
          postCreatedAt: postCreatedAt.toISOString(),
        };
        await this.fanOutQueue.add('fan-out', jobData, {
          attempts: 4,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        });
        this.logger.debug(`Async fan-out enqueued for post=${postId} author=${authorId}`);
        return;
      }

      // Sync path (default): inline, fire-and-forget
      this.feed.fanOut(postId, authorId, postCreatedAt).catch((err: Error) => {
        this.logger.error(
          `Sync fan-out failed post=${postId}: ${err.message}`,
        );
      });
    } catch (err) {
      // Fan-out is non-fatal — the post is saved; timeline may lag briefly.
      this.logger.error(
        `_fanOutPost routing failed post=${postId}: ${(err as Error).message}`,
      );
    }
  }

  async getFeed(userId: string, cursor?: string, limit = 20) {
    // P1-1 / FIX-9: Keyset pagination on (inserted_at DESC, post_id DESC)
    // cursor = base64url({ d: inserted_at ISO, i: post_id })
    const safeLimit = Math.min(100, Math.max(1, limit));

    let whereClause = 'WHERE fi.user_id = $1';
    const params: (string | number)[] = [userId];

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        whereClause += ` AND (fi.inserted_at < $${params.length + 1} OR (fi.inserted_at = $${params.length + 1} AND fi.post_id < $${params.length + 2}))`;
        params.push(decoded.d, decoded.i);
      } catch {
        // ignore bad cursor — start from top
      }
    }

    params.push(safeLimit + 1);
    let feedRows: Array<{ post_id: string; inserted_at: Date }> = [];
    try {
      feedRows = await this.ds.query(
        `SELECT fi.post_id, fi.inserted_at
         FROM feed_items fi
         ${whereClause}
         ORDER BY fi.inserted_at DESC, fi.post_id DESC
         LIMIT $${params.length}`,
        params,
      );
    } catch (err) {
      // feed_items table may not exist yet OR schema drift — fall back to recent global posts
      const safePosts = await this.posts
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.author', 'author')
        .where('p.is_deleted = false')
        .orderBy('p.created_at', 'DESC')
        .take(safeLimit)
        .getMany();
      return {
        items: safePosts.map((p) => this.formatPost(p, false)),
        hasMore: false,
        nextCursor: null,
      };
    }

    const hasMore = feedRows.length > safeLimit;
    const rows = hasMore ? feedRows.slice(0, safeLimit) : feedRows;
    const postIds = rows.map((r) => r.post_id);
    const nextCursor = hasMore && rows.length > 0
      ? Buffer.from(JSON.stringify({ d: rows[rows.length - 1].inserted_at, i: rows[rows.length - 1].post_id })).toString('base64url')
      : null;

    if (postIds.length === 0) return { items: [], hasMore: false, nextCursor: null };

    const posts = await this.posts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.id IN (:...ids)', { ids: postIds })
      .andWhere('p.is_deleted = false')
      .getMany();

    const byId = new Map(posts.map((p) => [p.id, p]));
    const ordered = postIds.map((id) => byId.get(id)).filter(Boolean) as typeof posts;

    let likedPostIds: string[] = [];
    try {
      likedPostIds = (
        await this.likes.find({ where: { userId, postId: In(ordered.map((p) => p.id)) } })
      ).map((l) => l.postId);
    } catch (err) {
      // post_likes table may have schema issues — non-fatal
      console.error('[feed] likes lookup failed (non-fatal):', err);
    }

    return {
      items: ordered.map((p) => this.formatPost(p, likedPostIds.includes(p.id))),
      hasMore,
      nextCursor,
    };
  }

  async getUserPosts(profileUserId: string, requesterId: string, cursor?: string, limit = 20) {
    const safeTake = Math.min(50, Math.max(1, limit));
    // Use raw SQL to avoid TypeORM metadata join issues
    const rows: Array<{
      id: string; author_id: string; caption: string | null; image_urls: any;
      likes_count: number; comments_count: number; created_at: Date;
      author_name?: string; author_username?: string; author_avatar_url?: string;
    }> = await this.ds.query(
      `SELECT
         p.id, p.author_id, p.caption, p.image_urls,
         p.likes_count, p.comments_count, p.created_at,
         u.name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url
       FROM social_posts p
       LEFT JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL
       WHERE p.author_id = $1 AND p.is_deleted = false
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $2`,
      [profileUserId, safeTake],
    );

    const items = rows.map((r) => ({
      id: r.id,
      caption: r.caption,
      text: r.caption,
      imageUrls: r.image_urls ?? [],
      photos: r.image_urls ?? [],
      likesCount: r.likes_count ?? 0,
      likeCount: r.likes_count ?? 0,
      commentsCount: r.comments_count ?? 0,
      commentCount: r.comments_count ?? 0,
      createdAt: r.created_at,
      author: r.author_id ? {
        id: r.author_id,
        name: r.author_name,
        fullName: r.author_name,
        username: r.author_username,
        avatarUrl: r.author_avatar_url,
      } : null,
      isLiked: false,
      likedByMe: false,
    }));
    return { items, nextCursor: null, hasMore: false };
  }

  async toggleLike(userId: string, postId: string) {
    const post = await this.posts.findOne({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.likes.findOne({ where: { userId, postId } });
    if (existing) {
      await this.likes.remove(existing);
      await this.posts.decrement({ id: postId }, 'likesCount', 1);
      return { liked: false };
    }
    await this.likes.save(this.likes.create({ userId, postId }));
    await this.posts.increment({ id: postId }, 'likesCount', 1);
    // Notify post author (fire-and-forget, non-blocking)
    if (post.authorId !== userId) {
      const liker = await this.users.findOne({ where: { id: userId } });
      const name = liker?.name || liker?.username || 'Someone';
      this.notifs.send(
        post.authorId,
        NotificationType.POST_LIKED,
        '❤️ New like',
        `${name} liked your post`,
        { postId, actorId: userId },
      ).catch(() => {});
    }
    return { liked: true };
  }

  async getComments(postId: string, cursor?: string, limit = 30) {
    const safeTake = Math.min(100, Math.max(1, limit));
    // Use raw SQL to avoid TypeORM metadata join issues
    const rows: Array<{
      id: string;
      content: string;
      post_id: string;
      author_id: string;
      created_at: Date;
      author_name?: string;
      author_username?: string;
      author_avatar_url?: string;
    }> = await this.ds.query(
      `SELECT
         c.id, c.content, c.post_id, c.author_id, c.created_at,
         u.name AS author_name,
         u.username AS author_username,
         u.avatar_url AS author_avatar_url
       FROM post_comments c
       LEFT JOIN users u ON u.id = c.author_id AND u.deleted_at IS NULL
       WHERE c.post_id = $1 AND c.is_deleted = false
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT $2`,
      [postId, safeTake],
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        content: r.content,
        text: r.content,
        postId: r.post_id,
        createdAt: r.created_at,
        author: r.author_id ? {
          id: r.author_id,
          name: r.author_name,
          fullName: r.author_name,
          username: r.author_username,
          avatarUrl: r.author_avatar_url,
        } : null,
      })),
      nextCursor: null,
      hasMore: false,
    };
  }

  async addComment(authorId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.posts.findOne({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Post not found');
    const text = (dto as { text?: string; content?: string }).text || dto.content || '';
    const c = await this.comments.save(this.comments.create({ authorId, postId, content: text }));
    await this.posts.increment({ id: postId }, 'commentsCount', 1);
    const full = await this.comments.findOne({ where: { id: c.id }, relations: ['author'] });
    // Notify post author (fire-and-forget)
    if (post.authorId !== authorId) {
      const commenter = await this.users.findOne({ where: { id: authorId } });
      const name = commenter?.name || commenter?.username || 'Someone';
      this.notifs.send(
        post.authorId,
        NotificationType.POST_COMMENTED,
        '💬 New comment',
        `${name} commented on your post`,
        { postId, commentId: c.id, actorId: authorId },
      ).catch(() => {});
    }
    return this.formatComment(full!);
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.posts.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException();
    if (post.authorId !== userId) throw new ForbiddenException();
    post.isDeleted = true;
    await this.posts.save(post);
  }

  async deleteComment(userId: string, commentId: string) {
    const c = await this.comments.findOne({ where: { id: commentId } });
    if (!c) throw new NotFoundException();
    if (c.authorId !== userId) throw new ForbiddenException();
    c.isDeleted = true;
    await this.comments.save(c);
    await this.posts.decrement({ id: c.postId }, 'commentsCount', 1);
  }

  // ── Direct Messages ──────────────────────────────────────────────────────
  async sendDm(senderId: string, dto: SendDmDto) {
    // Open DMs (Instagram-style) — anyone can message anyone
    if (!dto.recipientId) {
      throw new ForbiddenException('Recipient required');
    }
    if (dto.recipientId === senderId) {
      throw new ForbiddenException('Cannot send a message to yourself');
    }
    const msg = this.dms.create({ senderId, recipientId: dto.recipientId, content: dto.content });
    const saved = await this.dms.save(msg);
    if (dto.recipientId) {
      const sender = await this.users.findOne({ where: { id: senderId } });
      const name = sender?.name || sender?.username || 'Someone';
      this.notifs.send(
        dto.recipientId,
        NotificationType.NEW_DM,
        `💬 Message from ${name}`,
        (dto.content || '').slice(0, 60),
        { senderId, dmId: saved.id },
      ).catch(() => {});
    }
    return saved;
  }

  async getConversation(userId: string, otherId: string, cursor?: string, limit = 50) {
    const safeTake = Math.min(100, Math.max(1, limit));
    const qb = this.dms.createQueryBuilder('m')
      .where('(m.sender_id = :u AND m.recipient_id = :o) OR (m.sender_id = :o AND m.recipient_id = :u)', { u: userId, o: otherId })
      .orderBy('m.created_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(safeTake + 1);

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere('(m.created_at < :d OR (m.created_at = :d AND m.id < :i))', { d, i });
      } catch { /* ignore bad cursor */ }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeTake;
    const items = rows.slice(0, safeTake).reverse(); // chronological order for display
    // mark as read
    await this.dms
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('sender_id = :o AND recipient_id = :u AND read_at IS NULL', { o: otherId, u: userId })
      .execute();
    const oldest = items[0];
    const nextCursor = hasMore && oldest
      ? Buffer.from(JSON.stringify({ d: oldest.createdAt.toISOString(), i: oldest.id })).toString('base64url')
      : null;
    return { items, nextCursor, hasMore };
  }

  async getInbox(userId: string) {
    // SOC1: Limit inbox load to the 50 most-recent DMs to avoid unbounded reads.
    // Thread deduplication happens in-memory on the capped result set.
    const msgs = await this.dms
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.recipient', 'recipient')
      .where('m.sender_id = :u OR m.recipient_id = :u', { u: userId })
      .orderBy('m.created_at', 'DESC')
      .limit(50)
      .getMany();

    const threads = new Map<string, any>();
    for (const m of msgs) {
      const otherId = m.senderId === userId ? m.recipientId : m.senderId;
      if (!threads.has(otherId)) {
        const other = m.senderId === userId ? m.recipient : m.sender;
        threads.set(otherId, {
          userId: otherId,
          fullName: other.name,
          avatarUrl: other.avatarUrl,
          lastMessage: m.content,
          lastMessageAt: m.createdAt,
          unreadCount: 0,
        });
      }
    }
    // count unread
    const unread = await this.dms
      .createQueryBuilder('m')
      .select('m.sender_id', 'senderId')
      .addSelect('COUNT(*)', 'cnt')
      .where('m.recipient_id = :u AND m.read_at IS NULL', { u: userId })
      .groupBy('m.sender_id')
      .getRawMany();
    for (const u of unread) {
      const t = threads.get(u.senderId);
      if (t) t.unreadCount = Number(u.cnt);
    }
    return Array.from(threads.values());
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  private formatCommunityPost(p: Post, isLiked = false) {
    return this.formatPost(p, isLiked);
  }

  private formatPost(p: Post, isLiked = false) {
    return {
      id: p.id,
      // Provide both naming conventions so any caller works
      caption: p.caption,
      text: p.caption,
      imageUrls: p.imageUrls ?? [],
      photos: p.imageUrls ?? [],
      hashtags: p.hashtags ?? [],
      likesCount: p.likesCount ?? 0,
      likeCount: p.likesCount ?? 0,
      commentsCount: p.commentsCount ?? 0,
      commentCount: p.commentsCount ?? 0,
      sharesCount: (p as any).sharesCount ?? 0,
      isLiked,
      likedByMe: isLiked,
      createdAt: p.createdAt,
      author: p.author ? {
        id: p.author.id,
        fullName: p.author.name,
        name: p.author.name,
        username: (p.author as any).username,
        displayName: (p.author as any).displayName,
        avatarUrl: p.author.avatarUrl,
      } : null,
    };
  }

  private formatComment(c: PostComment) {
    return {
      id: c.id,
      content: c.content,
      text: c.content,
      postId: c.postId,
      createdAt: c.createdAt,
      author: c.author ? {
        id: c.author.id,
        fullName: c.author.name,
        name: c.author.name,
        username: (c.author as any).username,
        avatarUrl: c.author.avatarUrl,
      } : null,
    };
  }
  // ── Hashtag search ────────────────────────────────────────────────────────
  /**
   * SOC3: Use native Postgres array operator with GIN index instead of LIKE.
   *
   * Old: `p.hashtags LIKE '%tag%'` — full table scan, O(n) regardless of index.
   * New: `:tag = ANY(p.hashtags)` — hits the GIN index created in migration 051,
   *      O(log n) with constant-time array containment check.
   *
   * Normalise the tag (lowercase, strip #) so the index can be selective.
   */
  async getPostsByHashtag(tag: string, cursor?: string, limit = 20) {
    const safeLimit = Math.min(limit, 50);
    const normTag = tag.toLowerCase().replace(/^#/, '').trim();
    const qb = this.posts
      .createQueryBuilder('p')
      .where(':tag = ANY(p.hashtags)', { tag: normTag })
      .andWhere('p.is_deleted = false')
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC');
    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere('(p.created_at < :afterDate OR (p.created_at = :afterDate AND p.id < :afterId))', { afterDate: d, afterId: i });
      } catch { /* invalid cursor */ }
    }
    const posts = await qb.take(safeLimit + 1).getMany();
    const hasMore = posts.length > safeLimit;
    if (hasMore) posts.pop();
    const last = posts[posts.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ d: last.createdAt?.toISOString() ?? '', i: last.id })).toString('base64url')
      : null;
    return { posts, hasMore, nextCursor };
  }


  // ════════════════════════════════════════════════════════════════
  //  COMMUNITY v2 — additional methods
  // ════════════════════════════════════════════════════════════════

  /** Create a community post (text/photo/question/quote) */
  async createCommunityPost(authorId: string, dto: import('./dto/social.dto').CreateCommunityPostDto) {
    const post = this.posts.create({
      authorId,
      text: dto.text || dto.caption || null,
      caption: dto.caption || dto.text || null,
      imageUrl: dto.imageUrl || null,
      imageUrls: dto.imageUrls || [],
      postType: dto.type || 'text',
      category: dto.category || 'Experiences',
      hashtags: dto.hashtags || [],
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      isDeleted: false,
    } as Partial<Post>);
    const saved = await this.posts.save(post);

    // Fan-out to followers' feeds
    try {
      const p = await this.posts.findOne({ where: { id: saved.id }, relations: ['author'] });
      if (p) await this._fanOutPost(p.id, p.authorId, p.createdAt);
    } catch { /* non-critical */ }

    return this.formatCommunityPost(saved);
  }

  /** Increment share counter */
  async sharePost(postId: string): Promise<{ sharesCount: number }> {
    const post = await this.posts.findOne({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Post not found');
    post.sharesCount = (post.sharesCount || 0) + 1;
    await this.posts.save(post);
    return { sharesCount: post.sharesCount };
  }

  /** Toggle bookmark for a post — returns new state */
  async toggleBookmark(userId: string, postId: string): Promise<{ bookmarked: boolean }> {
    const post = await this.posts.findOne({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Post not found');
    const existing = await this.bookmarks.findOne({ where: { userId, postId } });
    if (existing) {
      await this.bookmarks.remove(existing);
      return { bookmarked: false };
    }
    await this.bookmarks.save(this.bookmarks.create({ userId, postId }));
    return { bookmarked: true };
  }

  /** Get community feed with optional category filter — keyset cursor pagination */
  async getCommunityFeed(userId: string, filter = 'all', cursor?: string, limit = 10) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));

    // cursor is base64url-encoded JSON: { d: isoDate, i: uuid }
    let afterDate: Date | undefined;
    let afterId: string | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        afterDate = new Date(decoded.d);
        afterId = decoded.i;
      } catch { /* ignore invalid cursor */ }
    }

    const qb = this.posts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.is_deleted = false')
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(safeLimit + 1);

    if (filter !== 'all') {
      const catMap: Record<string, string> = {
        spiritual: 'Spiritual Guidance',
        questions: 'Questions',
        experiences: 'Experiences',
        rituals: 'Rituals',
        festivals: 'Events',
      };
      const cat = catMap[filter.toLowerCase()];
      if (cat) qb.andWhere('p.category = :cat', { cat });
    }

    if (afterDate && afterId) {
      qb.andWhere(
        '(p.created_at < :afterDate OR (p.created_at = :afterDate AND p.id < :afterId))',
        { afterDate, afterId },
      );
    }

    const posts = await qb.getMany();
    const hasMore = posts.length > safeLimit;
    if (hasMore) posts.pop();

    // SOC2: Scope likes query to the current page's post IDs — never do a full-table scan
    const pageIds = posts.map(p => p.id);
    const likedIds = new Set(
      pageIds.length > 0
        ? (await this.likes.find({ where: { userId, postId: In(pageIds) } })).map((l) => l.postId)
        : [],
    );

    const nextCursor = hasMore && posts.length > 0
      ? Buffer.from(JSON.stringify({ d: posts[posts.length - 1].createdAt, i: posts[posts.length - 1].id })).toString('base64url')
      : null;

    return {
      items: posts.map(p => this.formatCommunityPost(p, likedIds.has(p.id))),
      nextCursor,
    };
  }

  /** Send DM directly to a userId (community v2 variant) */
  async sendDmToUser(senderId: string, recipientId: string, dto: { text?: string; imageUrl?: string }) {
    // Only friends can DM each other
    const areFriends = await this.friendships.findOne({
      where: [
        { requesterId: senderId, addresseeId: recipientId, status: 'accepted' },
        { requesterId: recipientId, addresseeId: senderId, status: 'accepted' },
      ],
    });
    if (!areFriends) {
      throw new ForbiddenException('You can only send messages to friends');
    }
    const dm = this.dms.create({
      senderId,
      recipientId,
      content: dto.text || dto.imageUrl || '',
    } as Partial<DirectMessage>);
    const saved = await this.dms.save(dm);

    // P2-5: publish to Redis so SocialGateway can push dm.message to connected clients
    this.redis.publish(
      `dm:${recipientId}`,
      JSON.stringify({
        id: saved.id,
        senderId,
        recipientId,
        text: dto.text,
        imageUrl: dto.imageUrl,
        createdAt: new Date().toISOString(),
      }),
    ).catch(() => {});

    // Notify recipient (fire-and-forget)
    const sender = await this.users.findOne({ where: { id: senderId } });
    const name = sender?.name || sender?.username || 'Someone';
    const preview = dto.text ? dto.text.slice(0, 60) : '📷 Photo';
    this.notifs.send(
      recipientId,
      NotificationType.NEW_DM,
      `💬 Message from ${name}`,
      preview,
      { senderId, dmId: saved.id },
    ).catch(() => {});
    return saved;
  }

  /** Get DM inbox in community v2 format */
  async getCommunityInbox(userId: string) {
    const convos = await this.getInbox(userId);
    // Batch-load all conversation partners in a single query (no N+1)
    const otherUserIds = convos.map((c) => c.userId as string).filter(Boolean);
    const userList = otherUserIds.length > 0
      ? await this.users.findBy({ id: In(otherUserIds) })
      : [];
    const userMap = new Map(userList.map(u => [u.id, u]));
    const enriched = convos.map((c) => {
      const u = userMap.get(c.userId);
      return {
        userId: c.userId,
        profile: u ? {
          userId: u.id,
          username: u.username || u.id,
          displayName: u.displayName || u.name,
          bio: u.bio || '',
          avatarUrl: u.avatarUrl,
          accountType: u.accountType || 'user',
          isVerified: u.isVerified || false,
        } : null,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount || 0,
      };
    });
    return { items: enriched };
  }

  /** Get DM conversation in community v2 format */
  async getCommunityConversation(userId: string, otherId: string, cursor?: string, limit = 50) {
    return this.getConversation(userId, otherId, cursor, limit);
  }


  /**
   * P2 (v6): trigram-based community user search.
   *
   * Replaces `LIKE '%term%'` (full table scan, 2s at 1M users) with a
   * pg_trgm similarity ranking. Requires migration
   * 1700000000043-PgTrgmSearchIndex.ts (creates the gin_trgm_ops indexes).
   *
   * Usage from community.controller.ts:
   *   const results = await this.social.searchUsersByTrigram(q, me.id, 20);
   */
  async searchUsersByTrigram(query: string, excludeUserId: string, limit = 20): Promise<Array<{
    id: string; username: string | null; displayName: string | null; name: string | null;
    avatarUrl: string | null; bio: string | null; rank: number;
  }>> {
    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 2) return [];
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const rows = await this.ds.query<Array<{
      id: string; username: string | null; display_name: string | null; name: string | null;
      avatar_url: string | null; bio: string | null; rank: string;
    }>>(
      `SELECT id, username, display_name, name, avatar_url, bio,
              GREATEST(
                COALESCE(similarity(LOWER(username), $1), 0),
                COALESCE(similarity(LOWER(display_name), $1), 0),
                COALESCE(similarity(LOWER(name), $1), 0)
              ) AS rank
         FROM users
        WHERE id <> $2
          AND (username IS NOT NULL OR display_name IS NOT NULL)
          AND deleted_at IS NULL
          AND (
            LOWER(username)     % $1 OR
            LOWER(display_name) % $1 OR
            LOWER(name)         % $1
          )
        ORDER BY rank DESC
        LIMIT $3`,
      [q, excludeUserId, safeLimit],
    );
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      name: r.name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      rank: Number(r.rank),
    }));
  }
}
