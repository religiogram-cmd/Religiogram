import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProviderReligion } from '../entities/provider.entity';
import { ServiceMode } from '../entities/provider-service.entity';

/* ─────────────────── Step 1 — Basic details ─────────────────── */

export class Step1BasicDetailsDto {
  @IsString()
  @Length(2, 120, { message: 'Full name must be 2-120 characters' })
  fullName!: string;

  @IsDateString({}, { message: 'DOB must be ISO date (YYYY-MM-DD)' })
  dob!: string;

  /** Phone is auto-filled from the logged-in user, but we still accept it on
   *  submit so the client can echo what it displayed — we compare it against
   *  the token to prevent tampering. */
  @Matches(/^\d{10}$/, { message: 'phone must be 10 digits' })
  phone!: string;

  @IsString()
  @Length(2, 120)
  city!: string;
}

/* ─────────────────── Step 2 — Professional info ─────────────────── */

export class Step2ProfessionalInfoDto {
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears!: number;

  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one language' })
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages!: string[];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;
}

/* ─────────────────── Step 3 — Religion ─────────────────── */

export class Step3ReligionDto {
  @IsEnum(ProviderReligion, { message: 'Invalid religion' })
  religion!: ProviderReligion;
}

/* ─────────────────── Step 4 — Services selection ───────────────────
 * Client sends an array of catalogue serviceIds + an array of custom
 * ("Other") names. Pricing lives in Step 5.
 */

export class Step4SelectedServicesDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMaxSize(50)
  serviceIds!: number[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: 'At most 10 custom services at onboarding' })
  customServiceNames!: string[];
}

/* ─────────────────── Step 5 — Pricing ─────────────────── */

export class PricingItemDto {
  /** One of serviceId OR customName must be present. */
  @ValidateIf((o: any) => !o.customName)
  @IsInt()
  serviceId?: number;

  @ValidateIf((o: any) => !o.serviceId)
  @IsString()
  @Length(2, 160)
  customName?: string;

  /** Paise. 1 rupee = 100 paise. */
  @IsInt()
  @Min(0)
  @Max(100_00_00_000)
  basePricePaise!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  travelFeePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  addonFeePaise?: number;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @IsEnum(ServiceMode)
  mode!: ServiceMode;
}

export class Step5PricingDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Set pricing for at least one service' })
  @ValidateNested({ each: true })
  @Type(() => PricingItemDto)
  items!: PricingItemDto[];
}

/* ─────────────────── Step 6 — Availability ─────────────────── */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class AvailabilitySlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_RE, { message: 'startTime must be HH:MM (24h)' })
  startTime!: string;

  @Matches(TIME_RE, { message: 'endTime must be HH:MM (24h)' })
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

export class Step6AvailabilityDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Add at least one availability slot' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}

/* ─────────────────── Step 7 — KYC video ─────────────────── */

export class PreSignKycUploadDto {
  @Matches(/^video\/(webm|mp4|quicktime)$/, {
    message: 'mimeType must be webm / mp4 / quicktime',
  })
  mimeType!: string;

  @IsInt()
  @IsPositive()
  @Max(100 * 1024 * 1024, { message: 'Max file size 100 MB' })
  sizeBytes!: number;
}

export class Step7SubmitKycDto {
  @IsString()
  @Length(10, 512)
  s3Key!: string;

  @IsInt()
  @Min(30, { message: 'Video must be at least 30 seconds long' })
  @Max(600)
  durationSeconds!: number;

  @IsInt()
  @IsPositive()
  @Max(100 * 1024 * 1024)
  sizeBytes!: number;

  @Matches(/^video\/(webm|mp4|quicktime)$/)
  mimeType!: string;
}

/* ─────────────────── Draft autosave ─────────────────── */

export class SaveDraftDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  step?: number;

  /** Partial form state — merged server-side into the existing blob. */
  data!: Record<string, unknown>;
}
