import { IsUUID } from 'class-validator';

/**
 * POST /uploads/confirm body.
 *
 * Called by the client after a successful PUT to the pre-signed URL.
 * The server HEADs the object to verify it exists, matches the declared
 * size/content-type, then flips status from `pending` → `confirmed`.
 *
 * Why require confirmation? The PUT is client-to-S3 and the backend
 * never sees it. Without this step, we'd have no way to know whether
 * the upload actually landed, and the user_files row would advertise
 * an object that doesn't exist.
 */
export class ConfirmUploadDto {
  @IsUUID('4')
  fileId!: string;
}
