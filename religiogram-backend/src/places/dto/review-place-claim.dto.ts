import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for admin approve/reject endpoints. The decision itself
 * (`approve` vs `reject`) is carried by the route, not the body —
 * keeps the admin UI explicit and removes a failure mode where an
 * approve endpoint gets posted a body with `decision: 'reject'`.
 *
 * adminNotes is optional on approve (we might just welcome them) but
 * strongly encouraged on reject (the user deserves a reason). We do
 * not enforce "required on reject" server-side so the admin tool can
 * prefill a standard rejection message.
 */
export class ReviewPlaceClaimDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}
