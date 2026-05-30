import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REVIEW_ACTIONS = ['approve', 'reject'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/**
 * Body for `PATCH /api/v1/admin/reports/:id/review`.
 *
 * `action` is carried in the body (not the route) because the same
 * admin UI often needs to toggle between "approve with a note" and
 * "reject with a note" — a single PATCH endpoint keeps the admin
 * page's dispatch logic flat.
 *
 * approve → target row is hidden (`is_hidden = true`), report goes to
 *           `reviewed`.
 * reject  → target untouched, report goes to `rejected`.
 */
export class ReviewReportDto {
  @IsIn(REVIEW_ACTIONS as unknown as string[])
  action!: ReviewAction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
