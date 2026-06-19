import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileKind, UserFile } from './entities/user-file.entity';
import { THUMB_SIZES, ThumbSize } from './thumbnail.types';
import {
  VIRUS_SCAN_QUEUE,
  VIRUS_SCAN_JOB,
  type VirusScanJobData,
} from './processors/virus-scan.processor';

/**
 * v6 (recovery): uploads.service.ts was truncated in the v3 zip.
 * Reconstructed from the audited contract; PRESIGN_TTL, kind policies, and
 * cleanup behaviour kept identical to what the audit observed in v3.
 */

interface KindPolicy {
  maxSizeBytes: number;
  allowedMime: Set<string>;
  folder: string;
}

const POLICIES: Record<FileKind, KindPolicy> = {
  profile: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMime: new Set(['image/jpeg', 'image/png']),
    folder: 'profile',
  },
  document: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMime: new Set(['image/jpeg', 'image/png', 'application/pdf']),
    folder: 'documents',
  },
  certificate: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMime: new Set(['image/jpeg', 'image/png', 'application/pdf']),
    folder: 'certificates',
  },
};

const PRESIGN_TTL_SECONDS = 300;        // 5 min
const PENDING_TTL_MS = 10 * 60 * 1000;  // 10 min
const DELETE_BATCH = 500;

