import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Body for `POST /api/v1/places/:id/claim`.
 *
 * Evidence is required (without it the admin has nothing to decide on).
 * Either email or phone is expected — we validate that at the service
 * layer because class-validator's `ValidateIf` cross-field gets gnarly.
 */
export class CreatePlaceClaimDto {
  /**
   * Prose justification + supporting links. Capped at 4000 chars — well
   * beyond what any legitimate claim needs, keeps the Postgres page
   * sane, and blocks accidentally-pasted novels.
   */
  @IsString()
  @Length(20, 4000)
  claimEvidence!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  /**
   * Loose E.164-ish pattern. We don't call an SMS gateway here so a
   * looser validation is fine — the admin will read and verify manually.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\-\s()]{7,20}$/, { message: 'contactPhone must look like a phone number' })
  @MaxLength(20)
  contactPhone?: string;
}
