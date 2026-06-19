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
   * 0-3 yrs  : 1000–2000 paise
   * 4-9 yrs  : 1000–5000 paise
   * 10+ yrs  : 1000–10000 paise
   */
  private validatePerMinuteRate(perMinutePaise: number, experienceYears: number): void {
    const min = 1000;
    let max = 2000;
    if (experienceYears >= 10) max = 10_000;
    else if (experienceYears >= 4) max = 5_000;
    if (perMinutePaise < min || perMinutePaise > max) {
      throw new BadRequestException(
        `per_minute_paise must be ${min}–${max} paise for ${experienceYears} years experience`,
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
      row.ifscCode        = hasAccount ? dto.ifscCode : undefined;
      row.beneficiaryName = dto.beneficiaryName ?? row.beneficiaryName;
      row.upiId           = hasUpi ? dto.upiId : undefined;
      row.verificationStatus = BankVerificationStatus.UNVERIFIED;
      await this.bankRepo.save(row);
    } else {
      row = this.bankRepo.create({
        providerId: provider.id,
        bankName:   dto.bankName,
        accountNumberEncrypted: encrypted,
        ifscCode:   hasAccount ? dto.ifscCode : undefined,
        beneficiaryName: dto.beneficiaryName,
        upiId:      hasUpi ? dto.upiId : undefined,
        verificationStatus: BankVerificationStatus.UNVERIFIED,
        isPrimary:  true,
      });
      await this.bankRepo.save(row);
    }

    const masked = hasAccount
      ? `****${dto.accountNumber!.slice(-4)}`
      : `****${(dto.upiId ?? '').replace(/^[^@]+/, '')}`;

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

    await this.providers.update({ id: provider.id }, { status: ProviderStatus.PendingReview });

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
    return {
      state: provider?.status ?? null,
      draft: draft?.data ?? {},
    };
  }
}
