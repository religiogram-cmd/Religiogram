import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Single DTO for both POST (create) and PATCH (update).
 *
 * Every field is optional because:
 *   - POST is idempotent — calling with an empty body just initialises a
 *     blank profile row for the authenticated user.
 *   - PATCH is a deep-merge — the caller sends only what changed.
 *
 * The `data` blob is intentionally `IsObject` (not whitelisted) because
 * each wizard step owns its own field set. Per-step server-side validation
 * is the right place for stricter rules; we don't want this DTO to need a
 * code change every time product adds a field.
 *
 * Hard limits to keep stupid clients honest:
 *   - step: 0 ≤ step ≤ 20 (we'll never have 20 wizard steps; this is a
 *     guard against integer overflow / negative junk).
 *   - data: must be a plain object. Size is checked downstream (the
 *     service rejects payloads > 16 KB to keep the JSONB column happy).
 */
export class UpsertProfileDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  step?: number;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
