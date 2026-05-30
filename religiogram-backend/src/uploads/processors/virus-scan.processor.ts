import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as net from 'net';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { UserFile } from '../entities/user-file.entity';
import { FileHardeningService } from '../file-hardening.service';

export const VIRUS_SCAN_QUEUE = 'virus-scan';
export const VIRUS_SCAN_JOB  = 'scan';

export interface VirusScanJobData {
  fileId: string;
  userId: string;
  key: string;
}

/**
 * Scan a raw buffer through ClamAV's INSTREAM TCP protocol.
 *
 * Protocol (RFC-style):
 *   → client sends: "zINSTREAM\0"
 *   → client sends: [4-byte big-endian length][data bytes]
 *   → client sends: [4-byte 0x00000000]  (terminator)
 *   ← clamd replies: "stream: OK\0"  or  "stream: <virus> FOUND\0"
 *
 * Resolves 'clean'   — file passes ClamAV scan.
 * Resolves 'skipped' — CLAMD_HOST is not configured; scan is bypassed.
 * Rejects            — virus detected or connection failure.
 */
async function clamdScan(
  host: string | undefined,
  port: number,
  data: Buffer,
  timeoutMs = 10_000,
): Promise<'clean' | 'skipped'> {
  if (!host) return 'skipped';

  return new Promise<'clean' | 'skipped'>((resolve, reject) => {
    const socket = new net.Socket();
    let responseRaw = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('ClamAV INSTREAM timeout'));
    }, timeoutMs);

    const finish = (raw: string) => {
      clearTimeout(timer);
      socket.destroy();
      const resp = raw.replace(/\0/g, '').trim();
      if (resp.endsWith('OK')) {
        resolve('clean');
      } else {
        reject(new Error(`ClamAV: ${resp || 'empty response'}`));
      }
    };

    socket.once('connect', () => {
      // Send INSTREAM command (NUL-terminated)
      socket.write('zINSTREAM\0');
      // Send chunk: [4-byte big-endian length][data]
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32BE(data.length);
      socket.write(Buffer.concat([lenBuf, data]));
      // Terminate stream with 4-byte zero
      socket.write(Buffer.alloc(4));
    });

    socket.on('data', (chunk: Buffer) => {
      responseRaw += chunk.toString('binary');
      // clamd sends NUL-terminated response once scanning is done
      if (responseRaw.includes('\0') || responseRaw.length > 256) {
        finish(responseRaw);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on('close', () => {
      if (responseRaw) finish(responseRaw);
      else {
        clearTimeout(timer);
        reject(new Error('ClamAV: connection closed without response'));
      }
    });

    socket.connect(port, host);
  });
}

/**
 * VirusScanProcessor
 *
 * BullMQ worker for the 'virus-scan' queue.  Runs two security passes
 * on every uploaded file before marking it 'scanned':
 *
 *   1. ClamAV INSTREAM scan (if CLAMD_HOST is configured) — detects
 *      known malware.  On a positive hit the file is quarantined and
 *      the job terminates (no retry — the file is definitively bad).
 *
 *   2. FileHardeningService pipeline — magic-byte MIME check,
 *      pixel-area (image-bomb) protection, EXIF strip.
 *
 * If CLAMD_HOST is absent the ClamAV step is skipped; hardening still
 * runs so the file is at least sanitised before serving.
 */
@Processor(VIRUS_SCAN_QUEUE)
export class VirusScanProcessor extends WorkerHost {
  private readonly logger = new Logger(VirusScanProcessor.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly clamdHost: string | undefined;
  private readonly clamdPort: number;

  constructor(
    @InjectRepository(UserFile)
    private readonly files: Repository<UserFile>,
    private readonly hardening: FileHardeningService,
    private readonly config: ConfigService,
  ) {
    super();
    const endpoint = config.get<string>('s3.endpoint');
    this.s3 = new S3Client({
      region: config.get<string>('s3.region') ?? 'auto',
      endpoint,
      credentials: {
        accessKeyId:     config.get<string>('s3.accessKeyId')     ?? '',
        secretAccessKey: config.get<string>('s3.secretAccessKey') ?? '',
      },
      forcePathStyle: !!endpoint,
    });
    this.bucket    = config.get<string>('s3.bucket') ?? '';
    this.clamdHost = config.get<string>('clamd.host');
    this.clamdPort = config.get<number>('clamd.port') ?? 3310;
  }

  async process(job: Job<VirusScanJobData>): Promise<void> {
    const { fileId, key } = job.data;

    try {
      const file = await this.files.findOne({ where: { id: fileId } });
      if (!file) {
        this.logger.warn(`virus-scan: fileId=${fileId} not found — skipping`);
        return;
      }

      // ── Step 1: Download file from S3 once for ClamAV scan ──────────
      const s3res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of s3res.Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      const rawBuf = Buffer.concat(chunks);

      // ── Step 2: ClamAV INSTREAM scan ────────────────────────────────
      const scanResult = await clamdScan(this.clamdHost, this.clamdPort, rawBuf);
      this.logger.log(
        { fileId, key, scanResult, clamdHost: this.clamdHost ?? '(skipped)' },
        'virus-scan: ClamAV result',
      );

      // ── Step 3: Harden — magic-byte + EXIF strip + pixel-area guard ─
      const hardenResult = await this.hardening.hardenFileByKey(key, file.contentType);
      this.logger.log(
        { fileId, key, hardenResult },
        'virus-scan: hardening result',
      );

      await this.files.update({ id: fileId }, { status: 'scanned' });
      this.logger.debug(`virus-scan completed fileId=${fileId}`);

    } catch (err) {
      // ── Permanent content failures — quarantine and do NOT retry ────
      if (err instanceof BadRequestException) {
        // Hardening rejection (MIME mismatch, image bomb, …)
        this.logger.warn(
          { fileId, key, reason: (err as Error).message },
          'virus-scan REJECTED by hardening — quarantining',
        );
        await this.files.update({ id: fileId }, { status: 'quarantined' });
        return;
      }

      const msg = (err as Error).message ?? '';
      if (msg.startsWith('ClamAV:')) {
        // Virus detected by clamd
        this.logger.error(
          { fileId, key, clamdResponse: msg },
          'virus-scan VIRUS DETECTED — quarantining file',
        );
        await this.files.update({ id: fileId }, { status: 'quarantined' });
        return;
      }

      // Transient infrastructure error — re-throw so BullMQ retries with backoff
      throw err;
    }
  }
}
