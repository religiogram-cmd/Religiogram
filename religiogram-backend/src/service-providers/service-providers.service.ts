import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

import {
  ProviderEntity,
  ProviderReligion,
  ProviderStatus,
} from './entities/provider.entity';
import { ServiceMasterEntity } from './entities/service-master.entity';
import {
  ProviderServiceEntity,
  ServiceMode,
} from './entities/provider-service.entity';
import { AvailabilityEntity } from './entities/availability.entity';
import { KycVideoEntity, KycStatus } from './entities/kyc-video.entity';
import { OnboardingDraftEntity } from './entities/onboarding-draft.entity';
import {
  PricingItemDto,
  Step1BasicDetailsDto,
  Step2ProfessionalInfoDto,
  Step4SelectedServicesDto,
  Step5PricingDto,
  Step6AvailabilityDto,
  Step7SubmitKycDto,
  SaveDraftDto,
  PreSignKycUploadDto,
} from './dto/onboarding.dto';

/**
 * ProviderOnboardingService — glue for the 7-step wizard.
 *
 * Storage pattern: each step has its own method that
 *   1. validates the input in the context of the provider's current state
 *      (e.g. can't select services before religion is set),
 *   2. persists the step's authoritative data,
 *   3. updates the `status` field only when we have reason to
 *      (we leave `status` as 'draft' until Step 7 lands).
 *
 * Consistency: steps that touch more than one row wrap their writes in a
 * QueryRunner transaction so a half-applied state never surfaces if the
 * user loses connectivity mid-submit.
 *
 * Services selection guardrail: `assertReligionSet` is the single chokepoint
 * — every code path into Steps 4/5 runs through it so the UI gate ("Until
 * religion is selected: service selection disabled") is enforced at the
 * API too, not just the client.
 */
