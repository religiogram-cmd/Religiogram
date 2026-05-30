import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Profile entity — the fuller identity captured by the multi-step wizard.
 *
 * Separated from `users` on purpose:
 *   - `users` holds auth-critical, mostly-small fields. Kept hot in cache.
 *   - `profiles` holds the free-form wizard output, which is often empty
 *     during the first minutes of a session and can balloon in size as
 *     product adds more steps. Keeping it in its own row lets us avoid
 *     rewriting the users row on every keystroke.
 *
 * The `data` column is JSONB so product can add new fields without a
 * migration on the critical path. Hot fields that need indexing (city,
 * interests, etc.) can be promoted into typed columns later.
 *
 * One-to-one with users. We use user_id as both PK and FK — a user has
 * exactly one profile row; we never want a second one hanging around.
 */
@Entity('profiles')
export class Profile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /**
   * Wizard step the user has reached (0-indexed). Used to resume.
   * `completed === true` means the wizard finished — `step` then represents
   * the last step viewed and is mostly informational.
   */
  @Column({ type: 'smallint', default: 0 })
  step!: number;

  /**
   * Free-form bag of wizard-owned fields. PATCH deep-merges into this.
   * Keep it small-ish (under ~16 KB) — PostgreSQL can store TOAST'd JSONB
   * far bigger than that, but the API round-trips every time.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data!: Record<string, unknown>;

  @Index('IDX_profiles_completed')
  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
