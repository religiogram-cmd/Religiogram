import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AstrologyService, ZODIAC_DATA } from './astrology.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { KundliDto } from './dto/kundli.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller({ path: 'astrology', version: '1' })
export class AstrologyController {
  constructor(private readonly astrologyService: AstrologyService) {}

  /**
   * POST /astrology/ai
   * Rule-based AstroAI chat — no external API key required.
   */
  @Post('ai')
  @Public()
  @HttpCode(HttpStatus.OK)
  aiChat(@Body() dto: AiChatDto) {
    return this.astrologyService.processAiMessage(dto);
  }

  /**
   * POST /astrology/kundli
   * Calculate birth chart (Kundli). Requires authentication.
   */
  @Post('kundli')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  calculateKundli(
    @Body() dto: KundliDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    return this.astrologyService.calculateKundli(dto);
  }

  /**
   * GET /astrology/horoscope/:sign
   * Daily horoscope for a given zodiac sign.
   */
  @Get('horoscope/:sign')
  @Public()
  getDailyHoroscope(@Param('sign') sign: string) {
    const result = this.astrologyService.getDailyHoroscope(sign.toLowerCase());
    if (!result) {
      throw new NotFoundException(
        `Unknown zodiac sign "${sign}". Valid signs: ${ZODIAC_DATA.map((z) => z.name).join(', ')}`,
      );
    }
    return result;
  }

  /**
   * GET /astrology/signs
   * Return all 12 zodiac signs with static metadata.
   */
  @Get('signs')
  @Public()
  getAllSigns() {
    return this.astrologyService.getAllSigns();
  }
}