@Injectable()
export class ProviderOnboardingService {
  private readonly logger = new Logger(ProviderOnboardingService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly kycUrlTtlSeconds = 15 * 60; // 15 min

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(ServiceMasterEntity)
    private readonly catalogue: Repository<ServiceMasterEntity>,
    @InjectRepository(ProviderServiceEntity)
    private readonly providerServices: Repository<ProviderServiceEntity>,
    @InjectRepository(AvailabilityEntity)
    private readonly avail: Repository<AvailabilityEntity>,
    @InjectRepository(KycVideoEntity)
    private readonly kyc: Repository<KycVideoEntity>,
    @InjectRepository(OnboardingDraftEntity)
    private readonly drafts: Repository<OnboardingDraftEntity>,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('storage.region', 'ap-south-1'),
    });
    this.bucket = this.config.get<string>('storage.bucket', 'religiogram-dev');
  }

  /* ─────────────────── Shared helpers ─────────────────── */

  private async getProvider(userId: string): Promise<ProviderEntity | null> {
    return this.providers.findOne({ where: { userId } });
  }

  private async getOrCreateProvider(
    userId: string,
    draft: Partial<ProviderEntity> = {},
  ): Promise<ProviderEntity> {
    let p = await this.getProvider(userId);
    if (p) return p;
    p = this.providers.create({
      userId,
      fullName: draft.fullName ?? '',
      dob: draft.dob ?? '1970-01-01',
      phone: draft.phone ?? '',
      city: draft.city ?? '',
      status: ProviderStatus.Draft,
    });
    return this.providers.save(p);
  }

  private assertEditable(p: ProviderEntity): void {
    if (
      p.status === ProviderStatus.Approved ||
      p.status === ProviderStatus.Suspended
    ) {
      throw new ForbiddenException(
        'Approved / suspended profiles cannot be edited during onboarding. ' +
          'Use the profile-edit flow instead.',
      );
    }
  }

  private assertReligionSet(p: ProviderEntity): void {
    if (!p.religion) {
      throw new BadRequestException(
        'Select a religion (Step 3) before choosing services.',
      );
    }
  }

  /* ─────────────────── Services catalogue (public GET) ─────────────────── */

  async listCatalogue(religion: ProviderReligion) {
    const rows = await this.catalogue.find({
      where: { religion, isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
    // Group into category buckets for the UI.
    const grouped: Record<string, ServiceMasterEntity[]> = {};
    for (const r of rows) {
      (grouped[r.category] ??= []).push(r);
    }
    return {
      religion,
      categories: Object.entries(grouped).map(([name, services]) => ({
        name,
        services,
      })),
    };
  }

  /* ─────────────────── Step 1 — Basic details ─────────────────── */

  async saveStep1(
    userId: string,
    authenticatedPhone: string,
    dto: Step1BasicDetailsDto,
  ) {
    if (dto.phone !== authenticatedPhone) {
      throw new ForbiddenException('Phone must match your logged-in number.');
    }
    const p = await this.getOrCreateProvider(userId);
    this.assertEditable(p);
    p.fullName = dto.fullName.trim();
    p.dob = dto.dob;
    p.phone = dto.phone;
    p.city = dto.city.trim();
    await this.providers.save(p);
    return { providerId: p.id, step: 1 };
  }

  /* ─────────────────── Step 2 — Professional info ─────────────────── */

  async saveStep2(userId: string, dto: Step2ProfessionalInfoDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);
    p.experienceYears = dto.experienceYears;
    p.languages = Array.from(new Set(dto.languages.map((s) => s.trim()))).slice(0, 10);
    p.bio = dto.bio?.trim() || null;
    await this.providers.save(p);
    return { providerId: p.id, step: 2 };
  }

  /* ─────────────────── Step 3 — Religion ─────────────────── */

  async saveStep3(userId: string, religion: ProviderReligion) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);
    // Changing religion mid-onboarding invalidates any services previously
    // selected — clear them so the user isn't left with stale rows pointing
    // at catalogue rows from the old religion.
    if (p.religion && p.religion !== religion) {
      await this.providerServices.delete({ providerId: p.id });
    }
    p.religion = religion;
    await this.providers.save(p);
    return { providerId: p.id, step: 3, religion };
  }

  /* ─────────────────── Step 4 — Services selection ─────────────────── *
   * We stage selections as rows in provider_services with placeholder
   * pricing (base = suggested_min) so Step 5 can render immediately.
   * Step 5 overrides all prices; if the user abandons mid-onboarding the
   * placeholder isn't visible anywhere because status stays 'draft'.
   */
  async saveStep4(userId: string, dto: Step4SelectedServicesDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);
    this.assertReligionSet(p);

    const { serviceIds, customServiceNames } = dto;
    if (serviceIds.length === 0 && customServiceNames.length === 0) {
      throw new BadRequestException('Pick at least one service.');
    }

    // Validate catalogue ids belong to this religion — prevents picking
    // a Muslim service while religion = hindu.
    let catalogueRows: ServiceMasterEntity[] = [];
    if (serviceIds.length) {
      catalogueRows = await this.catalogue.findBy({
        id: In(serviceIds.map(String)),
      });
      const mismatch = catalogueRows.find((c) => c.religion !== p.religion);
      if (mismatch) {
        throw new BadRequestException(
          `Service "${mismatch.name}" does not belong to ${p.religion}.`,
        );
      }
      if (catalogueRows.length !== serviceIds.length) {
        throw new BadRequestException('Unknown service ids in selection.');
      }
    }

    // De-dupe custom names, cap length.
    const customs = Array.from(
      new Set(customServiceNames.map((s) => s.trim()).filter(Boolean)),
    ).slice(0, 10);

    await this.ds.transaction(async (qr: import('typeorm').EntityManager) => {
      // Wipe existing selections — Step 4 is idempotent.
      await qr.getRepository(ProviderServiceEntity).delete({ providerId: p.id });

      const inserts: ProviderServiceEntity[] = [];
      for (const c of catalogueRows) {
        inserts.push(
          qr.getRepository(ProviderServiceEntity).create({
            providerId: p.id,
            serviceId: c.id,
            customName: null,
            basePricePaise: c.suggestedMinPrice ?? 0,
            durationMinutes: c.suggestedDurationMinutes ?? 60,
            mode: ServiceMode.Offline,
          }),
        );
      }
      for (const name of customs) {
        inserts.push(
          qr.getRepository(ProviderServiceEntity).create({
            providerId: p.id,
            serviceId: null,
            customName: name,
            basePricePaise: 0,
            durationMinutes: 60,
            mode: ServiceMode.Offline,
          }),
        );
      }
      if (inserts.length) {
        await qr.getRepository(ProviderServiceEntity).save(inserts);
      }
    });

    return {
      providerId: p.id,
      step: 4,
      selected: serviceIds.length + customs.length,
    };
  }

  /* ─────────────────── Step 5 — Pricing ─────────────────── */

  async saveStep5(userId: string, dto: Step5PricingDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);
    this.assertReligionSet(p);

    if (!dto.items.length) {
      throw new BadRequestException('Pricing list is empty.');
    }

    await this.ds.transaction(async (qr: import('typeorm').EntityManager) => {
      const repo = qr.getRepository(ProviderServiceEntity);
      for (const item of dto.items) {
        await this.upsertPricing(repo, p.id, item);
      }
    });
    return { providerId: p.id, step: 5, itemCount: dto.items.length };
  }

  private async upsertPricing(
    repo: Repository<ProviderServiceEntity>,
    providerId: string,
    item: PricingItemDto,
  ): Promise<void> {
    const base = {
      providerId,
      basePricePaise: item.basePricePaise,
      travelFeePaise: item.travelFeePaise ?? 0,
      addonFeePaise: item.addonFeePaise ?? 0,
      durationMinutes: item.durationMinutes,
      mode: item.mode,
      isActive: true,
    };

    if (item.serviceId) {
      const existing = await repo.findOne({
        where: { providerId, serviceId: String(item.serviceId) },
      });
      if (existing) {
        await repo.update({ id: existing.id }, base);
      } else {
        await repo.insert({
          ...base,
          serviceId: String(item.serviceId),
          customName: null,
        });
      }
    } else if (item.customName) {
      const existing = await repo.findOne({
        where: { providerId, customName: item.customName },
      });
      if (existing) {
        await repo.update({ id: existing.id }, base);
      } else {
        await repo.insert({
          ...base,
          serviceId: null,
          customName: item.customName,
        });
      }
    } else {
      throw new BadRequestException('Each pricing item needs serviceId or customName.');
    }
  }

  /* ─────────────────── Step 6 — Availability ─────────────────── */

  async saveStep6(userId: string, dto: Step6AvailabilityDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);

    // Guard: detect overlapping non-break slots on the same day.
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const byDay = new Map<number, Array<{ s: number; e: number; brk: boolean }>>();
    for (const s of dto.slots) {
      const arr = byDay.get(s.dayOfWeek) ?? [];
      arr.push({
        s: toMin(s.startTime),
        e: toMin(s.endTime),
        brk: !!s.isBreak,
      });
      byDay.set(s.dayOfWeek, arr);
    }
    for (const [day, arr] of byDay.entries()) {
      arr.sort((a, b) => a.s - b.s);
      for (let i = 1; i < arr.length; i++) {
        if (!arr[i].brk && !arr[i - 1].brk && arr[i].s < arr[i - 1].e) {
          throw new BadRequestException(
            `Overlapping availability slots on day ${day}`,
          );
        }
      }
    }

    await this.ds.transaction(async (qr: import('typeorm').EntityManager) => {
      const repo = qr.getRepository(AvailabilityEntity);
      await repo.delete({ providerId: p.id });
      await repo.save(
        dto.slots.map((s) =>
          repo.create({
            providerId: p.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isBreak: !!s.isBreak,
          }),
        ),
      );
    });
    return { providerId: p.id, step: 6, slotCount: dto.slots.length };
  }

  /* ─────────────────── Step 7 — KYC video ─────────────────── */

  async presignKycUpload(userId: string, dto: PreSignKycUploadDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);
    const ext =
      dto.mimeType === 'video/mp4'
        ? 'mp4'
        : dto.mimeType === 'video/quicktime'
        ? 'mov'
        : 'webm';
    const s3Key = `kyc/${p.id}/${randomUUID()}.${ext}`;
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: dto.mimeType,
      ContentLength: dto.sizeBytes,
      ServerSideEncryption: 'AES256',
    });
    const url = await getSignedUrl(this.s3, cmd, {
      expiresIn: this.kycUrlTtlSeconds,
    });
    return { url, s3Key, expiresIn: this.kycUrlTtlSeconds };
  }

  async submitKyc(userId: string, dto: Step7SubmitKycDto) {
    const p = await this.mustGetProvider(userId);
    this.assertEditable(p);

    // S3 key must belong to this provider — prevents impersonation by
    // submitting someone else's uploaded key.
    if (!dto.s3Key.startsWith(`kyc/${p.id}/`)) {
      throw new ForbiddenException('S3 key does not belong to your provider id.');
    }

    // One live KYC per provider (partial unique index). If an 'uploaded'
    // or 'pending_review' row already exists, reject — re-upload only
    // allowed after rejection.
    const existing = await this.kyc.findOne({
      where: [
        { providerId: p.id, status: KycStatus.Uploaded },
        { providerId: p.id, status: KycStatus.PendingReview },
        { providerId: p.id, status: KycStatus.Approved },
      ],
    });
    if (existing) {
      throw new ConflictException(
        'A KYC video is already on file. Wait for review to complete before re-uploading.',
      );
    }

    await this.ds.transaction(async (qr: import('typeorm').EntityManager) => {
      const repo = qr.getRepository(KycVideoEntity);
      await repo.insert({
        providerId: p.id,
        s3Key: dto.s3Key,
        durationSeconds: dto.durationSeconds.toFixed(2),
        sizeBytes: String(dto.sizeBytes),
        mimeType: dto.mimeType,
        status: KycStatus.Uploaded,
      });
      // Submitting KYC flips the provider to pending_review; the
      // thumbnail worker will later flip KYC row to 'pending_review'.
      await qr.getRepository(ProviderEntity).update(
        { id: p.id },
        { status: ProviderStatus.PendingReview },
      );
      await qr.getRepository(OnboardingDraftEntity).delete({ userId });
    });

    this.logger.log(
      JSON.stringify({
        type: 'provider_kyc_submitted',
        providerId: p.id,
        s3Key: dto.s3Key,
        durationSeconds: dto.durationSeconds,
      }),
    );

    return { providerId: p.id, step: 7, status: ProviderStatus.PendingReview };
  }

  /* ─────────────────── Draft autosave / resume ─────────────────── */

  async saveDraft(userId: string, dto: SaveDraftDto) {
    // Try UPDATE first; fall back to INSERT on missing row. Avoids the
    // ON CONFLICT + jsonb_merge complexity for the first write.
    const existing = await this.drafts.findOne({ where: { userId } });
    const merged = { ...(existing?.data ?? {}), ...dto.data };
    const step = dto.step ?? existing?.step ?? 1;
    await this.drafts.save({
      userId,
      step,
      data: merged,
    });
    return { ok: true, step, savedAt: new Date().toISOString() };
  }

  async getDraft(userId: string) {
    const d = await this.drafts.findOne({ where: { userId } });
    const provider = await this.getProvider(userId);
    return {
      step: d?.step ?? 1,
      data: d?.data ?? {},
      providerStatus: provider?.status ?? null,
    };
  }

  /* ─────────────────── Internal ─────────────────── */

  private async mustGetProvider(userId: string): Promise<ProviderEntity> {
    const p = await this.getProvider(userId);
    if (!p) {
      throw new NotFoundException('Complete Step 1 (basic details) first.');
    }
    return p;
  }

  async setOnlineStatus(userId: string, isOnline: boolean): Promise<{ isOnline: boolean }> {
    const provider = await this.mustGetProvider(userId);
    await this.ds
      .getRepository(ProviderEntity)
      .update({ id: provider.id }, { isOnline } as any);
    return { isOnline };
  }

  /**
   * Returns the provider's current KYC / application status visible to the provider themselves.
   * Called by GET /v1/provider/status.
   */
  async getMyStatus(userId: string) {
    const provider = await this.getProvider(userId);
    const draft = await this.drafts.findOne({ where: { userId } });

    if (!provider) {
      return {
        registered: false,
        status: null,
        kycSubmitted: false,
        currentStep: draft?.step ?? 1,
        message: 'Complete your provider application to get started.',
      };
    }

    const statusMessages: Record<string, string> = {
      pending_kyc: 'Your KYC video is pending submission. Please complete Step 7 to submit.',
      kyc_submitted: 'Your KYC is under review. Our team will verify within 1–3 business days.',
      approved: 'Your profile is approved and visible to users. You can accept consultations.',
      rejected: 'Your application was not approved. Please contact support for details.',
      suspended: 'Your account has been suspended. Please contact support.',
    };

    const status = (provider as any).status as string;
    return {
      registered: true,
      status,
      kycSubmitted: ['kyc_submitted', 'approved', 'rejected', 'suspended'].includes(status),
      isOnline: (provider as any).isOnline ?? false,
      currentStep: draft?.step ?? 8,
      message: statusMessages[status] ?? 'Status unknown. Please contact support.',
      rejectionReason: (provider as any).rejectionReason ?? null,
      profileCompletedAt: (provider as any).createdAt ?? null,
    };
  }
}
