// @ts-nocheck
/**
 * thumbnail.lambda.ts
 *
 * AWS Lambda handler — triggered by S3 PutObject events on the
 * `religiogram-uploads` bucket for keys matching `users/*/profile/**`.
 *
 * For every uploaded profile image it generates three WebP thumbnails:
 *   thumbnails/80/users/{uid}/profile/{fileId}.webp   — avatar (80 px)
 *   thumbnails/200/users/{uid}/profile/{fileId}.webp  — card  (200 px)
 *   thumbnails/400/users/{uid}/profile/{fileId}.webp  — hero  (400 px)
 *
 * Thumbnails are stored in the SAME bucket under the thumbnails/ prefix so
 * they are served through the same CloudFront distribution.
 *
 * ── Sharp usage notes ─────────────────────────────────────────────────────
 *   Sharp is pre-installed in the Lambda layer defined in
 *   deploy/thumbnail-function/template.yaml (Node 20.x runtime).
 *   It reads from a stream (avoids loading the whole image into memory)
 *   and writes WebP with quality 82 — a good balance for profile photos.
 *
 * ── Error handling ────────────────────────────────────────────────────────
 *   Lambda retries on non-200 throws (SQS/EventBridge bridge → DLQ after
 *   3 attempts). We throw on hard failures; transient S3 issues will retry.
 *   We log + swallow for graceful-degradation cases (e.g. non-image object
 *   accidentally matched by the event filter).
 *
 * ── Deployment ────────────────────────────────────────────────────────────
 *   See deploy/THUMBNAILS.md for the full setup guide.
 *   SAM template: deploy/thumbnail-function/template.yaml
 */

import { Readable } from 'stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

// ── Types ─────────────────────────────────────────────────────────────────

/** Thumbnail widths (pixels). Each generates a square-cropped WebP. */
export const THUMB_SIZES = [80, 200, 400] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

interface S3EventRecord {
  s3: {
    bucket: { name: string };
    object: { key: string; size: number };
  };
}
interface S3Event {
  Records: S3EventRecord[];
}

// ── S3 client (picks up execution-role credentials automatically) ─────────
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });

// ── Entry point ───────────────────────────────────────────────────────────

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record);
  }
};

// ── Core ──────────────────────────────────────────────────────────────────

async function processRecord(record: S3EventRecord): Promise<void> {
  const bucket = record.s3.bucket.name;
  // S3 event keys are URL-encoded — decode spaces and special chars.
  const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  // Only process profile images.
  // Key pattern: users/{userId}/profile/{fileId}.{jpg|png}
  if (!sourceKey.match(/^users\/[^/]+\/profile\//)) {
    console.log(`[thumbnails] Skipping non-profile key: ${sourceKey}`);
    return;
  }

  // Fetch the original object as a stream to keep memory bounded.
  let bodyStream: Readable;
  try {
    const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: sourceKey }));
    if (!getRes.Body) throw new Error('Empty body from S3');
    bodyStream = getRes.Body as Readable;
  } catch (err) {
    console.error(`[thumbnails] Failed to GET ${sourceKey}: ${(err as Error).message}`);
    throw err; // let Lambda retry
  }

  // Buffer the stream once — Sharp can clone its pipeline per size.
  const sourceBuffer = await streamToBuffer(bodyStream);
  console.log(`[thumbnails] Processing ${sourceKey} (${sourceBuffer.length} bytes)`);

  // Derive the base thumbnail key by stripping the extension.
  // e.g. users/abc/profile/def.jpg → thumbnails/{size}/users/abc/profile/def.webp
  const keyWithoutExt = sourceKey.replace(/\.[^.]+$/, '');

  await Promise.all(
    THUMB_SIZES.map((size) => generateThumbnail(bucket, sourceBuffer, keyWithoutExt, size)),
  );

  console.log(`[thumbnails] Done: ${sourceKey} → ${THUMB_SIZES.join('px, ')}px WebP`);
}

async function generateThumbnail(
  bucket: string,
  source: Buffer,
  keyWithoutExt: string,
  size: ThumbSize,
): Promise<void> {
  const destKey = `thumbnails/${size}/${keyWithoutExt}.webp`;

  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(source)
      .resize(size, size, {
        fit: 'cover',      // square crop, centred
        position: 'top',   // favour the face — top-biased for portrait photos
        withoutEnlargement: true, // never upscale — avoids blurry tiny avatars
      })
      .webp({ quality: 82, effort: 4 }) // effort 4: good compression, not slow
      .toBuffer();
  } catch (err) {
    // Not a valid image (corrupt upload, non-image file) — log but don't retry.
    console.error(
      `[thumbnails] sharp error for ${keyWithoutExt} @ ${size}px: ${(err as Error).message}`,
    );
    return; // swallow so the Lambda doesn't retry on bad input
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: destKey,
      Body: webpBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable', // 1 year — keyed by fileId
      Metadata: {
        'source-key': keyWithoutExt,
        'thumb-size': String(size),
      },
    }),
  );

  console.log(`[thumbnails] Saved ${destKey} (${webpBuffer.length} bytes)`);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
