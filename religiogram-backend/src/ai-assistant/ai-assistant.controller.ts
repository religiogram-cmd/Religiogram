import {
  Controller, Post, Get, Delete, Body, Req, Res, UseGuards,
  Param, ParseUUIDPipe, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { PanchangService } from './astrology/panchang.service';
import { HoroscopeService } from './astrology/horoscope.service';
import { KundliService } from './astrology/kundli.service';
import { CompatibilityService } from './astrology/compatibility.service';
import type { Response } from 'express';
import { AiSubscriptionService } from './ai-subscription.service';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';

const NAKSHATRA_NAMES = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
  'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
  'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha',
  'Purva Bhadrapada','Uttara Bhadrapada','Revati',
];

@ApiTags('ai-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'ai', version: '1' })
export class AiAssistantController {
  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly panchang: PanchangService,
    private readonly horoscope: HoroscopeService,
    private readonly kundli: KundliService,
    private readonly compat: CompatibilityService,
    private readonly subscription: AiSubscriptionService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RG AI chat - SSE streaming response' })
  async chat(
    @Req() req: any,
    @Res() res: Response,
    @Body() body: {
      message:         string;
      conversationId?: string;
      religion?:       string;
      language?:       string;
      locale?:         string;
      inputType?:      'text' | 'voice' | 'image';
      audioBase64?:    string;
      audioMimeType?:  string;
      imageBase64?:    string;
      imageMimeType?:  string;
    },
  ) {
    const userId: string = req.user.sub ?? req.user.userId;

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: string, data: Record<string, any>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify({ event, ...data })}\n\n`);
    };

    try {
      const stream = this.orchestrator.streamResponse({
        userId,
        message:        body.message,
        conversationId: body.conversationId,
        religion:       body.religion,
        language:       body.language ?? body.locale ?? 'en',
        audioBase64:    body.audioBase64,
        audioMimeType:  body.audioMimeType,
        imageBase64:    body.imageBase64,
        imageMimeType:  body.imageMimeType,
      });

      for await (const chunk of stream) {
        switch (chunk.event) {
          case 'token':          write('token',           { token: chunk.token }); break;
          case 'tool_call':      write('tool_call',       { tool: chunk.toolName, args: chunk.toolArgs }); break;
          case 'tool_result':    write('tool_result',     { tool: chunk.toolName, result: chunk.result }); break;
          case 'conversation_id':write('conversation_id', { conversationId: chunk.conversationId }); break;
          case 'quota':          write('quota',           { used: chunk.used, limit: chunk.limit }); break;
          case 'done':           write('done',            {}); break;
          case 'error':          write('error',           { message: chunk.message }); break;
        }
      }
    } catch (err: any) {
      write('error', { message: err?.message ?? 'Internal error' });
    } finally {
      res.end();
    }
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List user AI conversations' })
  async listConversations(@Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.listConversations(userId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  async getConversation(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.getConversation(userId, id);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation (DPDP right to erasure)' })
  async deleteConversation(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.deleteConversation(userId, id);
  }

  @Post('birth-profile')
  @ApiOperation({ summary: 'Save user birth profile for kundli calculations' })
  async saveBirthProfile(
    @Req() req: any,
    @Body() body: {
      label?:     string;
      fullName:   string;
      birthDate:  string;
      birthTime?: string;
      birthCity:  string;
      placeLat?:  number;
      placeLon?:  number;
      isSelf?:    boolean;
    },
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.saveBirthProfile(userId, body);
  }

  @Get('birth-profile')
  @ApiOperation({ summary: 'Get user birth profile' })
  async getBirthProfile(@Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.getBirthProfile(userId);
  }

  @Post('kundli/generate')
  @CacheControl('private, max-age=86400')
  @ApiOperation({ summary: 'Generate kundli (birth chart) for a profile' })
  async generateKundli(
    @Req() req: any,
    @Body() body: { profileId?: string },
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    const result = await this.kundli.getKundliForUser(body.profileId ?? userId);
    if (!result) {
      return { error: 'no_birth_profile', message: 'Please save your birth profile first.' };
    }
    return { kundli: result.kundli, profile: result.profile };
  }

  @Post('kundli/compatibility')
  @ApiOperation({ summary: 'Guna Milan compatibility between two birth charts' })
  async compatibility(
    @Body() body: {
      boyNakshatra?:  string;
      girlNakshatra?: string;
      profileAId?:    string;
      profileBId?:    string;
    },
  ) {
    let boyIdx  = body.boyNakshatra  ? NAKSHATRA_NAMES.indexOf(body.boyNakshatra)  : -1;
    let girlIdx = body.girlNakshatra ? NAKSHATRA_NAMES.indexOf(body.girlNakshatra) : -1;

    if ((boyIdx < 0 || girlIdx < 0) && body.profileAId && body.profileBId) {
      const a = await this.kundli.getKundliForUser(body.profileAId);
      const b = await this.kundli.getKundliForUser(body.profileBId);
      if (!a || !b) return { error: 'profile_not_found' };
      const moonA = (a.kundli as any)?.planets?.find((p: any) => p?.planet === 'Moon');
      const moonB = (b.kundli as any)?.planets?.find((p: any) => p?.planet === 'Moon');
      if (moonA) boyIdx  = Math.floor(moonA.longitude / (360 / 27)) % 27;
      if (moonB) girlIdx = Math.floor(moonB.longitude / (360 / 27)) % 27;
    }

    if (boyIdx < 0 || girlIdx < 0) {
      return { error: 'nakshatra_not_found', message: 'Could not determine nakshatra. Please provide nakshatra names or valid profile IDs.' };
    }

    const gunaMilan = this.compat.calculateGunaScore(boyIdx, girlIdx);
    return { gunaMilan };
  }

  @Get('horoscope/today/:sign')
  @CacheControl('public, max-age=86400, stale-while-revalidate=3600')
  @ApiOperation({ summary: "Today's daily horoscope for a zodiac sign (cached)" })
  async getHoroscopeBySign(
    @Param('sign') sign: string,
    @Query('language') language = 'en',
  ) {
    const result = await this.horoscope.getDailyHoroscope(sign, language);
    return { sign, date: new Date().toISOString().slice(0, 10), language, ...result };
  }

  @Get('panchang/today')
  @ApiOperation({ summary: "Today's Vedic panchang (cached)" })
  async getPanchang(@Query('city') city = 'Delhi') {
    return this.panchang.getTodayPanchang(city);
  }

  @Get('usage')
  @ApiOperation({ summary: "Today's AI usage quota + premium status" })
  async getUsage(@Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.getQuota(userId);
  }

  @Get('quota')
  @ApiOperation({ summary: '[Deprecated] Use /ai/usage instead' })
  async getQuota(@Req() req: any) {
    return this.getUsage(req);
  }

  @Post('premium/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Razorpay subscription for RG AI Premium (Rs.49/month)' })
  async subscribePremium(@Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.subscription.createSubscription(userId);
  }
  @Post('messages/:messageId/flag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag an AI response for review (§10.4)' })
  async flagMessage(
    @Req() req: any,
    @Param('messageId') messageId: string,
    @Body() body: { reason?: string },
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.orchestrator.flagMessage(userId, messageId, body.reason ?? 'user_report');
  }


}
