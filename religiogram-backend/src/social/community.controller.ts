import {
  Body, Controller, UseGuards, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, Req,
  DefaultValuePipe, ParseIntPipe,
  NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialService } from './social.service';
import { StoryService, CreateStoryDto } from './story.service';
import { FeedService } from './feed.service';
import { CreateCommunityPostDto, CreateCommentDto, SendDmDto } from './dto/social.dto';
import { UpdateCommunityProfileDto } from './dto/update-community-profile.dto';  // P1-11 (v5)
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { Friendship } from './entities/friendship.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * v6 (recovery): community.controller.ts was truncated in v3.
 * Reconstructed from the audit's visible route surface (lines 1-150 of v3) and
 * faithfully extended for the remaining routes inferred from the service API.
 */

class SetupCommunityDto {
  @IsString() @MaxLength(30)
  username!: string;
  @IsOptional() @IsString() @MaxLength(60)
  displayName?: string;
  @IsOptional() @IsString() @MaxLength(160)
  bio?: string;
  @IsOptional() @IsString()
  avatarUrl?: string;
  @IsOptional() @IsString()
  accountType?: string;
}

@ApiTags('community')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'community', version: '1' })
export class CommunityController {
  constructor(
    private readonly social: SocialService,
    private readonly stories: StoryService,
    private readonly feed: FeedService,
    private readonly notifications: NotificationsService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Friendship) private readonly friendships: Repository<Friendship>,
  ) {}

  private uid(req: Request): string {
    return (req as { user?: { id?: string } }).user?.id ?? '';
  }

  private toProfile(u: User, extra?: { followersCount?: number; followingCount?: number }) {
    return {
      userId: u.id,
      username: u.username,
      displayName: u.displayName || u.name,
      bio: u.bio || '',
      avatarUrl: u.avatarUrl,
      accountType: u.accountType || 'user',
      isVerified: u.isVerified || false,
      followersCount: extra?.followersCount ?? 0,
      followingCount: extra?.followingCount ?? 0,
    };
  }

  @Get('username/check/:username')
  async checkUsername(@Param('username') raw: string) {
    const username = raw.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (username.length < 3 || username.length > 30) return { available: false, suggestions: [] };
    const existing = await this.users.findOne({ where: { username } });
    if (!existing) return { available: true, suggestions: [] };
    const suggestions: string[] = [];
    for (let i = 1; i <= 9 && suggestions.length < 3; i++) {
      const c = `${username}${i}`;
      const taken = await this.users.findOne({ where: { username: c } });
      if (!taken) suggestions.push(c);
    }
    if (suggestions.length < 3) suggestions.push(`${username}_${Date.now().toString().slice(-4)}`);
    return { available: false, suggestions };
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  async setupCommunity(@Body() dto: SetupCommunityDto, @Req() req: Request) {
    const userId = this.uid(req);
    const username = dto.username?.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (!username || username.length < 3) throw new BadRequestException('Username must be at least 3 characters');
    const existing = await this.users.findOne({ where: { username } });
    if (existing && existing.id !== userId) throw new BadRequestException('Username already taken');
    const validTypes = ['user', 'priest', 'temple'];
    const accountType = validTypes.includes(dto.accountType ?? '') ? dto.accountType! : 'user';
    // Mirror displayName into name (the legacy Settings field) so admin
    // panel + Settings + Community all show the same identity. Without
    // this mirror, users who onboard via Community first have blank
    // "Full name" in Settings and admin.
    const patch: Partial<User> = {
      username,
      accountType,
      profileComplete: true,
    } as Partial<User>;
    if (dto.displayName !== undefined) {
      patch.displayName = dto.displayName || undefined;
      patch.name = dto.displayName || undefined;
    }
    if (dto.bio !== undefined) patch.bio = dto.bio || undefined;
    if (dto.avatarUrl !== undefined) patch.avatarUrl = dto.avatarUrl || undefined;
    await this.users.update(userId, patch);
    const updated = await this.users.findOneOrFail({ where: { id: userId } });
    return this.toProfile(updated);
  }

  @Get('me')
  async getMyProfile(@Req() req: Request) {
    const u = await this.users.findOne({ where: { id: this.uid(req) } });
    if (!u) throw new NotFoundException('User not found');
    if (!u.username) throw new NotFoundException('Community profile not set up');
    return this.toProfile(u);
  }

  /** P1-11 (v5): strict validators on profile updates.
   *
   * Sync fix: any change to `displayName` is also mirrored to `name`, and
   * `avatarUrl` is single-sourced anyway. This keeps Community, Settings,
   * and the admin panel showing one consistent identity instead of two
   * fields that silently drift because different UIs edit different columns.
   */
  @Patch('me')
  async updateMyProfile(@Body() dto: UpdateCommunityProfileDto, @Req() req: Request) {
    const updates: Partial<User> = {};
    if (dto.displayName !== undefined) {
      updates.displayName = dto.displayName;
      updates.name = dto.displayName;
    }
    if (dto.bio !== undefined) updates.bio = dto.bio;
    if (dto.avatarUrl !== undefined) updates.avatarUrl = dto.avatarUrl;
    await this.users.update(this.uid(req), updates);
    const u = await this.users.findOneOrFail({ where: { id: this.uid(req) } });
    return this.toProfile(u);
  }

  /** P2 (v6): trigram-backed search instead of LIKE '%term%' full-scan. */
  @Get('users/search')
  async searchCommunityUsers(@Query('q') q: string, @Req() req: Request) {
    if (!q?.trim()) return { items: [] };
    const items = await this.social.searchUsers(q, this.uid(req));
    return { items };
  }

  // ─── Posts ────────────────────────────────────────────────────────────────
  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createPost(@Body() dto: CreateCommunityPostDto, @Req() req: Request) {
    return this.social.createPost(this.uid(req), dto);
  }

  @Get('feed')
  async getFeed(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.feed.getTimeline(this.uid(req), cursor, limit);
  }

  @Post('posts/:postId/like')
  @HttpCode(HttpStatus.OK)
  async likePost(@Param('postId') postId: string, @Req() req: Request) {
    return this.social.toggleLike(this.uid(req), postId, true);
  }

  @Delete('posts/:postId/like')
  @HttpCode(HttpStatus.OK)
  async unlikePost(@Param('postId') postId: string, @Req() req: Request) {
    return this.social.toggleLike(this.uid(req), postId, false);
  }

  @Post('posts/:postId/comments')
  @HttpCode(HttpStatus.CREATED)
  async commentPost(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ) {
    return this.social.addComment(this.uid(req), postId, dto);
  }

  // ─── Stories ─────────────────────────────────────────────────────────────
  @Post('stories')
  @HttpCode(HttpStatus.CREATED)
  async createStory(@Body() dto: CreateStoryDto, @Req() req: Request) {
    return this.stories.createStory(this.uid(req), dto);
  }

  @Get('stories')
  async listStories(@Req() req: Request) {
    const userId = this.uid(req);
    const friendIds = await this.social.getFriendIds(userId);
    return this.stories.getFriendsStories(userId, friendIds);
  }

  // ─── DMs ─────────────────────────────────────────────────────────────────
  @Post('dms')
  @HttpCode(HttpStatus.CREATED)
  async sendDm(@Body() dto: SendDmDto, @Req() req: Request) {
    return this.social.sendDm(this.uid(req), dto);
  }

  // ─── Friendship ───────────────────────────────────────────────────────────
  @Post('friends/:targetId/request')
  @HttpCode(HttpStatus.CREATED)
  async requestFriend(@Param('targetId') targetId: string, @Req() req: Request) {
    const me = this.uid(req);
    if (me === targetId) throw new ForbiddenException('Cannot friend yourself');
    return this.social.sendFriendRequest(me, targetId);
  }

  @Post('friends/:requesterId/accept')
  @HttpCode(HttpStatus.OK)
  async acceptFriend(@Param('requesterId') requesterId: string, @Req() req: Request) {
    return this.social.respondToRequest(this.uid(req), requesterId, true);
  }

  @Delete('friends/:otherId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfriend(@Param('otherId') otherId: string, @Req() req: Request) {
    await this.social.removeFriend(this.uid(req), otherId);
  }
}
