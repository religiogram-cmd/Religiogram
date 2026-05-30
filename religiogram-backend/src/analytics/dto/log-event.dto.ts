import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';

/**
 * Known event types. Kept in sync with `lib/analytics.ts` on the client.
 * Adding a new type requires updating both sides — cheap, and forces
 * product to articulate what they want to learn before shipping a new
 * beacon.
 */
export const ANALYTICS_EVENT_TYPES = [
  'search_query',
  'temple_click',
  'city_selected',
  'tab_switch',
  'location_permission',
  'notification_permission',
  // Retention — tracks heart taps so we can measure the save-rate per
  // surface (list card vs. detail hero) and the correlation between
  // "first save" and week-2 return.
  'favorite_toggle',
  // Moderation — counts reports submitted and resolved so we can
  // tune the review SLA and spot abuse spikes.
  'report_submitted',
  'report_resolved',
  // Location Intelligence — measures discovery value of the "Nearby
  // Places" strip under the profile. `nearby_viewed` fires when the
  // section enters the viewport; `nearby_clicked` when a card is tapped.
  'nearby_viewed',
  'nearby_clicked',
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * POST /analytics/event body.
 *
 * `metadata` is a free-form JSON object per event type. The service
 * further sanitises it to prevent accidental PII leakage.
 */
export class LogEventDto {
  @IsString()
  @IsIn(ANALYTICS_EVENT_TYPES as unknown as string[])
  eventType!: AnalyticsEventType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /**
   * Optional client timestamp for later reconciliation with server
   * time (e.g. to detect clock skew in mobile clients). We don't trust
   * it for storage — the DB stamps created_at at insert.
   */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  clientTs?: string;
}
