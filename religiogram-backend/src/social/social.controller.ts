import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  Req, HttpCode, HttpStatus, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { Request } from 'express';
import { SocialService } from './social.service';
import { CreatePostDto, CreateCommentDto, SendDmDto, FriendRequestDto } from './dto/social.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('social')
@ApiBearerAuth()
@Controller({ path: 'social', version: '1' })
export class SocialController {
  constructor(private readonly svc: SocialService) {}

  private uid(req: Request): string { return (req as any).user?.id ?? ''; }

  // ── Users ──────────────────────────────────────────────────────────────
  @Get('users/search')
  searchUsers(@Query('q') q: string, @Req() req: Request) {
    return this.svc.searchUsers(q ?? '', this.uid(req));
  }

  // ── Friends ────────────────────────────────────────────────────────────
  @Get('friends')
  getFriends(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) { return this.svc.getFriends(this.uid(req), cursor, limit); }

  @Get('friends/requests/pending')
  getPending(@Req() req: Request) { return this.svc.getPendingRequests(this.uid(req)); }

  @Get('friends/requests/sent')
  getSent(@Req() req: Request) { return this.svc.getSentRequests(this.uid(req)); }

  @Post('friends/request')
  @HttpCode(HttpStatus.CREATED)
  sendRequest(@Body() dto: FriendRequestDto, @Req() req: Request) {
    return this.svc.sendFriendRequest(this.uid(req), dto.userId ?? '');
  }

  @Patch('friends/request/:id/accept')
  acceptRequest(@Param('id') id: string, @Req() req: Request) {
    return this.svc.respondToRequest(this.uid(req), id, true);
  }

  @Patch('friends/request/:id/reject')
  rejectRequest(@Param('id') id: string, @Req() req: Request) {
    return this.svc.respondToRequest(this.uid(req), id, false);
  }

  @Delete('friends/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFriend(@Param('id') id: string, @Req() req: Request) {
    return this.svc.removeFriend(this.uid(req), id);
  }

  // ── Posts ──────────────────────────────────────────────────────────────
  @Get('feed')
  getFeed(
    @Req() req: Request,
    @Query('cursor') cursor: string | undefined,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.svc.getFeed(this.uid(req), cursor, limit); }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  createPost(@Body() dto: CreatePostDto, @Req() req: Request) {
    return this.svc.createPost(this.uid(req), dto);
  }

  @Get('posts/user/:userId')
  getUserPosts(
    @Param('userId') userId: string,
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) { return this.svc.getUserPosts(userId, this.uid(req), cursor, limit); }

  @Post('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  toggleLike(@Param('id') id: string, @Req() req: Request) {
    return this.svc.toggleLike(this.uid(req), id);
  }

  @Get('posts/:id/comments')
  getComments(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) { return this.svc.getComments(id, cursor, limit); }

  @Post('posts/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @Req() req: Request) {
    return this.svc.addComment(this.uid(req), id, dto);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(@Param('id') id: string, @Req() req: Request) {
    return this.svc.deletePost(this.uid(req), id);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(@Param('id') id: string, @Req() req: Request) {
    return this.svc.deleteComment(this.uid(req), id);
  }

  // ── DMs ────────────────────────────────────────────────────────────────
  @Get('messages')
  getInbox(@Req() req: Request) { return this.svc.getInbox(this.uid(req)); }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  sendDm(@Body() dto: SendDmDto, @Req() req: Request) {
    return this.svc.sendDm(this.uid(req), dto);
  }

  @Get('messages/:userId')
  getConversation(
    @Param('userId') userId: string,
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) { return this.svc.getConversation(this.uid(req), userId, cursor, limit); }
}
