import { IsIn, IsString, IsUUID, Length } from 'class-validator';

export const REPORT_TARGET_TYPES = ['event', 'service'] as const;
export type ReportTargetTypeDto = (typeof REPORT_TARGET_TYPES)[number];

/**
 * Body for `POST /api/v1/reports`.
 *
 * Reason is capped at 1000 chars — long enough for a detailed
 * explanation ("This event was cancelled two weeks ago; it's still
 * showing as upcoming"), short enough to keep the row Postgres-page
 * friendly and defeat copy-pasted manifestos.
 *
 * The minimum 10-char floor raises the bar slightly above "spam"
 * or "bad" and nudges the reporter to give the reviewer something
 * actionable to work with.
 */
export class CreateReportDto {
  @IsUUID('4')
  placeId!: string;

  @IsIn(REPORT_TARGET_TYPES as unknown as string[])
  targetType!: ReportTargetTypeDto;

  @IsUUID('4')
  targetId!: string;

  @IsString()
  @Length(10, 1000)
  reason!: string;
}
