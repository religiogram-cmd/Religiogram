import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { FollowEntity, FolloweeType } from './entities/follow.entity';

class FollowDto {
  followeeType!: FolloweeType;
  followeeId!: string;
}

/**
 * Follow endpoints.
 *
 * POST   /follows                 — follow a provider or temple
 * DELETE /follows/:id             — unfollow
 * GET    /me/following            — list everything the caller follows
 * GET    /follows/count/:type/:id — follower count for a provider or temple
 */
@Controller({ version: '1' })
export class FollowsController {
  constructor(
    @InjectRepository(FollowEntity)
    private readonly follows: Repository<FollowEntity>,
  ) {}

  private uid(req: Request): string {
    const u: any = req.user;
    if (!u?.sub) throw new UnauthorizedException('Missing auth context');
    return String(u.sub);
  }

  /** POST /follows */
  @Post('follows')
  async follow(@Req() req: Request, @Body() dto: FollowDto) {
    const followerId = this.uid(req);
    // Upsert — silently succeed if already following
    const existing = await this.follows.findOne({
      where: { followerId, followeeType: dto.followeeType, followeeId: dto.followeeId },
    });
    if (existing) return existing;

    const f = this.follows.create({
      followerId,
      followeeType: dto.followeeType,
      followeeId:   dto.followeeId,
    });
    return this.follows.save(f);
  }

  /** DELETE /follows/:id */
  @Delete('follows/:id')
  async unfollow(@Req() req: Request, @Param('id') id: string) {
    const followerId = this.uid(req);
    const f = await this.follows.findOne({ where: { id, followerId } });
    if (!f) throw new NotFoundException('Follow not found');
    await this.follows.remove(f);
    return { success: true };
  }

  /** GET /me/following */
  @Get('me/following')
  async myFollowing(@Req() req: Request) {
    const followerId = this.uid(req);
    const items = await this.follows.find({
      where: { followerId },
      order: { createdAt: 'DESC' },
    });
    return { items };
  }

  /** GET /follows/count/:type/:id — public follower count */
  @Get('follows/count/:type/:id')
  async followerCount(
    @Param('type') type: FolloweeType,
    @Param('id')   id: string,
  ) {
    const count = await this.follows.count({
      where: { followeeType: type, followeeId: id },
    });
    return { count };
  }
}
