import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from './entities/friendship.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostBookmark } from './entities/post-bookmark.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { FollowEntity } from './entities/follow.entity';
import { Story } from './entities/story.entity';
import { FeedItem } from './entities/feed-item.entity';
import { UserReport } from './entities/user-report.entity';
import { UserBlock } from './entities/user-block.entity';
import { User } from '../users/entities/user.entity';
import { SocialService } from './social.service';
import { StoryService } from './story.service';
import { FeedService } from './feed.service';
import { FanOutProcessor } from './processors/fan-out.processor';
import { StoryExpiryProcessor } from './processors/story-expiry.processor';
import { StoryExpiryScheduler } from './story-expiry.scheduler';
import { SocialController } from './social.controller';
import { FollowsController } from './follows.controller';
import { CommunityController } from './community.controller';
import { ModerationController } from './moderation.controller';
import { SocialGateway } from './social.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { QUEUE } from '../common/queues/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Friendship,
      Post,
      PostLike,
      PostComment,
      PostBookmark,
      DirectMessage,
      FollowEntity,
      Story,
      FeedItem,
      UserReport,
      UserBlock,
      User,
    ]),
    // Register the feed-fanout queue so SocialService can enqueue jobs
    // and FanOutProcessor can consume them.
    BullModule.registerQueue({ name: QUEUE.FEED_FANOUT }),
    BullModule.registerQueue({ name: QUEUE.STORY_EXPIRY }),
    // NotificationsService is used by CommunityController for /community/notifications/*
    NotificationsModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    SocialService, StoryService, FeedService, FanOutProcessor, StoryExpiryProcessor, StoryExpiryScheduler, SocialGateway],
  controllers: [SocialController, FollowsController, CommunityController, ModerationController],
  exports: [SocialService, StoryService, FeedService],
})
export class SocialModule {}

