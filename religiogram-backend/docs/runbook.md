# ReligioGram API — Production Runbook

> **Audience**: On-call engineers, SREs, and senior developers.  
> **Last updated**: 2026-05-20  
> Keep this document current whenever infrastructure changes.

---

## Table of Contents

1. [Deployment](#1-deployment)
2. [Rollback](#2-rollback)
3. [Secret Rotation](#3-secret-rotation)
4. [Redis Failover (Sentinel)](#4-redis-failover-sentinel)
5. [Database Backup & Restore](#5-database-backup--restore)
6. [Incident Response](#6-incident-response)
7. [AI Cost Spike — CostLock Circuit Breaker](#7-ai-cost-spike--costlock-circuit-breaker)
8. [Stuck Payout Batch Recovery](#8-stuck-payout-batch-recovery)
9. [Key Environment Variables](#9-key-environment-variables)

---

## 1. Deployment

### Standard production deploy

```bash
# 1. Merge PR into main — GitHub Actions CI runs automatically.
#    CI must be green (lint, tsc, tests, npm audit, Snyk) before promoting.

# 2. SSH to production server (or use your CI CD pipeline)
ssh deploy@<SSH_HOST>

# 3. Pull the latest image (or let K8s rolling-update handle it)
cd /opt/religiogram
docker compose pull api
docker compose up -d --no-deps api

# 4. Watch rolling restart
docker compose logs -f api | head -200
```

### Database migrations

Migrations run automatically on startup (`TypeORM synchronize: false`, `migrationsRun: true`).  
To run them manually:

```bash
docker compose exec api npx typeorm migration:run -d dist/config/typeorm.config.js
```

To check pending migrations without running them:

```bash
docker compose exec api npx typeorm migration:show -d dist/config/typeorm.config.js
```

### Pre-deploy checklist

- [ ] All CI checks green on the PR
- [ ] `npm audit --audit-level=high` has zero critical/high vulns
- [ ] New env vars added to production secrets (AWS SSM / Secrets Manager) and `.env.example`
- [ ] Database migrations tested on staging first
- [ ] Feature flags for risky changes are **disabled** in GrowthBook until validated in prod
- [ ] Notify ops channel: `@channel deploying vX.Y.Z — ping if anything breaks`

---

## 2. Rollback

### Rollback API service

```bash
# Find the previous image tag
docker images religiogram/api | head -5

# Roll back to the previous tag
docker compose up -d --no-deps \
  -e IMAGE_TAG=<previous-tag> api

# Verify the rollback
curl -sf http://localhost:3000/health | jq .
```

### Rollback a migration

```bash
# Reverts the most recently applied migration (calls the down() method)
docker compose exec api \
  npx typeorm migration:revert -d dist/config/typeorm.config.js
```

Repeat for each migration to revert. Always test `down()` on staging before production.

### Rollback via feature flag (zero-downtime)

For features guarded by a GrowthBook flag, simply flip the flag to **off** in the GrowthBook UI or via the Redis override:

```bash
# Disable a flag instantly (bypasses GrowthBook CDN cache)
docker compose exec redis \
  redis-cli SET rg:ff:ENABLE_NEW_FEATURE "false"
```

---

## 3. Secret Rotation

### JWT RS256 key pair

```bash
# 1. Generate new key pair
openssl genrsa -out new_private.pem 2048
openssl rsa -in new_private.pem -pubout -out new_public.pem

# 2. Upload to AWS SSM (or Secrets Manager)
aws ssm put-parameter \
  --name /religiogram/prod/JWT_PRIVATE_KEY \
  --value "$(cat new_private.pem)" \
  --type SecureString --overwrite

aws ssm put-parameter \
  --name /religiogram/prod/JWT_PUBLIC_KEY \
  --value "$(cat new_public.pem)" \
  --type SecureString --overwrite

# 3. Rolling restart (old tokens remain valid until their TTL expires
#    because we keep the OLD public key temporarily — see note below)
docker compose up -d --no-deps api

# 4. Remove old files from local disk
shred -u new_private.pem new_public.pem
```

> **Note**: Access tokens expire after 15 min (JWT_ACCESS_TTL=900). Refresh tokens
> after 7 days. During rotation keep the previous public key in a
> `JWT_PUBLIC_KEY_OLD` env var and validate against both keys for
> `max(JWT_ACCESS_TTL, JWT_REFRESH_TTL)` seconds before removing the old key.

### Razorpay webhook secret

```bash
# 1. Generate a new secret in Razorpay Dashboard → Webhooks → Edit
# 2. Update SSM immediately so new webhooks validate correctly
aws ssm put-parameter \
  --name /religiogram/prod/RAZORPAY_WEBHOOK_SECRET \
  --value "<new-secret>" \
  --type SecureString --overwrite

# 3. Restart API (hot-reload is not supported for this secret)
docker compose up -d --no-deps api
```

### OTP HMAC secret

```bash
# Generate new secret
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

aws ssm put-parameter \
  --name /religiogram/prod/OTP_SECRET \
  --value "$NEW_SECRET" \
  --type SecureString --overwrite

# Flush any in-flight OTP Redis keys (they expire in 5 min anyway)
docker compose exec redis \
  redis-cli --scan --pattern "rg:otp:*" | xargs redis-cli DEL

docker compose up -d --no-deps api
```

### Redis password

```bash
# 1. Update Redis AUTH password in redis.conf or ElastiCache cluster settings
# 2. Update SSM
aws ssm put-parameter \
  --name /religiogram/prod/REDIS_PASSWORD \
  --value "<new-password>" \
  --type SecureString --overwrite

# 3. Restart API (ioredis will reconnect with new password)
docker compose up -d --no-deps api
```

---

## 4. Redis Failover (Sentinel)

ReligioGram uses ioredis in Sentinel mode when `REDIS_SENTINEL_HOSTS` is set.  
Sentinel elects a new primary automatically. This section covers manual intervention.

### Check sentinel health

```bash
# List all sentinels and their view of the primary
for host in sentinel1:26379 sentinel2:26379 sentinel3:26379; do
  echo "=== $host ==="
  redis-cli -h "${host%%:*}" -p "${host##*:}" SENTINEL masters
done
```

### Trigger a manual failover

```bash
# Run on any sentinel (e.g. sentinel1)
redis-cli -h sentinel1 -p 26379 SENTINEL failover mymaster

# Confirm new primary
redis-cli -h sentinel1 -p 26379 SENTINEL get-master-addr-by-name mymaster
```

### API reconnect after failover

ioredis reconnects automatically. Verify:

```bash
docker compose logs api | grep -E "(sentinel|failover|redis|reconnect)" | tail -30
```

If the API is stuck in reconnect loops:

```bash
docker compose restart api
```

### ElastiCache (AWS managed Redis)

For ElastiCache Multi-AZ clusters, failover is automatic. To force one:

```bash
aws elasticache test-failover \
  --replication-group-id religiogram-prod \
  --node-group-id 0001
```

---

## 5. Database Backup & Restore

### RDS automated backups

Automated daily snapshots are enabled (7-day retention). To create a manual snapshot:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier religiogram-prod \
  --db-snapshot-identifier religiogram-prod-manual-$(date +%Y%m%d-%H%M)
```

### Export a logical dump (pg_dump)

```bash
# From within the API container or a bastion host
pg_dump \
  --no-owner --no-acl \
  -Fc \                         # custom format (smallest + parallelisable)
  "$DATABASE_URL" \
  > religiogram_$(date +%Y%m%d_%H%M).dump

# Upload to S3
aws s3 cp religiogram_*.dump s3://religiogram-backups/pg/
```

### Restore from dump

```bash
# !! DESTRUCTIVE — drops the existing DB first !!

# 1. Create a fresh DB
psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE religiogram_restore;"

# 2. Restore
pg_restore \
  --no-owner --no-acl \
  -d "$RESTORE_DATABASE_URL" \
  religiogram_YYYYMMDD_HHMM.dump

# 3. Verify row counts
psql "$RESTORE_DATABASE_URL" -c "
  SELECT schemaname, relname, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 20;
"

# 4. Point DATABASE_URL at the restored DB and restart API
```

### Point-in-time recovery (RDS)

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier religiogram-prod \
  --target-db-instance-identifier religiogram-prod-pitr \
  --restore-time "2026-05-20T03:00:00Z"
```


### §5.4 Recovery Objectives & Drill Schedule

| Objective | Target | Notes |
|-----------|--------|-------|
| **RTO** (Recovery Time Objective) | ≤ 4 hours | Time from incident declaration to service restoration |
| **RPO** (Recovery Point Objective) | ≤ 1 hour | Maximum acceptable data loss (matches RDS automated backup + WAL streaming interval) |
| **MTTR** (Mean Time to Restore) | ≤ 2 hours | Target for P0 incidents based on historical data |
| **Backup frequency** | Continuous WAL + daily snapshot | RDS automated backups with 7-day retention |
| **Backup retention** | 7 days (RDS) + 90 days (SBOM / audit logs in S3) | |

#### Restoration Drill Procedure (run quarterly)

1. **Announce drill** to on-call team; block off 2-hour window.
2. **Spin up restore target** in a separate VPC or staging account:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier religiogram-prod \
     --target-db-instance-identifier religiogram-drill-$(date +%Y%m%d) \
     --restore-time "$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')"
   ```
3. **Verify data integrity** — run migration status check and spot-check wallet balances:
   ```bash
   psql $DRILL_DATABASE_URL -c "SELECT COUNT(*) FROM wallets WHERE balance_paise < 0;"
   # Expected: 0 rows
   psql $DRILL_DATABASE_URL -c "SELECT MAX(created_at) FROM bookings;"
   # Expected: within RPO window of drill time
   ```
4. **Run smoke suite** against drill DB:
   ```bash
   BASE_URL=https://drill.religiogram.in make k6-smoke
   ```
5. **Document results** in Notion: actual RTO achieved, data lag (actual RPO), any gaps found.
6. **Tear down** the drill instance to avoid billing overage:
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier religiogram-drill-$(date +%Y%m%d) \
     --skip-final-snapshot
   ```
7. **File an action item** if actual RTO > 4 hours or actual RPO > 1 hour.

---

## 6. Incident Response

### Severity levels

| Level | Definition | Response time | Example |
|-------|-----------|--------------|---------|
| P0 | Complete outage or data loss | 15 min | DB down, payments failing |
| P1 | Major feature broken | 30 min | Bookings 500-ing, OTPs not sending |
| P2 | Degraded performance | 2 hours | Slow queries, high error rate |
| P3 | Minor bug | Next business day | UI glitch, non-critical endpoint |

### First-responder playbook

```
1. Check health endpoint
   curl -sf https://api.religiogram.com/health | jq .

2. Check Sentry for recent errors
   https://sentry.io → Project: religiogram-api → Issues (last 1h)

3. Check Grafana dashboards
   https://grafana.religiogram.com → API Overview

4. Check recent deployments
   git log --oneline -10 origin/main

5. Check error rate in logs
   docker compose logs --since 30m api | grep '"level":"error"' | wc -l

6. If error rate > 5% → consider rollback (see §2)
```

### Useful diagnostic commands

```bash
# Active DB connections
psql "$DATABASE_URL" -c "
  SELECT count(*), state, wait_event_type, wait_event
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state, wait_event_type, wait_event;
"

# Slow queries (>1s)
psql "$DATABASE_URL" -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE (now() - pg_stat_activity.query_start) > interval '1 second'
    AND state != 'idle'
  ORDER BY duration DESC;
"

# BullMQ queue depths
docker compose exec redis redis-cli \
  --scan --pattern "bull:*:waiting" | \
  xargs -I{} redis-cli LLEN {}

# Dead-letter queue entries
docker compose exec redis redis-cli \
  --scan --pattern "rg:dlq:*" | head -20

# Redis memory
docker compose exec redis redis-cli INFO memory | grep -E "(used_memory_human|maxmemory_human)"

# API container resource usage
docker stats religiogram_api --no-stream
```

### Payment incident (Razorpay)

```bash
# 1. Check for failed/missed webhook events
docker compose exec redis redis-cli \
  --scan --pattern "rg:dlq:payment-webhook:*" | wc -l

# 2. Replay failed webhook jobs via admin endpoint (requires admin JWT)
curl -X POST https://api.religiogram.com/api/v1/admin/payments/webhooks/replay \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.captured","payload":{...},"eventId":"evt_xxx"}'

# 3. Check Razorpay Dashboard for unacknowledged webhooks
#    https://dashboard.razorpay.com → Settings → Webhooks → Failed
```

### OTP / SMS incident

```bash
# Check SMS daily ceiling per user
docker compose exec redis redis-cli GET "rg:otp:sms:daily:<phone>"

# Reset a user's daily ceiling (only after verifying the request is legitimate)
docker compose exec redis redis-cli DEL "rg:otp:sms:daily:<phone>"

# Check MSG91 delivery reports
# https://control.msg91.com → Reports → Campaign Reports
```

### Force-expire a compromised JWT refresh token

```bash
# Revoke all refresh tokens for a user
docker compose exec redis redis-cli \
  --scan --pattern "rg:refresh:user:<userId>:*" | \
  xargs redis-cli DEL
```

---

## 7. AI Cost Spike — CostLock Circuit Breaker

**Triggered by:** `AiCostSpike` Prometheus alert — daily AI spend exceeds 80% of `COST_LOCK_AI_DAILY_RUPEES`  
**Impact:** Uncontrolled Gemini API spend; could cause budget overrun in hours  

### Step 1 — Identify runaway usage

```sql
-- Who is consuming the most tokens today?
SELECT user_id, SUM(tokens_input + tokens_output) AS total_tokens,
       SUM(cost_paise) / 100.0 AS cost_rupees
FROM ai_usage_daily
WHERE date = CURRENT_DATE
GROUP BY user_id
ORDER BY total_tokens DESC
LIMIT 20;
```

Check Grafana → **AI Cost** dashboard panel for real-time spend vs. daily cap.

### Step 2 — Identify the model tier responsible

```bash
# Check Flash vs Pro spend split
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.religiogram.in/v1/admin/ai/usage/summary?date=$(date +%Y-%m-%d)
```

### Step 3 — Immediate mitigation: lower the daily cap

Edit `COST_LOCK_AI_DAILY_RUPEES` in AWS SSM Parameter Store:

```bash
aws ssm put-parameter \
  --name "/religiogram/prod/COST_LOCK_AI_DAILY_RUPEES" \
  --value "500" \   # reduce from default 2000
  --type SecureString --overwrite
# Then rolling-restart pods to pick up new value:
kubectl rollout restart deployment/religiogram-api -n religiogram
```

### Step 4 — Disable Pro-tier routing (nuclear option)

If Flash spend is fine but Gemini Pro is the culprit, toggle the feature flag:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"ai_pro_enabled","enabled":false}' \
  https://api.religiogram.in/v1/admin/feature-flags/ai_pro_enabled
```

This immediately disables Gemini 1.5 Pro routing for all users; Flash continues normally.

### Step 5 — Suspend a specific user (if targeted abuse)

```sql
-- Soft-suspend the user from AI features
UPDATE users SET is_ai_suspended = TRUE
WHERE id = '<user_id>';
```

```bash
# Also flush their active AI session from Redis
redis-cli -h $REDIS_HOST KEYS "ai:session:<user_id>:*" | xargs redis-cli -h $REDIS_HOST DEL
```

### Step 6 — Verify mitigation

```bash
# Check that new requests are being rate-limited
curl -s -H "Authorization: Bearer $TEST_USER_TOKEN" \
  https://api.religiogram.in/v1/ai/chat \
  -d '{"message":"test"}' | jq .error
# Expected: "Daily AI token limit reached. Please try again tomorrow."
```

### Step 7 — Post-incident

1. File incident report with: user IDs involved, root cause, spend amount, mitigation taken.
2. Consider adding per-user daily spend cap lower than the system-wide cap.
3. Review CostGuardService thresholds — adjust `COST_LOCK_AI_DAILY_RUPEES` for realistic baseline.
4. If abuse is confirmed: escalate to trust & safety for account review.

---

## 8. Stuck Payout Batch Recovery

**Triggered by:** `PayoutBatchStuck` Prometheus alert  
**Condition:** A payout batch has been in `in_settlement` status for > 1 hour  
**Impact:** Providers do not receive T+2 payouts; money is held in escrow

### Step 1 — Identify the stuck batch

```sql
-- Run against the primary DB (not replica — needs latest data)
SELECT id, batch_date, status, total_payout_paise, created_at, updated_at
FROM payout_batches
WHERE status = 'in_settlement'
  AND updated_at < NOW() - INTERVAL '1 hour'
ORDER BY updated_at ASC;
```

Note the `id` (UUID) for each stuck batch.

### Step 2 — Check Razorpay payout status

```bash
# Fetch Razorpay payout batch status via admin endpoint
curl -s https://api.religiogram.com/api/v1/admin/payouts/batches/<batch_id>   -H "Authorization: Bearer $ADMIN_JWT" | jq '{id, status, razorpay_batch_id}'
```

If `razorpay_batch_id` is null, the batch never reached Razorpay → proceed to Step 3.  
If `razorpay_batch_id` is set, check the Razorpay Dashboard:  
→ https://dashboard.razorpay.com → Payouts → Batches → search by `razorpay_batch_id`

### Step 3 — Retry the stuck batch

```bash
# Trigger a manual retry for a specific batch
curl -X POST https://api.religiogram.com/api/v1/admin/payouts/batches/<batch_id>/retry   -H "Authorization: Bearer $ADMIN_JWT"   -H "Content-Type: application/json"
```

Expected: `{ "status": "scheduled" }` — the batch will be re-queued in BullMQ.

### Step 4 — If retry fails

1. Check BullMQ DLQ for payout-related failed jobs:
   ```bash
   curl https://api.religiogram.com/api/v1/admin/dlq/inspect      -H "Authorization: Bearer $ADMIN_JWT" | jq '.[] | select(.queue=="payout")'
   ```
2. Check application logs for Razorpay connectivity errors:
   ```bash
   kubectl logs -l app=api -n religiogram --since=2h | grep '"service":"razorpay"' | tail -50
   ```
3. If Razorpay is down (check https://status.razorpay.com), **do not retry** — wait for
   Razorpay recovery. The batch will be retried automatically once the circuit breaker
   transitions back to CLOSED.
4. If the batch has been stuck > 6 hours with no Razorpay outage:
   - Escalate to Razorpay support with `batch_id` and `razorpay_batch_id` (if set)
   - Email: support@razorpay.com | Phone: 1800-123-1272
   - Reference the `PayoutBatchStuck` alert timestamp and affected provider count from:
     ```sql
     SELECT COUNT(*) FROM provider_earnings
     WHERE payout_batch_id = '<batch_id>' AND status = 'pending';
     ```

### Step 5 — Verify resolution

```bash
# Confirm the batch has moved out of in_settlement
curl https://api.religiogram.com/api/v1/admin/payouts/batches/<batch_id>   -H "Authorization: Bearer $ADMIN_JWT" | jq '.status'
# Expected: "completed" or "failed" (never "in_settlement")
```

The Prometheus alert will auto-resolve within 5 minutes once the batch status changes.


---

## 9. Key Environment Variables

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `DATABASE_URL` | AWS SSM SecureString | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_SENTINEL_HOSTS` | SSM | Standalone or Sentinel Redis |
| `JWT_PRIVATE_KEY` | SSM SecureString | RS256 signing key |
| `JWT_PUBLIC_KEY` | SSM SecureString | RS256 verification key |
| `RAZORPAY_KEY_SECRET` | SSM SecureString | Razorpay API auth |
| `RAZORPAY_WEBHOOK_SECRET` | SSM SecureString | Webhook HMAC verification |
| `OTP_SECRET` | SSM SecureString | TOTP HMAC key |
| `FIREBASE_SERVICE_ACCOUNT` | SSM SecureString (base64) | FCM push notifications |
| `SENTRY_DSN` | SSM | Error tracking |
| `GROWTHBOOK_CLIENT_KEY` | SSM | Feature flags SDK key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | SSM | Jaeger / OTLP collector |
| `RESEND_API_KEY` | SSM SecureString | Transactional email |

For the full list see [`.env.example`](../.env.example).

---

*For architecture context see [`docs/architecture.md`](./architecture.md).  
For API reference see Swagger at `/api/v1/docs` (non-production environments only).*
