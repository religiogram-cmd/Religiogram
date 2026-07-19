import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ProviderEntity,
  ProviderReligion,
  ProviderStatus,
  ProviderCategory,
  ConsultationChannel,
} from './entities/provider.entity';
import { OnboardingDraftEntity } from './entities/onboarding-draft.entity';
import {
  ProviderServiceEntity,
  ServiceMode,
} from './entities/provider-service.entity';
import { ServiceMasterEntity } from './entities/service-master.entity';
import { KycVideoEntity, KycStatus } from './entities/kyc-video.entity';
import {
  ProviderBankAccount,
  BankVerificationStatus,
} from './entities/provider-bank-account.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UploadsService } from '../uploads/uploads.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { BankVerificationService } from './bank-verification.service';

/* ─────────── DTOs ─────────── */

class PatchDraftDto {
  // ── Step 1 — basic identity ────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be 10 digits' })
  phone?: string;

  // ── Step 3 / 6 ────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(ProviderReligion)
  religion?: ProviderReligion;

  @IsOptional()
  @IsEnum(ServiceMode)
  serviceMode?: ServiceMode;

  // ── Step 2 ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  @Length(0, 600)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  @Length(2, 120)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(100_000)
  perMinutePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  radius?: number;

  // ── Astrology-flow fields (migration 068) ─────────────────────────────
  // Priest applicants never send these; astrologer and 'both' applicants do.
  // We accept them here so the autosave PATCH doesn't fail with a 400 due to
  // `forbidNonWhitelisted: true` in the global ValidationPipe. The fields
  // are merged into draft.data JSON and flushed onto the Provider row at
  // /submit time.

  @IsOptional()
  @IsEnum(ProviderCategory)
  providerCategory?: ProviderCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  specialisations?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(ConsultationChannel, { each: true })
  consultationChannels?: ConsultationChannel[];

  /**
   * Per-specialisation years of experience (migration 069).
   * Shape: { [specialisationLabel: string]: number }
   *
   * Class-validator's IsObject only checks it's a plain object; the runtime
   * merge in the patch handler filters out non-numeric values and clamps
   * years to a sane 0–80 range. Keys that don't appear in `specialisations`
   * are still stored (they're cheap) — cleanup happens at submit time.
   */
  @IsOptional()
  @IsObject()
  specialisationYears?: Record<string, number>;

  /**
   * Per-category furthest step reached. Persisted to draft.data so a user
   * who resumes the wizard on a different device (or after clearing
   * localStorage) still sees a "Continue where you left off" banner for
   * whichever role they were mid-way through — priest / astrologer / both.
   *
   * Shape: { priest?: number; astrologer?: number; both?: number }
   * Without this the autosave PATCH would 400 due to forbidNonWhitelisted.
   */
  @IsOptional()
  @IsObject()
  progressByCategory?: Record<string, number>;
}

class PresignKycDto {
  @IsIn(['video/mp4', 'video/webm', 'video/quicktime'])
  contentType!: 'video/mp4' | 'video/webm' | 'video/quicktime';

  @IsInt()
  @Min(1)
  @Max(60 * 1024 * 1024) // 60 MB cap for a 30–60s mobile clip
  sizeBytes!: number;
}

class ServiceLineDto {
  @IsInt()
  @Min(1)
  catalogServiceId!: number;

  @IsInt()
  @Min(100)
  @Max(10_000_000)
  pricePaise!: number;
}

class SetServicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceLineDto)
  services!: ServiceLineDto[];
}

class SubmitKycDto {
  @IsString()
  r2ObjectKey!: string;

  @IsInt()
  @Min(30)
  durationSeconds!: number;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}

class PresignKycImageDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsInt()
  @Min(1)
  @Max(8 * 1024 * 1024) // 8 MB cap for ID-card-style images
  sizeBytes!: number;
}

class ConfirmKycImageDto {
  @IsString()
  @Length(1, 512)
  r2ObjectKey!: string;
}

class SubmitBankDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,20}$/, { message: 'accountNumber must be 8–20 digits' })
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\w.\-]+@[\w]+$/, { message: 'upiId must look like name@bank' })
  upiId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'ifscCode must be 11 chars (4 letters + 0 + 6 alphanum)' })
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  beneficiaryName?: string;
}

