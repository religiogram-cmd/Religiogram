# ReligioGram — Local Dev Bring-Up Runbook

Get the real NestJS backend + Postgres + Redis + coturn + the Next.js
frontend running on your laptop in 10 steps. No more mock server.

Estimated time: **30 minutes** the first time, < 60 seconds for restarts.

---

## Prerequisites

You should already have:

- **Docker Desktop** 4.x (or Docker Engine 24+ on Linux) — for Postgres, Redis, coturn.
- **Node.js 20 LTS** — for the NestJS API and the Next.js frontend.
- **A Razorpay test account** — for real payment-flow testing. Sign up at
  <https://razorpay.com> → switch to **Test Mode** → keys live in
  Settings → API Keys.
- **A Sentry DSN** (optional, only if you want trace capture in dev).

---

## Step 1 — Clone & install

```bash
cd C:\Users\utkar\OneDrive\Desktop\religiogram-dev

# Backend
cd religiogram-backend
npm ci

# Frontend
cd ..\religiogram-frontend
npm ci
```

`npm ci` is strict-lockfile — pins everything from `package-lock.json`.
Use `npm install` only if you have local changes to dependencies.

---

## Step 2 — Generate secrets

These are required by `main.ts` at boot in production mode. For local dev
we keep `NODE_ENV=development` so the asserts are softer, but the
encryption services still verify lengths. Generate them once and reuse:

```bash
# Linux / WSL / Git Bash on Windows
openssl rand -hex 32   # → BIRTH_PROFILE_ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32   # → PAYOUT_ENCRYPTION_KEY        (64 hex chars)
openssl rand -hex 48   # → REFRESH_TOKEN_HMAC_SECRET    (96 hex chars)
openssl rand -hex 48   # → OTP_SECRET                    (96 hex chars)
```

**PowerShell equivalent if you don't have openssl:**

```powershell
function rand-hex($bytes) {
  $b = New-Object byte[] $bytes
  (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
  -join ($b | % { '{0:x2}' -f $_ })
}
rand-hex 32
```

JWT keys (RS256). One-time generation, **commit the public key to env,
keep the private key in a secret store** (or your local `.env` only):

```bash
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
```

Paste both into `.env` (see Step 4).

---

## Step 3 — Boot Postgres + Redis + coturn

From `religiogram-backend`:

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps   # all 3 should be "running"
```

Check Postgres is healthy:

```bash
docker compose -f docker-compose.dev.yml exec postgres pg_isready -U app -d religiogram
# accepting connections
```

If port 5432 / 6379 / 3478 is already taken on your laptop, edit
`docker-compose.dev.yml` and remap the host-side ports.

---

## Step 4 — Configure `religiogram-backend/.env`

```bash
cd religiogram-backend
cp .env.example .env
```

Then fill in the BLANK / `REPLACE_ME` values you generated in Step 2:

```dotenv
NODE_ENV=development
PORT=3001

DATABASE_URL=postgresql://app:password@localhost:5432/religiogram
REDIS_HOST=localhost
REDIS_PORT=6379

# From Step 2
JWT_PRIVATE_KEY=<contents of jwt_private.pem>
JWT_PUBLIC_KEY=<contents of jwt_public.pem>
REFRESH_TOKEN_HMAC_SECRET=<96 hex chars>
OTP_SECRET=<96 hex chars>
BIRTH_PROFILE_ENCRYPTION_KEY=<64 hex chars>
PAYOUT_ENCRYPTION_KEY=<64 hex chars>

# From Razorpay dashboard → Test Mode
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=any-string-for-now    # set the same in Razorpay dashboard webhooks

# From docker-compose.dev.yml coturn config
TURN_HOST=localhost
TURN_SHARED_SECRET=dev-turn-shared-secret-change-me

# Optional in dev
SENTRY_DSN=                    # leave blank if not using Sentry locally
CORS_ORIGINS=http://localhost:3000

INVITE_CEREMONY_SERVICE_ID=00000000-0000-0000-0000-00000000beef
```

---

## Step 5 — Run migrations + seed data

```bash
cd religiogram-backend
npm run migration:run
npm run seed         # populates services_master + sample temples
```

Migration `1700000000040-PriestFlow.ts` (already in the codebase) plus
the new invite-flow seed will create the `INVITE_CEREMONY_SERVICE_ID`
sentinel row. Verify:

```sql
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U app -d religiogram \
  -c "SELECT id, name FROM services_master WHERE id = '00000000-0000-0000-0000-00000000beef';"
