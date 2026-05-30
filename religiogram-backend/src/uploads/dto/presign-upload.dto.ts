import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { FileKind } from '../entities/user-file.entity';

export const ALLOWED_PRESIGN_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export class PresignUploadDto {
  @IsIn(['profile', 'document', 'certificate'])
  kind!: FileKind;

  /** MIME type for the S3 PUT — gated against the allowed-types union. */
  @IsIn(ALLOWED_PRESIGN_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_PRESIGN_CONTENT_TYPES)[number];

  /**
   * Exact byte size of the file the client intends to upload.
   * Validated against the per-kind size cap in uploads.service.ts.
   */
  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024) // 20 MB ceiling (service enforces tighter per-kind limits)
  sizeBytes!: number;

  /** Original filename — stored as S3 object metadata only, never used as a path. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  fileName?: string;
}
