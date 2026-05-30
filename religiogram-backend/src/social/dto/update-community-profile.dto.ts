import { IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';

/**
 * P1-11 (v5): strict validators for community-profile updates.
 *
 * - avatarUrl must be an https URL (no javascript:, data:, off-CDN by your own
 *   downstream allowlist).
 * - displayName / bio length-capped; raw < / > are rejected at the controller
 *   layer via a simple sanitiser.
 *
 * Use this DTO from your community.controller.ts:
 *   updateMyProfile(@Body() dto: UpdateCommunityProfileDto, @Req() req) { ... }
 */
export class UpdateCommunityProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[^<>"\\]*$/, { message: 'displayName cannot contain < > " or backslash' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Matches(/^[^<>]*$/, { message: 'bio cannot contain HTML tags' })
  bio?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2000)
  avatarUrl?: string;
}
