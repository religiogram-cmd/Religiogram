import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ProviderOnboardingService } from './service-providers.service';
import {
  PreSignKycUploadDto,
  SaveDraftDto,
  Step1BasicDetailsDto,
  Step2ProfessionalInfoDto,
  Step3ReligionDto,
  Step4SelectedServicesDto,
  Step5PricingDto,
  Step6AvailabilityDto,
  Step7SubmitKycDto,
} from './dto/onboarding.dto';

/**
 * Service Provider onboarding controller.
 *
 * All endpoints require auth (JwtAuthGuard is global). The caller's
 * userId + phone come from the JWT payload (`req.user`) — never from the
 * request body. That's what lets us enforce "phone on Step 1 matches your
 * logged-in number" without a second round-trip.
 *
 * Route map:
 *   POST   /provider/register         — Step 1
 *   PATCH  /provider/professional     — Step 2
 *   PATCH  /provider/religion         — Step 3
 *   POST   /provider/services         — Step 4
 *   POST   /provider/pricing          — Step 5
 *   POST   /provider/availability     — Step 6
 *   POST   /provider/kyc/presign      — Step 7 pre-signed upload URL
 *   POST   /provider/kyc              — Step 7 finalize
 *
 *   GET    /provider/draft            — resume state
 *   PATCH  /provider/draft            — autosave (merge)
 */
@Controller({ path: 'provider', version: '1' })
export class ProvidersController {
  constructor(private readonly onboarding: ProviderOnboardingService) {}

  /* Extract the caller fields that the service needs, without leaking
   * the full JWT payload into service methods. */
  private who(req: Request): { userId: string; phone: string } {
    const u: any = req.user;
    if (!u?.sub) throw new UnauthorizedException('Missing auth context');
    return { userId: String(u.sub), phone: String(u.phone ?? '') };
  }

  /* ───── Step 1 ───── */
  @Post('register')
  registerStep1(@Req() req: Request, @Body() dto: Step1BasicDetailsDto) {
    const { userId, phone } = this.who(req);
    return this.onboarding.saveStep1(userId, phone, dto);
  }

  /* ───── Step 2 ───── */
  @Patch('professional')
  saveProfessional(@Req() req: Request, @Body() dto: Step2ProfessionalInfoDto) {
    return this.onboarding.saveStep2(this.who(req).userId, dto);
  }

  /* ───── Step 3 ───── */
  @Patch('religion')
  setReligion(@Req() req: Request, @Body() dto: Step3ReligionDto) {
    return this.onboarding.saveStep3(this.who(req).userId, dto.religion);
  }

  /* ───── Step 4 ───── */
  @Post('services')
  selectServices(@Req() req: Request, @Body() dto: Step4SelectedServicesDto) {
    return this.onboarding.saveStep4(this.who(req).userId, dto);
  }

  /* ───── Step 5 ───── */
  @Post('pricing')
  savePricing(@Req() req: Request, @Body() dto: Step5PricingDto) {
    return this.onboarding.saveStep5(this.who(req).userId, dto);
  }

  /* ───── Step 6 ───── */
  @Post('availability')
  saveAvailability(@Req() req: Request, @Body() dto: Step6AvailabilityDto) {
    return this.onboarding.saveStep6(this.who(req).userId, dto);
  }

  /* ───── Step 7 ───── */
  @Post('kyc/presign')
  presignKyc(@Req() req: Request, @Body() dto: PreSignKycUploadDto) {
    return this.onboarding.presignKycUpload(this.who(req).userId, dto);
  }

  @Post('kyc')
  submitKyc(@Req() req: Request, @Body() dto: Step7SubmitKycDto) {
    return this.onboarding.submitKyc(this.who(req).userId, dto);
  }

  /* ───── Provider KYC / application status ───── */
  @Get('status')
  getMyStatus(@Req() req: Request) {
    return this.onboarding.getMyStatus(this.who(req).userId);
  }

  /* ───── Draft autosave / resume ───── */
  @Get('draft')
  getDraft(@Req() req: Request) {
    return this.onboarding.getDraft(this.who(req).userId);
  }

  @Patch('draft')
  saveDraft(@Req() req: Request, @Body() dto: SaveDraftDto) {
    return this.onboarding.saveDraft(this.who(req).userId, dto);
  }

  @Patch('online')
  @HttpCode(HttpStatus.OK)
  async toggleOnline(
    @Req() req: Request,
    @Body() dto: { isOnline: boolean },
  ) {
    const { userId } = this.who(req);
    return this.onboarding.setOnlineStatus(userId, dto.isOnline);
  }
}
