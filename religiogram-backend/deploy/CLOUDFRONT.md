# CloudFront + Private S3 Setup

This is the **required** production topology for user media. The goal:

- S3 bucket is **fully private** (no public ACLs, public access blocked at the account level)
- CloudFront distribution serves all reads via Origin Access Control (OAC)
- The API only ever signs **PUT** URLs against S3; **GET** traffic goes through CloudFront
- `AWS_S3_PUBLIC_BASE_URL` points the API at the CloudFront domain so URLs returned to clients are fast + cacheable

The `UploadsService` will log a `WARN` on boot if `AWS_S3_PUBLIC_BASE_URL` is unset in production. Don't ignore it — direct S3 reads cost more, are slower, and expose the bucket name.

---

## 1. Create the S3 bucket

Region: `ap-south-1` (Mumbai, matches the API).

```bash
aws s3api create-bucket \
  --bucket religiogram-user-files \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

Block ALL public access at the bucket level:

```bash
aws s3api put-public-access-block \
  --bucket religiogram-user-files \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

Enable versioning + lifecycle policy to expire abandoned uploads (the in-app sweeper handles `pending` rows; this catches anything else):

```bash
aws s3api put-bucket-versioning \
  --bucket religiogram-user-files \
  --versioning-configuration Status=Enabled
```

Lifecycle rule to drop incomplete multipart uploads after 1 day:

```json
{
  "Rules": [
    {
      "ID": "abort-incomplete-multipart",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket religiogram-user-files \
  --lifecycle-configuration file://lifecycle.json
```

CORS — required so the browser PUT to the pre-signed URL works:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://app.religiogram.com",
        "http://localhost:3001"
      ],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type", "Content-Length"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```bash
aws s3api put-bucket-cors --bucket religiogram-user-files --cors-configuration file://cors.json
```

---

## 2. Create the CloudFront distribution with OAC

Origin Access Control (OAC) is the modern replacement for OAI. It uses SigV4 to sign every CloudFront → S3 request, so the bucket policy can grant access to the distribution **only** — nobody else, not even with a direct S3 URL.

In the CloudFront console:

1. **Create distribution**
2. Origin domain: `religiogram-user-files.s3.ap-south-1.amazonaws.com`
3. Origin access: **Origin access control settings** → Create new OAC → Sign requests
4. Viewer protocol policy: **Redirect HTTP to HTTPS**
5. Allowed HTTP methods: **GET, HEAD** (no PUT — uploads bypass CloudFront)
6. Cache policy: **CachingOptimized** (default — long TTLs for immutable user media)
7. Response headers policy: **CORS-with-preflight-and-SecurityHeadersPolicy**
8. Alternate domain (CNAME): `cdn.religiogram.com`
9. Custom SSL certificate: ACM cert in `us-east-1` (CloudFront requirement) for `cdn.religiogram.com`

Wait for the distribution to deploy (~10 min).

---

## 3. Bucket policy — allow only the CloudFront distribution

Replace `<DISTRIBUTION_ID>` and `<ACCOUNT_ID>`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::religiogram-user-files/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

```bash
aws s3api put-bucket-policy --bucket religiogram-user-files --policy file://policy.json
```

This grants the distribution `s3:GetObject` and **nothing else**. The API role separately has `s3:PutObject` + `s3:HeadObject` + `s3:DeleteObject` (for the sweeper).

---

## 4. DNS

Point `cdn.religiogram.com` (Route 53 or your DNS provider) at the CloudFront distribution domain (`d111111abcdef8.cloudfront.net`).

---

## 5. API IAM role

The ECS task role / EKS service account needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UploadsBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:HeadObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::religiogram-user-files/users/*"
    },
    {
      "Sid": "UploadsBucketBatchDelete",
      "Effect": "Allow",
      "Action": ["s3:DeleteObject"],
      "Resource": "arn:aws:s3:::religiogram-user-files/users/*"
    }
  ]
}
```

Note: the path is scoped to `users/*` — the API can never write outside that prefix even if a bug let it try.

---

## 6. Wire the env

```env
STORAGE_PROVIDER=s3
AWS_S3_REGION=ap-south-1
AWS_S3_BUCKET=religiogram-user-files
AWS_S3_PUBLIC_BASE_URL=https://cdn.religiogram.com
# DO NOT set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in production —
# the SDK picks up credentials from the task role automatically.
```

Restart the API. The boot log should show:

```
S3 ready → bucket=religiogram-user-files region=ap-south-1 cdn=https://cdn.religiogram.com
```

If the warning about `STORAGE_PUBLIC_BASE_URL is unset` appears, the env var didn't reach the pod.

---

## 7. Verify end-to-end

```bash
# Should sign a URL pointing at *.s3.ap-south-1.amazonaws.com (PUT goes direct)
curl -X POST https://api.religiogram.com/api/v1/uploads/presign \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind":"profile","contentType":"image/jpeg","sizeBytes":12345}'

# After PUT + confirm, the returned `url` should be on cdn.religiogram.com
# and resolve via CloudFront, NOT directly off S3.
```

---

## Why this matters at 1M users

- **Cost**: S3 charges $0.09/GB egress, CloudFront $0.085/GB and caches at the edge — for repeated reads (avatars in a feed) the saving is ~10× because the same byte never leaves the CDN.
- **Latency**: India users hit the Mumbai edge in 5–20ms; direct S3 GETs are 60–150ms.
- **Security**: A private bucket policy means a misconfigured app can never accidentally make user IDs/photos publicly listable.
- **Scalability**: CloudFront absorbs viral spikes (one popular profile goes viral → CloudFront caches it once and serves from edge).
