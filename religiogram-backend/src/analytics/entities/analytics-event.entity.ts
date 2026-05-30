import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Analytics event — a single user-triggered interaction.
 *
 * Design constraints
 * ------------------
 *   - One row per event. Batching lives client-side (the frontend can
 *     flush N events in one POST) so we don't need per-row amortisation
 *     on the server.
 *   - `metadata` is JSONB — shape varies by event_type. Using a
 *     structured column would force a migration every time product
 *     adds a new event; JSONB lets the frontend ship new signals
 *     without a backend change.
 *   - `user_id` is nullable because we may later allow anonymous
 *     analytics (e.g. onboarding funnels pre-auth). For v1 every event
 *     is authenticated, but the column shape is forward-compatible.
 *   - No PII lives in the payload — the service-level validator refuses
 *     keys like `email`, `phone`, `name`. See AnalyticsService.record.
 */
@Entity({ name: 'analytics_events' })
@Index('IDX_analytics_events_type_created', ['eventType', 'createdAt'])
@Index('IDX_analytics_events_user_created', ['userId', 'createdAt'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /**
   * Event type slug. Known values: search_query, temple_click,
   * city_selected, tab_switch. The service validates against an
   * allowlist so a typo on the client doesn't silently poison stats.
   */
  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  /**
   * Request IP — useful for bot triage. Stored as a string (not inet)
   * so it works behind an IPv6 load balancer without schema gymnastics.
   */
  @Column({ type: 'varchar', length: 64, name: 'ip', nullable: true })
  ip!: string | null;

  /** Browser UA at event time — trimmed to 400 chars. */
  @Column({ type: 'varchar', length: 400, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
