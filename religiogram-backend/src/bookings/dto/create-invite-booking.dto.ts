import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * Invite-a-Priest booking — free-form ceremony request, not catalog-driven.
 *
 * Used by the Hindu / Muslim / Sikh / Christian "Invite a Pandit / Imam /
 * Granthi / Priest" flow on the frontend (PriestInviteBookingScreen.tsx).
 *
 * Unlike CreateBookingDto, this does NOT require a serviceId UUID — the
 * customer types the ceremony name themselves. PricingService applies the
 * priest's standard rate (from their price-card) at confirm time; the
 * ceremony name is stored in `notes` for the priest to read.
 */
export enum InviteFaith {
  HINDU = 'hindu',
  MUSLIM = 'muslim',
  SIKH = 'sikh',
  CHRISTIAN = 'christian',
}

export enum InviteVenue {
  HOME = 'home',
  VENUE = 'venue',
  PLACE_OF_WORSHIP = 'place_of_worship',
}

export class CreateInviteBookingDto {
  /** 'draft' on the Find-Priests step, 'confirm' on the Pay step. */
  @IsEnum(['draft', 'confirm'] as const)
  status!: 'draft' | 'confirm';

  @IsEnum(InviteFaith)
  faith!: InviteFaith;

  @IsString()
  @MinLength(3)
  @Length(0, 120)
  ceremony!: string;

  /** ISO-8601 e.g. "2026-06-15T10:00:00Z" */
  @IsISO8601({ strict: true })
  scheduledAt!: string;

  @IsEnum(InviteVenue)
  venue!: InviteVenue;

  @IsString()
  @MinLength(5)
  @Length(0, 250)
  address!: string;

  @IsString()
  @MinLength(2)
  @Length(0, 60)
  city!: string;

  @IsString()
  @MinLength(2)
  @Length(0, 80)
  contactName!: string;

  @Matches(/^[6-9]\d{9}$/, { message: 'contactPhone must be a 10-digit Indian mobile' })
  contactPhone!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  /**
   * Set on the confirm leg only — the priest the user selected from the
   * Find-Priests list. Omitted on the draft leg.
   */
  @IsOptional()
  @IsString()
  priestId?: string;

  /** Original draft id returned by the draft leg; used to link draft → confirm. */
  @IsOptional()
  @IsString()
  requestId?: string;
}