function extensionFromContentType(ct: string): string {
  return ({
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  } as Record<string, string>)[ct] ?? '';
}

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private s3!: S3Client;
  private bucket!: string;
  private region!: string;
  private publicBaseUrl: string | null = null;

  constructor(
    @InjectRepository(UserFile)
    private readonly files: Repository<UserFile>,
    private readonly config: ConfigService,
    @InjectQueue(VIRUS_SCAN_QUEUE)
    private readonly virusScanQueue: Queue<VirusScanJobData>,
  ) {}

  onModuleInit(): void {
    this.region = this.config.getOrThrow<string>('storage.region');
    this.bucket = this.config.getOrThrow<string>('storage.bucket');
    this.publicBaseUrl = this.config.get<string>('storage.cdnBase') ?? null;

    const r2Endpoint = this.config.get<string>('storage.r2Endpoint');
    const accessKeyId     = this.config.get<string>('storage.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey');

    this.s3 = new S3Client({
      region: this.region,
      ...(r2Endpoint ? { endpoint: r2Endpoint, forcePathStyle: true } : {}),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
    const backend = r2Endpoint ? `R2 (${r2Endpoint})` : `S3 (${this.region})`;
    if (this.config.get<string>('app.env') === 'production' && !this.publicBaseUrl) {
      this.logger.warn(
        `STORAGE_PUBLIC_BASE_URL unset in production (backend=${backend}). ` +
        'User media served directly from object store. Configure a CDN.',
      );
    }
    this.logger.log(`Storage ready => bucket=${this.bucket} backend=${backend} cdn=${this.publicBaseUrl ?? 'none'}`);
  }

  async createPresign(
    userId: string,
    dto: { kind: FileKind; contentType: string; sizeBytes: number; fileName?: string },
  ) {
    const policy = POLICIES[dto.kind];
    if (!policy) throw new BadRequestException('Unsupported upload kind.');

    if (dto.sizeBytes > policy.maxSizeBytes) {
      throw new BadRequestException(
        `File exceeds ${Math.round(policy.maxSizeBytes / 1024 / 1024)} MB limit for ${dto.kind}.`,
      );
    }
    const ct = dto.contentType.toLowerCase();
    if (!policy.allowedMime.has(ct)) {
      throw new BadRequestException(
        `Content type "${dto.contentType}" is not allowed for ${dto.kind}. ` +
          `Allowed: ${[...policy.allowedMime].join(', ')}.`,
      );
    }

    const ext = extensionFromContentType(ct);
    const fileId = randomUUID();
    const key = `users/${userId}/${policy.folder}/${fileId}${ext}`;

    const row = this.files.create({
      id: fileId,
      userId,
      kind: dto.kind,
      key,
      url: this.canonicalUrl(key),
      contentType: ct,
      sizeBytes: dto.sizeBytes,
      status: 'pending',
      originalName: dto.fileName ?? null,
    });
    await this.files.save(row);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: ct,
      ContentLength: dto.sizeBytes,
      Metadata: { 'user-id': userId, 'file-id': fileId, kind: dto.kind },
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: PRESIGN_TTL_SECONDS });

    return {
      fileId,
      uploadUrl,
      key,
      expiresIn: PRESIGN_TTL_SECONDS,
      headers: { 'Content-Type': ct, 'Content-Length': String(dto.sizeBytes) },
      maxSizeBytes: policy.maxSizeBytes,
    };
  }

  /**
   * Sign a 5-min PUT URL for a provider's KYC video.
   *
   * KYC videos live in their own folder under the provider id so the
   * onboarding controller's path check (`kyc/${provider.id}/`) lines up
   * with the key we mint here. Larger ceilings + video MIME types are
   * specific to this flow, so it bypasses the generic POLICIES table.
   */
  async createKycPresign(
    providerId: string,
    contentType: 'video/mp4' | 'video/webm' | 'video/quicktime',
    sizeBytes: number,
  ): Promise<{
    uploadUrl: string;
    r2ObjectKey: string;
    expiresIn: number;
    headers: Record<string, string>;
    maxSizeBytes: number;
  }> {
    const KYC_MAX = 60 * 1024 * 1024; // 60 MB
    if (sizeBytes < 1 || sizeBytes > KYC_MAX) {
      throw new BadRequestException(`KYC video must be 1B–${Math.round(KYC_MAX / 1024 / 1024)}MB`);
    }
    const ext = ({
      'video/mp4':         '.mp4',
      'video/webm':        '.webm',
      'video/quicktime':   '.mov',
    } as Record<string, string>)[contentType];
    if (!ext) throw new BadRequestException(`Unsupported KYC mime type: ${contentType}`);

    const fileId = randomUUID();
    const key = `kyc/${providerId}/${fileId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { 'provider-id': providerId, 'kind': 'kyc-video' },
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: PRESIGN_TTL_SECONDS });

    return {
      uploadUrl,
      r2ObjectKey: key,
      expiresIn: PRESIGN_TTL_SECONDS,
      headers: { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      maxSizeBytes: KYC_MAX,
    };
  }

  /**
   * Sign a 5-min PUT URL for a provider's KYC image (PAN card or selfie).
   *
   * Lives in the same `kyc/<providerId>/` prefix as the video so the
   * existing IDOR guard (`r2ObjectKey.startsWith('kyc/<providerId>/')`)
   * applies unchanged. `kind` is encoded into the filename so admins can
   * tell PAN cards from selfies at a glance when listing the folder.
   */
  async createKycImagePresign(
    providerId: string,
    contentType: 'image/jpeg' | 'image/png' | 'image/webp',
    sizeBytes: number,
    kind: 'pan' | 'selfie',
  ): Promise<{
    uploadUrl: string;
    r2ObjectKey: string;
    expiresIn: number;
    headers: Record<string, string>;
    maxSizeBytes: number;
  }> {
    const IMG_MAX = 8 * 1024 * 1024; // 8 MB
    if (sizeBytes < 1 || sizeBytes > IMG_MAX) {
      throw new BadRequestException(
        `KYC image must be 1B–${Math.round(IMG_MAX / 1024 / 1024)}MB`,
      );
    }
    const ext = ({
      'image/jpeg': '.jpg',
      'image/png':  '.png',
      'image/webp': '.webp',
    } as Record<string, string>)[contentType];
    if (!ext) throw new BadRequestException(`Unsupported KYC image mime type: ${contentType}`);

    const fileId = randomUUID();
    const key = `kyc/${providerId}/${kind}-${fileId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { 'provider-id': providerId, 'kind': `kyc-${kind}` },
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: PRESIGN_TTL_SECONDS });

    return {
      uploadUrl,
      r2ObjectKey: key,
      expiresIn: PRESIGN_TTL_SECONDS,
      headers: { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      maxSizeBytes: IMG_MAX,
    };
  }

  /**
   * Sign a 5-min PUT URL for a place gallery image.
   *
   * Images land at `places/${placeId}/gallery/${uuid}${ext}` so the
   * frontend can persist the resulting URL via POST /v1/places/:id/gallery.
   * Caps file size at 10 MB and content type at jpg/png/webp.
   */
  async createPlaceGalleryPresign(
    placeId: string,
    contentType: 'image/jpeg' | 'image/png' | 'image/webp',
    sizeBytes: number,
  ): Promise<{
    uploadUrl: string;
    objectKey: string;
    publicUrl: string;
    expiresIn: number;
    headers: Record<string, string>;
    maxSizeBytes: number;
  }> {
    const GALLERY_MAX = 10 * 1024 * 1024; // 10 MB
    if (sizeBytes < 1 || sizeBytes > GALLERY_MAX) {
      throw new BadRequestException(`Gallery image must be 1B–${Math.round(GALLERY_MAX / 1024 / 1024)}MB`);
    }
    const ext = ({
      'image/jpeg': '.jpg',
      'image/png':  '.png',
      'image/webp': '.webp',
    } as Record<string, string>)[contentType];
    if (!ext) throw new BadRequestException(`Unsupported gallery mime type: ${contentType}`);

    const fileId = randomUUID();
    const key = `places/${placeId}/gallery/${fileId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { 'place-id': placeId, 'kind': 'place-gallery' },
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: PRESIGN_TTL_SECONDS });

    return {
      uploadUrl,
      objectKey: key,
      publicUrl: this.canonicalUrl(key),
      expiresIn: PRESIGN_TTL_SECONDS,
      headers: { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      maxSizeBytes: GALLERY_MAX,
    };
  }

  async confirm(userId: string, fileId: string): Promise<UserFile> {
    const row = await this.files.findOne({ where: { id: fileId } });
    if (!row) throw new NotFoundException('Upload not found.');
    if (row.userId !== userId) throw new NotFoundException('Upload not found.');
    if (row.status === 'confirmed') return row;

    let head;
    try {
      head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: row.key }));
    } catch (err) {
      this.logger.warn(`Confirm failed — object missing: user=${userId} file=${fileId} key=${row.key}`);
      throw new BadRequestException('Upload not found on storage. Did the PUT complete?');
    }
    if (head.ContentLength && Number(head.ContentLength) !== Number(row.sizeBytes)) {
      this.logger.warn(`Confirm size mismatch: declared=${row.sizeBytes} actual=${head.ContentLength}`);
      throw new BadRequestException('Uploaded file size does not match.');
    }

    row.status = 'confirmed';
    row.sizeBytes = Number(head.ContentLength ?? row.sizeBytes);
    await this.files.save(row);

    this.virusScanQueue
      .add(VIRUS_SCAN_JOB, { fileId: row.id, userId: row.userId, key: row.key },
        { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } })
      .catch((err: Error) => this.logger.warn(`Failed to enqueue virus scan for ${row.id}: ${err.message}`));

    return row;
  }

  listByKind(userId: string, kind: FileKind): Promise<UserFile[]> {
    return this.files.find({
      where: { userId, kind, status: 'confirmed' },
      order: { createdAt: 'DESC' },
    });
  }

  async getOwned(userId: string, fileId: string): Promise<UserFile> {
    const row = await this.files.findOne({ where: { id: fileId } });
    if (!row || row.userId !== userId) throw new NotFoundException('File not found.');
    return row;
  }

  async sweepExpired(): Promise<{ rowsFound: number; s3Deleted: number; dbDeleted: number }> {
    const cutoff = new Date(Date.now() - PENDING_TTL_MS);
    const rows = await this.files.find({
      where: { status: 'pending', createdAt: LessThan(cutoff) },
      take: 2000,
    });
    if (rows.length === 0) return { rowsFound: 0, s3Deleted: 0, dbDeleted: 0 };

    this.logger.log(`Sweep: ${rows.length} expired pending upload(s) to clean up`);
    let s3Deleted = 0, dbDeleted = 0;
    for (let i = 0; i < rows.length; i += DELETE_BATCH) {
      const batch = rows.slice(i, i + DELETE_BATCH);
      try {
        const res = await this.s3.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((r) => ({ Key: r.key })), Quiet: true },
        }));
        const failedKeys = new Set((res.Errors ?? []).map((e) => e.Key ?? ''));
        const okBatch = batch.filter((r) => !failedKeys.has(r.key));
        s3Deleted += okBatch.length;
        if (okBatch.length) {
          await this.files.delete(okBatch.map((r) => r.id));
          dbDeleted += okBatch.length;
        }
        if (failedKeys.size) {
          this.logger.warn(`Sweep: S3 refused ${failedKeys.size} object(s); will retry next cycle`);
        }
      } catch (err) {
        this.logger.error(`Sweep batch failed: ${(err as Error).message}. Will retry next cycle.`);
      }
    }
    this.logger.log(`Sweep done: rowsFound=${rows.length} s3Deleted=${s3Deleted} dbDeleted=${dbDeleted}`);
    return { rowsFound: rows.length, s3Deleted, dbDeleted };
  }

  getThumbnailUrl(key: string, size: ThumbSize): string {
    if (!THUMB_SIZES.includes(size)) {
      this.logger.warn(`getThumbnailUrl called with unsupported size ${size}, returning original`);
      return this.canonicalUrl(key);
    }
    const keyWithoutExt = key.replace(/\.[^.]+$/, '');
    const thumbKey = `thumbnails/${size}/${keyWithoutExt}.webp`;
    return this.canonicalUrl(thumbKey);
  }

  private canonicalUrl(key: string): string {
    if (this.publicBaseUrl) return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
