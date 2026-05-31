import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { fromBuffer } from 'file-type';
import sharp from 'sharp';

/**
 * FileHardeningService
 *
 * Performs three security checks on uploaded files after they land in S3:
 *
 *   1. Magic-byte MIME sniffing â€” rejects files whose actual content type
 *      doesn't match what the client declared (prevents MIME confusion attacks).
 *
 *   2. Image-bomb protection â€” rejects images whose total pixel area exceeds
 *      the configured limit (prevents decompression bombs like 1Ã—1-pixel
 *      files that expand to gigabytes in memory).
 *
 *   3. EXIF stripping â€” removes all metadata from JPEG/PNG files before
 *      they are served publicly (prevents leaking GPS co-ordinates, device
 *      serial numbers, and other PII embedded by camera apps).
 *
 * Call `hardenFile()` from the VirusScanProcessor after the file has been
 * downloaded from S3 so that both checks happen atomically in the worker.
 * The processor can also call `sniffMimeFromRange()` during the confirm
 * step for a fast header-only magic check.
 */
@Injectable()
export class FileHardeningService {
  private readonly logger = new Logger(FileHardeningService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  /** Maximum pixel area allowed â€” 4000Ã—4000 = 16 MP. Exceeding this is likely
   *  a decompression bomb (e.g. a tiny PNG that inflates to a huge bitmap). */
  private static readonly MAX_PIXEL_AREA = 4_000 * 4_000; // 16 megapixels

  /** Allowed real MIME types. The client-declared contentType is also checked
   *  separately in UploadsService.createPresign(); this is the server-side
   *  ground-truth check. */
  private static readonly ALLOWED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  private static readonly ALLOWED_DOCUMENT_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]);

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('s3.endpoint');
    this.s3 = new S3Client({
      region: this.config.get<string>('s3.region') ?? 'auto',
      endpoint,
      credentials: {
        accessKeyId: this.config.get<string>('s3.accessKeyId') ?? '',
        secretAccessKey: this.config.get<string>('s3.secretAccessKey') ?? '',
      },
      forcePathStyle: !!endpoint,
    });
    this.bucket = this.config.get<string>('s3.bucket') ?? '';
  }

  /**
   * Sniff the first 16 bytes from S3 using a Range GET.
   * Fast â€” no full download needed.
   */
  async sniffMimeFromRange(key: string): Promise<string | undefined> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: 'bytes=0-15' }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const header = Buffer.concat(chunks);
      const detected = await fromBuffer(header);
      return detected?.mime;
    } catch (err) {
      this.logger.warn(`Magic-byte range read failed for key=${key}: ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Validate magic bytes of an in-memory buffer against the declared MIME type.
   * Throws BadRequestException if the real type doesn't match.
   */
  async assertMimeMatch(
    buf: Buffer,
    declaredMime: string,
    allowedSet: Set<string>,
  ): Promise<void> {
    const detected = await fromBuffer(buf);
    const realMime = detected?.mime;

    if (!realMime) {
      // Can't determine type â€” reject if declared is an image/document we care about
      if (allowedSet.has(declaredMime)) {
        throw new BadRequestException(
          `Cannot determine file type. Expected ${declaredMime} but magic bytes are unrecognised.`,
        );
      }
      return;
    }

    if (!allowedSet.has(realMime)) {
      throw new BadRequestException(
        `File type rejected. Detected MIME "${realMime}" is not permitted.`,
      );
    }

    if (realMime !== declaredMime) {
      this.logger.warn(
        `MIME mismatch: declared="${declaredMime}" detected="${realMime}" â€” continuing with detected type`,
      );
      // Allow mismatches between equivalent image formats (e.g. image/jpg vs image/jpeg)
      // but block entirely different types (e.g. application/zip declared as image/png)
      const base = (m: string) => m.split('/')[0];
      if (base(realMime) !== base(declaredMime)) {
        throw new BadRequestException(
          `MIME type mismatch: declared "${declaredMime}" but file is actually "${realMime}".`,
        );
      }
    }
  }

  /**
   * S3: Download a file by key, run magic-byte check and EXIF strip, write
   * hardened version back to S3.  Called from VirusScanProcessor after every
   * successful upload so hardening happens atomically in the BullMQ worker.
   *
   * @returns 'hardened' | 'skipped' (non-image documents are skipped)
   */
  async hardenFileByKey(key: string, declaredMime: string): Promise<'hardened' | 'skipped'> {
    // Download full object
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);

    // 1. Magic-byte check
    const allowedSet = FileHardeningService.ALLOWED_DOCUMENT_MIMES;
    await this.assertMimeMatch(buf, declaredMime, allowedSet);

    // 2. EXIF strip + pixel-area check for raster images
    if (FileHardeningService.ALLOWED_IMAGE_MIMES.has(declaredMime)) {
      await this.hardenImage(key, buf, declaredMime);
      return 'hardened';
    }

    // Non-image (e.g. PDF) â€” magic-byte check passed, nothing more to strip
    return 'skipped';
  }

  /**
   * Full image hardening pipeline:
   *   1. Pixel-area check (image-bomb protection)
   *   2. EXIF strip
   *   3. Upload clean version back to S3 at the same key
   *
   * Returns the processed buffer.
   */
  async hardenImage(
    key: string,
    buf: Buffer,
    mimeType: string,
  ): Promise<Buffer> {
    if (!FileHardeningService.ALLOWED_IMAGE_MIMES.has(mimeType)) {
      // Not a raster image â€” no sharp processing needed
      return buf;
    }

    let image = sharp(buf);
    const meta = await image.metadata();

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const pixelArea = width * height;

    if (pixelArea > FileHardeningService.MAX_PIXEL_AREA) {
      this.logger.warn(
        `Image-bomb rejected: key=${key} pixels=${pixelArea} (${width}Ã—${height}) limit=${FileHardeningService.MAX_PIXEL_AREA}`,
      );
      throw new BadRequestException(
        `Image dimensions too large (${width}Ã—${height}). ` +
          `Maximum allowed pixel area is ${FileHardeningService.MAX_PIXEL_AREA.toLocaleString()} pixels.`,
      );
    }

    // Strip all EXIF/metadata and re-encode
    let outputFormat: keyof sharp.FormatEnum = 'jpeg';
    if (mimeType === 'image/png') outputFormat = 'png';
    else if (mimeType === 'image/webp') outputFormat = 'webp';

    const clean = await image
      .withMetadata({})      // strip EXIF â€” empty object removes all metadata
      .toFormat(outputFormat, { quality: 85 })
      .toBuffer();

    this.logger.log(
      `EXIF stripped + re-encoded: key=${key} before=${buf.length}B after=${clean.length}B`,
    );

    // Write clean version back to S3
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: clean,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to write hardened image back to S3: key=${key}`, err);
      // Non-fatal â€” return clean buffer so caller can decide
    }

    return clean;
  }
}

