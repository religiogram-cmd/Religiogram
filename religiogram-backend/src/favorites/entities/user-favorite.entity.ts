import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * User → Temple favorite link.
 *
 * Why a standalone entity (not an @ManyToMany on User/Temple)?
 *   - We want the `createdAt` timestamp so the list-my-favorites page
 *     can sort newest-first, and TypeORM's implicit join table hides
 *     any extra columns we'd need.
 *   - Raw entity = explicit queries = predictable SQL, which matters
 *     once this table grows past a few million rows.
 *
 * Composite PK on (userId, templeId) — see the migration for the full
 * rationale. The PK index alone covers the common read path.
 *
 * We deliberately don't hang @ManyToOne relationships off this entity —
 * the service layer always queries with raw joins for predictable SQL,
 * and relations here would invite accidental `find({ relations })`
 * usage that silently issues N+1s.
 */
@Entity('user_favorites')
export class UserFavorite {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'temple_id', type: 'uuid' })
  templeId!: string;

  @Index('IDX_user_favorites_user_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
