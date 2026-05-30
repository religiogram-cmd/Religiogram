# ReligioGram — Image Thumbnail Pipeline

## Overview

Every profile photo uploaded via the presigned S3 URL flow is automatically
resized to three square-cropped WebP variants:

| Size   | Use case                          | Key path                                  |
|--------|-----------------------------------|-------------------------------------------|
| 80 px  | Avatar bubbles, comment headers   | `thumbnails/80/users/{uid}/profile/*.webp`  |
| 200 px | Provider cards, search results    | `thumbnails/200/users/{uid}/profile/*.webp` |
| 400 px | Full-size avatar on profile page  | `thumbnails/400/users/{uid}/profile/*.webp` |

All variants are stored in the same S3 bucket and served through CloudFront
with `Cache-Control: public, max-age=31536000, immutable` (1-year TTL, keyed
by the immutable `fileId`).

---

## Architecture

```
  Mobile app
      │ PUT (presigned URL)
      ▼
  S3 bucket (religiogram-uploads)
      │ PutObject event  [filter: users/*/profile/*.jpg, *.png]
      ▼
  Lambda: religiogram-thumbnails
      │ Sharp resize → 80 / 200 / 400 px WebP
      ▼
  S3 bucket (thumbnails/{size}/users/{uid}/profile/*.webp)
      │
      ▼
  CloudFront CDN  ← API returns getThumbnailUrl(key, size)
```

The Lambda is **asynchronous** — the upload `confirm` endpoint returns
immediately and thumbnails are ready within ~500 ms. The API falls back to
the original image URL if the thumbnail does not yet exist.

---

## Lambda Implementation

`src/uploads/thumbnail.lambda.ts` — TypeScript Lambda handler bundled with
esbuild by SAM. Key behaviour:

- Reads the S3 object as a stream (memory-efficient for 5 MB source images).
- Uses **Sharp** (arm64 Lambda layer) with `fit: cover, position: top` to
  produce face-biased square crops.
- Writes WebP with `quality: 82, effort: 4` — good ratio of size vs. quality.
- Generates all three sizes in parallel with `Promise.all`.
- On Sharp error (corrupt/non-image file) it logs and swallows — no Lambda
  retry for bad input. On S3 errors it throws to trigger Lambda retry.

---

## Deploying with SAM

### Prerequisites

```bash
# Install AWS SAM CLI (≥ 1.85)
brew install aws/tap/aws-sam-cli   # macOS
# or: pip install aws-sam-cli

# Install esbuild (SAM uses it to bundle TypeScript)
npm install -g esbuild

# Configure AWS credentials with permission to deploy Lambda + S3 + IAM
aws configure
```

### Build & deploy

```bash
cd deploy/thumbnail-function

# Bundle TypeScript → CommonJS and create deployment artifact
sam build

# First deploy (creates stack): prompts for confirmation
sam deploy --config-env prod --guided

# Subsequent deploys
sam deploy --config-env prod
```

SAM will:
1. Bundle `src/uploads/thumbnail.lambda.ts` with esbuild.
2. Upload the ZIP to a SAM-managed S3 bucket.
3. Create/update the CloudFormation stack `religiogram-thumbnails`.
4. Wire the S3 event notification on the uploads bucket.
5. Print the Lambda ARN as a stack output.

### Sharp Lambda layer

Sharp requires native binaries compiled for the Lambda runtime. Use the
community-maintained layer:

1. Go to https://github.com/Umkus/lambda-layer-sharp/releases
2. Find the **arm64 + Node 20 + ap-south-1** ARN for the latest release.
3. Set it in `template.yaml` under `ThumbnailFunction.Layers`.

Alternatively, build your own layer:

```bash
mkdir sharp-layer && cd sharp-layer
npm init -y
npm install sharp@0.33.5
zip -r ../sharp-arm64.zip node_modules/
aws s3 cp ../sharp-arm64.zip s3://religiogram-uploads/lambda-layers/sharp-arm64.zip
```

---

## API Usage

`UploadsService.getThumbnailUrl(key, size)` returns the CloudFront URL for
a given thumbnail size. Call it wherever you need a resized avatar:

```typescript
// In UsersService, ProfileService, etc.:
const avatarUrl = this.uploadsService.getThumbnailUrl(user.avatarKey, 200);
```

The method is already exported from `UploadsModule` and injectable anywhere
that imports it.

---

## CloudFront Cache Invalidation

Thumbnails are immutable (keyed by `fileId` UUID). A user who re-uploads
their profile photo gets a **new** `fileId`, so the old thumbnail URL simply
stops being used. **No cache invalidation is needed.**

---

## Local Development

Thumbnails are disabled in local dev (`THUMBNAIL_ENABLED=false` in
`.env.example`). `getThumbnailUrl` still returns a URL — it just points to
the (non-existent) thumbnail path. Your local frontend should gracefully
fall back when the `<img>` 404s, or you can point directly at the original
key URL for dev testing.

To test the Lambda locally:

```bash
# Install SAM + Docker (Docker is required for local Lambda emulation)
sam local invoke ThumbnailFunction \
  --event test-events/s3-put.json \
  --env-vars env.json
```

Example `test-events/s3-put.json`:

```json
{
  "Records": [{
    "s3": {
      "bucket": { "name": "religiogram-uploads" },
      "object": { "key": "users/test-user/profile/test-file.jpg", "size": 102400 }
    }
  }]
}
```

---

## Monitoring

- **CloudWatch Logs**: `/aws/lambda/religiogram-thumbnails` — one log group
  per invocation with structured JSON output.
- **DLQ alarm**: `religiogram-thumbnail-dlq-depth` — fires when any message
  lands in the SQS dead-letter queue (3 failed attempts). Investigate the
  DLQ message for the failing S3 key.
- **Lambda duration P99**: target < 5 s for a 5 MB JPEG → 3 × WebP. If
  consistently above this, increase `MemorySize` in `template.yaml`.

---

## Cost Estimate (1 M uploads/month)

| Resource         | Units         | Est. cost (USD/month) |
|------------------|---------------|-----------------------|
| Lambda invocations | 1 M × $0.20/1M | $0.20 |
| Lambda GB-sec    | 1M × 512 MB × ~1 s avg | ~$4.17 |
| S3 PutObject     | 3 M (3 sizes) | $0.15 |
| S3 storage (WebP) | ~30 GB (avg 10 KB/thumb) | $0.69 |
| **Total**        |               | **~$5.21** |

CloudFront egress is separate and depends on traffic, but WebP thumbnails
are 60–80% smaller than the source JPEG, substantially reducing CDN costs.
