/**
 * v9: Named PostgreSQL advisory-lock keys.
 *
 * Centralise every `pg_advisory_xact_lock(<bigint>)` constant in the codebase
 * here so two unrelated subsystems cannot collide on the same magic number.
 *
 * Keys are arbitrary 64-bit integers chosen for memorability via
 * `printf '%d' 0x...` patterns. Always document the *purpose* alongside the
 * value when adding a new key — reviewers should not have to grep to find
 * the owner of a magic number found in pg_locks during an incident.
 */

export const ADVISORY_LOCK_KEYS = {
  /** Serialises writes to `admin_action_logs.hash_chain` (BUG-20). */
  ADMIN_AUDIT_HASH_CHAIN: 9374013267800015n,
} as const;

export type AdvisoryLockKey = keyof typeof ADVISORY_LOCK_KEYS;
