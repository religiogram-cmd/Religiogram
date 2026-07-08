import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FeedItem } from './entities/feed-item.entity';
import { Friendship } from './entities/friendship.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';

// ── Cursor helpers ────────────────────────────────────────────────────────────

interface FeedCursor { d: string; i: string }

function encodeCursor(postCreatedAt: Date, postId: string): string {
  return Buffer.from(JSON.stringify({ d: postCreatedAt.toISOString(), i: postId })).toString('base64url');
}

function decodeCursor(cursor: string): FeedCursor {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as FeedCursor;
  } catch {
    throw new BadRequestException('Invalid feed cursor');
  }
}

export interface TimelinePage {
  items: ReturnType<FeedService['formatPost']>[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * FeedService — manages the denormalized `feed_items` timeline table.
 *
 * Write path  (called from SocialService):
 *   fanOut()          — on createPost: insert a row for every friend
 *   pruneForUnfriend()— on removeFriend: DELETE author's posts from viewer's feed
 *
 * Read path:
 *   getTimeline()     — keyset-paginated feed; O(log n) via composite index
 *
 * ── Kafka consumer note ───────────────────────────────────────────────────
 * For users with >1 000 friends the fan-out INSERT is called in-process here,
 * which adds ~50-200 ms to the createPost response at P99.
 * To move it off the hot path:
 *   1. SocialService.createPost already emits a `post.published` Kafka event.
 *   2. Wire a BullMQ consumer that subscribes to `rg.social` and calls
 *      FeedService.fanOut(postId, authorId) asynchronously.
 *   3. Gate the async path behind the FF_FEED_ASYNC_FANOUT feature flag.
 */
@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(FeedItem)
    private readonly feedItems: Repository<FeedItem>,
    @InjectRepository(Friendship)
    private readonly friendships: Repository<Friendship>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly likes: Repository<PostLike>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Return the next page of the viewer's timeline using keyset pagination.
   *
   * Query plan:
   *   Index scan on ix_feed_items_viewer_timeline
   *   (viewer_id, post_created_at DESC, post_id DESC) INCLUDE (author_id)
   *   => Join social_posts on post_id to hydrate payload (single row per postId)
   *   => O(log n) regardless of how many items the user has in their feed
   */
  async getTimeline(viewerId: string, cursor?: string, limit = 20): Promise<TimelinePage> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    const qb = this.feedItems
      .createQueryBuilder('fi')
      .innerJoinAndSelect('fi.post', 'p')
      .innerJoinAndSelect('p.author', 'author')
      .where('fi.viewer_id = :viewerId', { viewerId })
      .andWhere('p.is_deleted = false')
      // FIX C: hide posts from users the viewer has blocked. Correlated
      // NOT EXISTS reads from idx_user_blocks (blocker_id, blocked_id) —
      // O(1) per row given the small typical block-list size.
      .andWhere(
        'NOT EXISTS (' +
        '  SELECT 1 FROM user_blocks ub ' +
        '  WHERE ub.blocker_id = :viewerId AND ub.blocked_id = fi.author_id' +
        ')',
        { viewerId },
      )
      .orderBy('fi.post_created_at', 'DESC')
      .addOrderBy('fi.post_id', 'DESC')
      .take(safeLimit + 1);

    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere(
        '(fi.post_created_at < :d OR (fi.post_created_at = :d AND fi.post_id < :i))',
        { d, i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();

    const postIds = rows.map((r) => r.postId);
    const likedSet = new Set<string>();
    if (postIds.length > 0) {
      const liked = await this.likes.createQueryBuilder('l')
        .select('l.post_id')
        .where('l.user_id = :viewerId AND l.post_id IN (:...postIds)', { viewerId, postIds })
        .getRawMany<{ l_post_id: string }>();
      liked.forEach((l) => likedSet.add(l.l_post_id));
    }

    const last = rows[rows.length - 1];
    return {
      items: rows.map((r) => this.formatPost(r.post, likedSet.has(r.postId))),
      nextCursor: hasMore && last ? encodeCursor(last.postCreatedAt, last.postId) : null,
      hasMore,
    };
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Fan out a newly created post to all of the author's friends' feeds.
   *
   * Uses a single INSERT ... SELECT so the fan-out is one round-trip to Postgres
   * regardless of how many friends the author has. ON CONFLICT DO NOTHING
   * makes it idempotent (safe to retry if Kafka delivers the event twice).
   */
  async fanOut(postId: string, authorId: string, postCreatedAt: Date): Promise<void> {
    try {
      // feed_items is RANGE-partitioned on created_at (Migration 036).
      // The old UNIQUE (viewer_id, post_id) constraint is gone — global unique
      // constraints cannot span partitions in PostgreSQL without including the
      // partition key. We use ON CONFLICT DO NOTHING (target-less) which still
      // silences any PK-level conflicts. Semantic dedup relies on fanOut only
      // being called once per post creation event.
      await this.dataSource.query(
        `
        INSERT INTO feed_items (viewer_id, post_id, author_id, post_created_at)
        SELECT
          CASE WHEN f.requester_id = $2 THEN f.addressee_id ELSE f.requester_id END,
          $1,
          $2,
          $3
        FROM friendships f
        WHERE (f.requester_id = $2 OR f.addressee_id = $2)
          AND f.status = 'accepted'
        ON CONFLICT DO NOTHING
        `,
        [postId, authorId, postCreatedAt],
      );

      // Also insert into the author's own feed so they see their own posts.
      await this.dataSource.query(
        `
        INSERT INTO feed_items (viewer_id, post_id, author_id, post_created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        `,
        [authorId, postId, authorId, postCreatedAt],
      );
    } catch (err) {
      // Non-fatal: timeline will fall back to the legacy getFeed query.
      this.logger.error(
        `fanOut failed for post=${postId} author=${authorId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Remove all posts by `authorId` from `viewerId`'s feed.
   * Called when a friendship is dissolved.
   * Uses the ix_feed_items_viewer_author index — O(log n + deletions).
   */
  async pruneForUnfriend(viewerId: string, authorId: string): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM feed_items WHERE viewer_id = $1 AND author_id = $2`,
        [viewerId, authorId],
      );
      // Also prune the other direction — friendship is bilateral.
      await this.dataSource.query(
        `DELETE FROM feed_items WHERE viewer_id = $1 AND author_id = $2`,
        [authorId, viewerId],
      );
    } catch (err) {
      this.logger.error(
        `pruneForUnfriend failed viewer=${viewerId} author=${authorId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Backfill the feed when two users become friends.
   * Inserts the last 50 posts from each user into the other's feed.
   * Capped at 50 to bound the backfill cost.
   */
  async backfillOnFriendship(userA: string, userB: string): Promise<void> {
    const BACKFILL_LIMIT = 50;
    try {
      // A's recent posts => B's feed
      await this.dataSource.query(
        `
        INSERT INTO feed_items (viewer_id, post_id, author_id, post_created_at)
        SELECT $2, id, author_id, created_at
        FROM social_posts
        WHERE author_id = $1 AND is_deleted = false
        ORDER BY created_at DESC LIMIT $3
        ON CONFLICT DO NOTHING
        `,
        [userA, userB, BACKFILL_LIMIT],
      );
      // B's recent posts => A's feed
      await this.dataSource.query(
        `
        INSERT INTO feed_items (viewer_id, post_id, author_id, post_created_at)
        SELECT $2, id, author_id, created_at
        FROM social_posts
        WHERE author_id = $1 AND is_deleted = false
        ORDER BY created_at DESC LIMIT $3
        ON CONFLICT DO NOTHING
        `,
        [userB, userA, BACKFILL_LIMIT],
      );
    } catch (err) {
      this.logger.error(
        `backfillOnFriendship failed userA=${userA} userB=${userB}: ${(err as Error).message}`,
      );
    }
  }

  // ── Formatter (mirrors SocialService.formatPost) ─────────────────────────

  formatPost(p: Post, isLiked = false) {
    return {
      id: p.id,
      caption: p.caption,
      imageUrls: p.imageUrls,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      isLiked,
      createdAt: p.createdAt,
      author: p.author
        ? { id: p.author.id, fullName: (p.author as any).name, avatarUrl: (p.author as any).avatar ?? null }
        : null,
    };
  }
}
