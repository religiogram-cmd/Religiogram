import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * onboarding_drafts — serialized wizard state, one row per user.
 *
 * Client autosaves on a 3-second debounce (PATCH /provider/draft). The
 * server merges `data` with the existing JSONB blob and bumps `step` to
 * the highest step the user has reached so "resume later" can jump right
 * back in.
 *
 * We use PATCH-semantics (server merges) not PUT because a form with 80
 * fields across 7 screens would thrash the network on every keystroke if
 * we replaced the whole blob each time. Merge is cheap (jsonb_set) and
 * concurrent edits across tabs don't race — the server collapses them.
 */
@Entity({ name: 'onboarding_drafts' })
export class OnboardingDraftEntity {
  // The database column is UUID (see migration 1700000000012). Previously
  // this was declared `bigint`, which caused TypeORM to bind the userId as
  // a numeric parameter — PostgreSQL then rejected the WHERE clause because
  // a UUID string like 'abc-def-…' is not a valid bigint. That was the
  // "GET /provider/onboarding/start → 500" the client was retrying
  // indefinitely.
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'step', type: 'smallint', default: 1 })
  step!: number;

  @Column({ name: 'data', type: 'jsonb', default: () => "'{}'::jsonb" })
  data!: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