/* ─────────────────────────────────────────────────────────────
 * ProviderOnboardingV2Controller
 *
 * Implements the v1/provider/onboarding/* route set:
 *
 *   POST   /v1/provider/onboarding/start
 *   PATCH  /v1/provider/onboarding/:id
 *   POST   /v1/provider/onboarding/:id/services
 *   POST   /v1/provider/onboarding/:id/kyc
 *   POST   /v1/provider/onboarding/:id/submit
 *   GET    /v1/provider/onboarding/me
 *
 * The ":id" is the onboarding_drafts.user_id (bigint as string),
 * which equals the provider's user_id. Using the user_id as the
 * onboarding ID avoids a separate UUID table and keeps the URL
 * opaque-but-stable.
 * ────────────────────────────────────────────────────────────── */
@Controller({ path: 'provider/onboarding', version: '1' })
export class ProviderOnboardingV2Controller {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(OnboardingDraftEntity)
    private readonly drafts: Repository<OnboardingDraftEntity>,
    @InjectRepository(ProviderServiceEntity)
    private readonly providerServices: Repository<ProviderServiceEntity>,
    @InjectRepository(ServiceMasterEntity)
    private readonly catalogue: Repository<ServiceMasterEntity>,
    @InjectRepository(KycVideoEntity)
    private readonly kycRepo: Repository<KycVideoEntity>,
    @InjectRepository(ProviderBankAccount)
    private readonly bankRepo: Repository<ProviderBankAccount>,
    private readonly notifs: NotificationsService,
    private readonly uploads: UploadsService,
    private readonly encryption: EncryptionService,
    private readonly bankVerification: BankVerificationService,
  ) {}

  /* ── helpers ── */
  private userId(req: Request): string {
    const u: any = req.user;
    const id = u?.id ?? u?.sub;
    if (!id) throw new BadRequestException('Missing auth context');
    return String(id);
  }

  /**
   * Validate per-minute rate against experience band.
   *
   * Bands (in rupees/minute, converted from paise = ₹ × 100):
   *   0–3 yrs   :  ₹10 –  ₹20    ( 1_000 –  2_000 paise)
   *   4–9 yrs   :  ₹10 –  ₹50    ( 1_000 –  5_000 paise)
   *   10–14 yrs :  ₹20 – ₹100    ( 2_000 – 10_000 paise)
   *   15–19 yrs :  ₹30 – ₹150    ( 3_000 – 15_000 paise)
   *   20+  yrs  :  ₹50 – ₹300    ( 5_000 – 30_000 paise)
   *
   * These bands must be kept in sync with the frontend guidance in
   * `Step_PerMinuteRate.suggestedBandRupees()`. The frontend allows values
   * outside the band with a soft warning; the backend enforces the band
   * strictly to prevent accidental price submission that would confuse
   * marketplace pricing.
   *
   * The outer DTO bound (500–100_000 paise) is enforced by @Min/@Max on
   * `perMinutePaise` and covers cases where experience isn't yet set.
   */
  private validatePerMinuteRate(perMinutePaise: number, experienceYears: number): void {
    let min: number;
    let max: number;
    let label: string;
    if (experienceYears >= 20)      { min =  5_000; max = 30_000; label = '20+ years'; }
    else if (experienceYears >= 15) { min =  3_000; max = 15_000; label = '15–19 years'; }
    else if (experienceYears >= 10) { min =  2_000; max = 10_000; label = '10–14 years'; }
    else if (experienceYears >= 4)  { min =  1_000; max =  5_000; label = '4–9 years';   }
    else                            { min =  1_000; max =  2_000; label = '0–3 years';   }
    if (perMinutePaise < min || perMinutePaise > max) {
      const minR = Math.round(min / 100);
      const maxR = Math.round(max / 100);
      throw new BadRequestException(
        `Per-minute rate must be ₹${minR}–₹${maxR} for ${label} of experience.`,
      );
    }
  }

  /* ─── POST /v1/provider/onboarding/start ─── */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(@Req() req: Request) {
    const userId = this.userId(req);

    // Ensure Provider row exists in pending state
    let provider = await this.providers.findOne({ where: { userId } });
    if (!provider) {
      provider = this.providers.create({
        userId,
        fullName: '',
        dob: '1970-01-01',
        phone: '',
        city: '',
        status: ProviderStatus.Draft,
      });
      await this.providers.save(provider);
    }

    // Ensure draft exists
    let draft = await this.drafts.findOne({ where: { userId } });
    if (!draft) {
      draft = this.drafts.create({ userId, step: 1, data: {} });
      await this.drafts.save(draft);
    }

    return { onboardingId: userId };
  }

  /* ─── PATCH /v1/provider/onboarding/:id ─── */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async patchDraft(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PatchDraftDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    // Load or create draft
    let draft = await this.drafts.findOne({ where: { userId } });
    if (!draft) {
      draft = this.drafts.create({ userId, step: 1, data: {} });
    }

    // Validate perMinutePaise against experience band if both supplied
    const expYears =
      dto.experienceYears ?? (draft.data['experienceYears'] as number | undefined);
    if (dto.perMinutePaise !== undefined && expYears !== undefined) {
      this.validatePerMinuteRate(dto.perMinutePaise, expYears);
    }

    // Merge into draft data
    const patch: Record<string, unknown> = {};
    if (dto.fullName !== undefined)      patch['fullName']       = dto.fullName;
    if (dto.dob !== undefined)           patch['dob']            = dto.dob;
    if (dto.phone !== undefined)         patch['phone']          = dto.phone;
    if (dto.religion !== undefined)      patch['religion']       = dto.religion;
    if (dto.serviceMode !== undefined)   patch['serviceMode']    = dto.serviceMode;
    if (dto.experienceYears !== undefined) patch['experienceYears'] = dto.experienceYears;
    if (dto.bio !== undefined)           patch['bio']            = dto.bio;
    if (dto.languages !== undefined)     patch['languages']      = dto.languages;
    if (dto.city !== undefined)          patch['city']           = dto.city;
    if (dto.perMinutePaise !== undefined) patch['perMinutePaise'] = dto.perMinutePaise;
    if (dto.radius !== undefined)        patch['radius']         = dto.radius;
    // Astrology-flow fields — mirror into draft.data so the Submit handler
    // can flush them onto the Provider row.
    if (dto.providerCategory !== undefined)     patch['providerCategory']     = dto.providerCategory;
    if (dto.specialisations !== undefined)      patch['specialisations']      = dto.specialisations;
    if (dto.consultationChannels !== undefined) patch['consultationChannels'] = dto.consultationChannels;
    if (dto.specialisationYears !== undefined) {
      /* Sanitise: only keep string→number entries with years in 0..80. This
       * both prevents client-side bugs from poisoning the JSONB blob and
       * matches the frontend band range. */
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(dto.specialisationYears)) {
        if (typeof k !== 'string' || k.length === 0 || k.length > 80) continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 80) continue;
        clean[k] = Math.trunc(n);
      }
      patch['specialisationYears'] = clean;
    }

    draft.data = { ...draft.data, ...patch };
    await this.drafts.save(draft);

    // Also sync editable fields onto provider row
    const provider = await this.providers.findOne({ where: { userId } });
    if (provider) {
      if (dto.fullName)        provider.fullName        = dto.fullName;
      if (dto.dob)             provider.dob             = dto.dob;
      if (dto.phone)           provider.phone           = dto.phone;
      if (dto.city)            provider.city            = dto.city;
      if (dto.experienceYears) provider.experienceYears = dto.experienceYears;
      if (dto.bio)             provider.bio             = dto.bio;
      if (dto.languages)       provider.languages       = dto.languages;
      if (dto.religion)        provider.religion        = dto.religion;
      await this.providers.save(provider);
    }

    return { draft: draft.data };
  }

  /* ─── POST /v1/provider/onboarding/:id/kyc/presign ─── */
  @Post(':id/kyc/presign')
  @HttpCode(HttpStatus.OK)
  async presignKyc(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PresignKycDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    return this.uploads.createKycPresign(provider.id, dto.contentType, dto.sizeBytes);
  }

  /* ─── POST /v1/provider/onboarding/:id/services ─── */
  @Post(':id/services')
  @HttpCode(HttpStatus.OK)
  async setServices(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: SetServicesDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    // Validate each service exists in catalogue and price is in market range
    for (const line of dto.services) {
      const svc = await this.catalogue.findOne({
        where: { id: String(line.catalogServiceId) },
      });
      if (!svc) {
        throw new BadRequestException(
          `Catalog service ${line.catalogServiceId} not found`,
        );
      }
      if (
        svc.suggestedMinPrice !== null &&
        svc.suggestedMaxPrice !== null &&
        (line.pricePaise < svc.suggestedMinPrice * 0.5 ||
          line.pricePaise > svc.suggestedMaxPrice * 3)
      ) {
        throw new BadRequestException(
          `Price for "${svc.name}" is outside acceptable market range`,
        );
      }
    }

    // Upsert: deactivate existing, then insert/update
    await this.ds.transaction(async (em) => {
      await em
        .getRepository(ProviderServiceEntity)
        .update({ providerId: provider.id }, { isActive: false });

      for (const line of dto.services) {
        const existing = await em.getRepository(ProviderServiceEntity).findOne({
          where: { providerId: provider.id, serviceId: String(line.catalogServiceId) },
        });
        if (existing) {
          await em.getRepository(ProviderServiceEntity).update(
            { id: existing.id },
            { basePricePaise: line.pricePaise, isActive: true },
          );
        } else {
          const svc = await em.getRepository(ServiceMasterEntity).findOneOrFail({
            where: { id: String(line.catalogServiceId) },
          });
          await em.getRepository(ProviderServiceEntity).save(
            em.getRepository(ProviderServiceEntity).create({
              providerId: provider.id,
              serviceId:  String(line.catalogServiceId),
              basePricePaise: line.pricePaise,
              durationMinutes: svc.suggestedDurationMinutes ?? 60,
              mode: ServiceMode.Online,
              isActive: true,
            }),
          );
        }
      }
    });

    const draft = await this.drafts.findOne({ where: { userId } });
    return { draft: draft?.data ?? {} };
  }

  /* ─── POST /v1/provider/onboarding/:id/kyc ─── */
  @Post(':id/kyc')
  @HttpCode(HttpStatus.OK)
  async submitKyc(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: SubmitKycDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    if (dto.durationSeconds < 30) {
      throw new BadRequestException('KYC video must be at least 30 seconds');
    }

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    // Verify the R2 key belongs to this provider — prevents IDOR document injection
    if (dto.r2ObjectKey && !dto.r2ObjectKey.startsWith(`kyc/${provider.id}/`)) {
      throw new ForbiddenException('Invalid document key — must belong to your provider folder');
    }

    const kyc = this.kycRepo.create({
      providerId: provider.id,
      s3Key:      dto.r2ObjectKey,
      durationSeconds: dto.durationSeconds.toFixed(2),
      sizeBytes:  '0',
      mimeType:   'video/mp4',
      status:     KycStatus.Uploaded,
    });
    await this.kycRepo.save(kyc);

    return { kycVideoId: kyc.id };
  }

  /* ─── POST /v1/provider/onboarding/:id/pan/presign ─── */
  @Post(':id/pan/presign')
  @HttpCode(HttpStatus.OK)
  async presignPan(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PresignKycImageDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    return this.uploads.createKycImagePresign(
      provider.id,
      dto.contentType,
      dto.sizeBytes,
      'pan',
    );
  }

  /* ─── POST /v1/provider/onboarding/:id/pan ─── */
  @Post(':id/pan')
  @HttpCode(HttpStatus.OK)
  async confirmPan(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: ConfirmKycImageDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    if (!dto.r2ObjectKey.startsWith(`kyc/${provider.id}/`)) {
      throw new ForbiddenException('Invalid document key — must belong to your provider folder');
    }

    await this.providers.update(
      { id: provider.id },
      { panS3Key: dto.r2ObjectKey, panUploadedAt: new Date() },
    );

    return { ok: true };
  }

  /* ─── POST /v1/provider/onboarding/:id/selfie/presign ─── */
  @Post(':id/selfie/presign')
  @HttpCode(HttpStatus.OK)
  async presignSelfie(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PresignKycImageDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    return this.uploads.createKycImagePresign(
      provider.id,
      dto.contentType,
      dto.sizeBytes,
      'selfie',
    );
  }

  /* ─── POST /v1/provider/onboarding/:id/selfie ─── */
  @Post(':id/selfie')
  @HttpCode(HttpStatus.OK)
  async confirmSelfie(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: ConfirmKycImageDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    if (!dto.r2ObjectKey.startsWith(`kyc/${provider.id}/`)) {
      throw new ForbiddenException('Invalid document key — must belong to your provider folder');
    }

    await this.providers.update(
      { id: provider.id },
      { selfieS3Key: dto.r2ObjectKey, selfieUploadedAt: new Date() },
    );

    return { ok: true };
  }

  /* ─── POST /v1/provider/onboarding/:id/bank ─── */
  @Post(':id/bank')
  @HttpCode(HttpStatus.OK)
  async submitBank(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: SubmitBankDto,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    const hasAccount = !!dto.accountNumber;
    const hasUpi     = !!dto.upiId;
    if (!hasAccount && !hasUpi) {
      throw new BadRequestException('Provide either accountNumber+ifscCode or upiId');
    }
    if (hasAccount && !dto.ifscCode) {
      throw new BadRequestException('ifscCode is required when accountNumber is set');
    }

    // Encrypt with the same payout key used by payout.service.ts so the
    // ciphertext is readable end-to-end. Plaintext sentinel '__UPI__' is
    // used when only UPI is provided — the column is NOT NULL.
    const plaintext = hasAccount ? dto.accountNumber! : '__UPI__';
    const encrypted = this.encryption.encrypt(plaintext, 'PAYOUT_ENCRYPTION_KEY');

    let row = await this.bankRepo.findOne({
      where: { providerId: provider.id, isPrimary: true },
    });
    if (row) {
      row.bankName        = dto.bankName ?? row.bankName;
      row.accountNumberEncrypted = encrypted;
      row.ifscCode        = hasAccount ? (dto.ifscCode ?? null) : null;
      row.beneficiaryName = dto.beneficiaryName ?? row.beneficiaryName;
      row.upiId           = hasUpi ? (dto.upiId ?? null) : null;
      row.verificationStatus = BankVerificationStatus.UNVERIFIED;
      await this.bankRepo.save(row);
    } else {
      row = this.bankRepo.create({
        providerId: provider.id,
        bankName:   dto.bankName,
        accountNumberEncrypted: encrypted,
        ifscCode:   hasAccount ? (dto.ifscCode ?? null) : null,
        beneficiaryName: dto.beneficiaryName,
        upiId:      hasUpi ? (dto.upiId ?? null) : null,
        verificationStatus: BankVerificationStatus.UNVERIFIED,
        isPrimary:  true,
      });
      await this.bankRepo.save(row);
    }

    let masked: string;
    if (hasAccount) {
      masked = `****${dto.accountNumber!.slice(-4)}`;
    } else {
      const upiHandle = dto.upiId!.split('@')[0] || '';
      masked = `${upiHandle.slice(0, 2)}***@${dto.upiId!.split('@')[1] || 'upi'}`;
    }

    /* Kick off RazorpayX penny-drop verification asynchronously.
     * Fire-and-forget: verifyBankAccount() catches all errors and never
     * throws, so onboarding is never blocked by RazorpayX being down or
     * unconfigured. When RAZORPAYX creds are missing the service marks
     * the row as SKIPPED and returns fast. */
    this.bankVerification.verifyBankAccount(provider.id).catch(() => {});

    return { ok: true, masked };
  }

  /* ─── GET /v1/provider/onboarding/:id/bank ─── */
  @Get(':id/bank')
  async getBank(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    const row = await this.bankRepo.findOne({
      where: { providerId: provider.id, isPrimary: true },
    });
    if (!row) return { hasBank: false, masked: null, method: null };

    if (row.upiId) {
      return {
        hasBank: true,
        method: 'upi' as const,
        masked: `****${row.upiId.replace(/^[^@]+/, '')}`,
      };
    }

    // Decrypt only to derive the last-4 mask; never return the plaintext.
    let last4 = '';
    try {
      const pt = this.encryption.decrypt(row.accountNumberEncrypted, 'PAYOUT_ENCRYPTION_KEY');
      last4 = pt.slice(-4);
    } catch {
      last4 = '';
    }
    return {
      hasBank: true,
      method: 'bank' as const,
      masked: last4 ? `****${last4}` : '****',
    };
  }

  /* ─── POST /v1/provider/onboarding/:id/submit ─── */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const userId = this.userId(req);
    if (id !== userId) throw new BadRequestException('Onboarding ID mismatch');

    const provider = await this.providers.findOne({ where: { userId } });
    if (!provider) throw new NotFoundException('Start onboarding first');

    // Validate required fields
    const draft = await this.drafts.findOne({ where: { userId } });
    const data = draft?.data ?? {};

    const missingFields: string[] = [];
    if (!provider.fullName && !data['fullName']) missingFields.push('fullName');
    if (!provider.religion && !data['religion'])  missingFields.push('religion');
    if (!provider.city && !data['city'])          missingFields.push('city');
    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing required fields: ${missingFields.join(', ')}`,
      );
    }

    // Ensure at least one KYC video uploaded
    const kycCount = await this.kycRepo.count({ where: { providerId: provider.id } });
    if (kycCount === 0) {
      throw new BadRequestException('Upload a KYC video before submitting');
    }

    // KYC: PAN card + selfie must be on file
    if (!provider.panS3Key) {
      throw new BadRequestException('Upload your PAN card before submitting');
    }
    if (!provider.selfieS3Key) {
      throw new BadRequestException('Upload your selfie before submitting');
    }

    // Payout method (bank or UPI) required
    const bankCount = await this.bankRepo.count({ where: { providerId: provider.id } });
    if (bankCount === 0) {
      throw new BadRequestException('Add a payout method before submitting');
    }

    // Transition state
    if (provider.status !== ProviderStatus.Draft && provider.status !== ProviderStatus.Rejected) {
      throw new BadRequestException(
        `Cannot submit from state: ${provider.status}`,
      );
    }

    // Flush draft.data fields that patchDraft only stored in JSON onto
    // the provider row so admin queries / search see the real values.
    const sync: Partial<ProviderEntity> = { status: ProviderStatus.PendingReview };
    if (typeof data['serviceMode'] === 'string') {
      (sync as any).serviceMode = data['serviceMode'];
    }
    if (typeof data['perMinutePaise'] === 'number') {
      (sync as any).perMinutePaise = data['perMinutePaise'];
    }
    if (typeof data['radius'] === 'number') {
      (sync as any).radius = data['radius'];
    }
    if (!provider.fullName && typeof data['fullName'] === 'string') {
      (sync as any).fullName = data['fullName'];
    }
    if (!provider.religion && typeof data['religion'] === 'string') {
      (sync as any).religion = data['religion'];
    }
    if (!provider.city && typeof data['city'] === 'string') {
      (sync as any).city = data['city'];
    }
    // ── Astrology-flow fields ─────────────────────────────────────────────
    // Flush category + specialisations + consultation channels from the
    // draft JSON onto their own columns so the marketplace filter (uses
    // `provider_category`, `specialisations`, `consultation_channels`)
    // sees the right values the moment admin approves. Without this an
    // approved astrologer would show up as a generic priest.
    const rawCategory = data['providerCategory'];
    if (
      typeof rawCategory === 'string' &&
      (rawCategory === ProviderCategory.Priest ||
       rawCategory === ProviderCategory.Astrologer ||
       rawCategory === ProviderCategory.Both)
    ) {
      (sync as any).providerCategory = rawCategory;
    }
    const rawSpecs = data['specialisations'];
    if (Array.isArray(rawSpecs)) {
      (sync as any).specialisations = rawSpecs.filter(
        (s: unknown) => typeof s === 'string' && s.trim().length > 0,
      );
    }
    const rawChans = data['consultationChannels'];
    if (Array.isArray(rawChans)) {
      const allowed = new Set<string>([
        ConsultationChannel.Chat,
        ConsultationChannel.Voice,
        ConsultationChannel.Video,
      ]);
      (sync as any).consultationChannels = rawChans.filter(
        (c: unknown) => typeof c === 'string' && allowed.has(c),
      );
    }
    // Per-specialisation years — copy across, but only keep entries whose
    // key appears in the final `specialisations` list so stale entries
    // (e.g. from a spec the user unpicked) don't linger.
    const rawYears = data['specialisationYears'];
    const finalSpecs = (sync as any).specialisations as string[] | undefined
      ?? (Array.isArray(rawSpecs) ? rawSpecs : []);
    if (rawYears && typeof rawYears === 'object' && !Array.isArray(rawYears)) {
      const clean: Record<string, number> = {};
      const finalSet = new Set(finalSpecs);
      for (const [k, v] of Object.entries(rawYears as Record<string, unknown>)) {
        if (!finalSet.has(k)) continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 80) continue;
        clean[k] = Math.trunc(n);
      }
      (sync as any).specialisationYears = clean;
    }
    await this.providers.update({ id: provider.id }, sync);

    // Notify admins via system notification (admin userId placeholder)
    // In production this would fan out to all admin users; here we emit a
    // system notification for the provider confirming receipt.
    await this.notifs.send(
      userId,
      NotificationType.SYSTEM,
      'Application submitted',
      'Your provider application is under review. We will notify you within 2 business days.',
    );

    return { providerState: ProviderStatus.PendingReview };
  }

  /* ─── GET /v1/provider/onboarding/me ─── */
  @Get('me')
  async getMe(@Req() req: Request) {
    const userId = this.userId(req);
    const provider = await this.providers.findOne({ where: { userId } });
    const draft    = await this.drafts.findOne({ where: { userId } });
    const bankCount = provider
      ? await this.bankRepo.count({ where: { providerId: provider.id } })
      : 0;
    return {
      state: provider?.status ?? null,
      draft: draft?.data ?? {},
      panUploaded: !!provider?.panS3Key,
      selfieUploaded: !!provider?.selfieS3Key,
      bankSet: bankCount > 0,
    };
  }
}