```

If the row is missing (the seed hasn't been added for invite yet), insert
it manually so the backend `createInviteBooking` service finds it:

```sql
INSERT INTO services_master (id, religion, category, name, slug, description, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-00000000beef', 'other', 'invite', 'Invite a Priest (free-form)', 'invite-priest', 'Free-form invite-a-priest ceremony — name is in booking notes', now(), now())
ON CONFLICT (id) DO NOTHING;
```

---

## Step 6 — Start the NestJS API

```bash
cd religiogram-backend
npm run start:dev
```

You should see:

```
[Nest] LOG [Bootstrap] Listening on :3001 [development]
[Nest] LOG [TypeOrm] Postgres connection pool open (size=20)
[Nest] LOG [Redis] Connected to redis://localhost:6379
[Nest] LOG [Bull] Queue ai-safety-review attached
…
```

Smoke test the OTP endpoint:

```bash
curl -s -X POST http://localhost:3001/v1/auth/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone": "9999999999"}'
# {"success":true,"data":{"message":"OTP sent","expiresIn":300,"resendAfter":30}}
```

For dev convenience, the backend honours `DEV_OTP_BYPASS=1` which makes
the OTP always equal `000000`. Add it to `.env` and restart.

---

## Step 7 — Configure & start the frontend

```bash
cd religiogram-frontend
cp .env.example .env.local   # if you have one; otherwise create it
```

Set:

```dotenv
NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx   # SAME public key as backend
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=                       # leave blank if not used
NEXT_PUBLIC_SENTRY_DSN=                                # leave blank in dev
NEXT_PUBLIC_REFRESH_TOKEN_TRANSPORT=cookie             # default; HttpOnly cookie mode
```

Then:

```bash
npm run dev
```

Visit <http://localhost:3000>.

---

## Step 8 — Smoke each persona

### Seeker

1. `/` → AuthScreen → enter `9999999999` → tap **Send OTP**.
2. On `/verify-otp` enter `000000` (DEV_OTP_BYPASS).
3. You land on `/home`. Tap **Priests → Hindu → Explore**.
4. From the **Hindu Puja Services** screen, pick any service.
5. The booking flow opens — fill 5 steps → **Find Pandits** → pick one →
   **Pay & Confirm** → Razorpay test card `4111 1111 1111 1111` CVV
   `123`, any future expiry.
6. On success you land on `/bookings` with a confirmed booking row.

### Provider

1. From a fresh session, log in as a different phone.
2. Tap **Become a Priest** in the profile menu.
3. Walk through **provider-onboarding** steps 1–7. Each step calls
   `PATCH /v1/provider/onboarding/:id` (you can watch in the API logs).
4. Step 7 uploads a 30-second KYC selfie video to S3 (use any test S3
   bucket OR `LOCAL_S3=1` with the bundled MinIO container — out of
   scope for this runbook).
5. Submit → backend transitions draft → `pending_review`.

### Admin

1. Log in as a user with role `admin` (use `npm run seed:admin` or
   manually set `users.role='admin'` in Postgres).
2. Navigate to `/admin`. You'll see the verification queue with the
   provider you just onboarded.
3. **Approve** → provider transitions to `approved` → they can go online
   and receive bookings.

### Online consultant

1. As the approved provider, go to **Provider Dashboard → Go Online**.
2. Log back in as the seeker.
3. **Priests → Hindu → Ask a Pandit**.
4. The consultant appears in the list with a green online dot.
5. Tap **Chat** → consultation session starts → first 5 minutes free →
   per-minute wallet billing kicks in via BullMQ.

---

## Step 9 — Verify the money path end-to-end

Razorpay test webhook (so the backend marks the booking CONFIRMED on
their side too):

1. In the Razorpay dashboard → **Webhooks** → **Add new** →
   <https://your-ngrok-tunnel.io/v1/payments/webhook> (use ngrok during
   local dev).
2. Select event `payment.captured`. Secret = same as
   `RAZORPAY_WEBHOOK_SECRET` in your backend `.env`.
3. Trigger a test payment via the booking flow above.
4. Backend logs: `Webhook received: payment.captured (id=...)` →
   `payment.captured: booking <bid> confirmed`.

---

## Step 10 — Shut down

```bash
# Stop frontend + API (Ctrl-C in each terminal)

cd religiogram-backend
docker compose -f docker-compose.dev.yml down       # stops containers, keeps data
# docker compose -f docker-compose.dev.yml down -v   # also nukes the named volumes
```

Postgres data persists in the `pgdata_dev` volume; Redis appendonly file
persists in `redisdata_dev`. Next restart you don't have to re-seed
unless you `down -v`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `FATAL: missing required env vars: ...` | `.env` not loaded or key empty | Confirm `.env` is at `religiogram-backend/.env`, restart |
| API boot succeeds but 401 on every request | JWT signing mismatch (HS256 dev panel) | Use OTP flow instead, not the dev panel |
| `ECONNREFUSED 127.0.0.1:6379` | Redis container not up | `docker compose ps` — restart if missing |
| Razorpay modal opens then nothing | Webhook URL not configured | Step 9, or you can bypass: the verify HMAC works without webhook |
| `INVITE_CEREMONY_SERVICE_ID not found` | Sentinel row missing | Step 5 SQL insert |
| WebRTC call fails to connect | coturn not reachable, wrong TURN_HOST | `docker compose logs coturn`, check Step 3 |

---

## What this gets you

After Step 10 you have **everything real**:

- Real NestJS API serving every route.
- Real Postgres with the booking, wallet, payout, consultation tables.
- Real Redis with BullMQ tick jobs running.
- Real Razorpay sandbox processing test payments through HMAC verify.
- Real coturn enabling WebRTC voice/video.
- Real RS256 JWT auth.
- Real per-minute consultation billing with wallet debits.

No mock server. No graceful fallbacks. End-to-end production-equivalent
behaviour on your laptop.
