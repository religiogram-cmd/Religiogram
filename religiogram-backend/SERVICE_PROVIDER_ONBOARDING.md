# Service Provider Onboarding — Architecture

> ReligioGram's service-provider (a.k.a. "Spiritual Guide") onboarding
> system. Seven steps, multi-faith, auto-saving, with video KYC.
>
> This doc explains the data model, the request flow for each step, the
> pricing formula, the draft lifecycle, and the operational edges we
> chose to guard against.

The product rule that drives most of the design: **devotees should never
see a provider until a human has watched their KYC video and approved
their profile.** Everything up to that approval is a draft the provider
can resume indefinitely.

## Table of Contents

1. [Terminology](#terminology)
2. [Data model](#data-model)
3. [Seven-step flow](#seven-step-flow)
4. [Pricing formula](#pricing-formula)
5. [Draft lifecycle & autosave](#draft-lifecycle--autosave)
6. [KYC video pipeline](#kyc-video-pipeline)
7. [Religion gate](#religion-gate)
8. [Edge cases & how they're handled](#edge-cases--how-theyre-handled)
9. [Admin review pipeline](#admin-review-pipeline)
10. [Scaling notes](#scaling-notes)

---

## Terminology

| Term | Meaning |
|---|---|
| **Service Provider** / **Spiritual Guide** | A person offering spiritual services on the platform. Never use "priest" — the platform is multi-faith. |
| **Religion** | One of `hindu`, `islam`, `sikh`, `christian`, `other`. Gates the service catalogue. |
| **Catalogue service** | A pre-seeded, slugged entry in `services_master` (e.g. Ganesh Puja, Nikah Ceremony). |
| **Custom service** | A provider-authored free-text entry that isn't in the catalogue. Capped at 10 per provider. |
| **Paise** | 1/100th of a rupee. All prices stored and transmitted as integer paise to avoid float drift. |
| **Live KYC** | A KYC row whose status is not `rejected`. Exactly one per provider via partial unique index. |

---

## Data model

```
providers                          ─── 1:1 ── users
 ├─ id (uuid)
 ├─ user_id (fk users)  UNIQUE
 ├─ full_name, dob, phone, city
 ├─ experience_years, languages[], bio
 ├─ religion (enum, nullable until step 3)
 ├─ status  (draft | pending_review | approved | rejected | suspended)
 └─ created_at / updated_at

services_master                    ─── catalogue, seeded at deploy
 ├─ id
 ├─ religion (enum)
 ├─ category (text — e.g. "Festival Pujas")
 ├─ name, slug, description
 ├─ suggested_min_price, suggested_max_price   (paise)
 └─ suggested_duration_minutes

provider_services                  ─── N per provider
 ├─ provider_id → providers.id
 ├─ service_id  → services_master.id (nullable)
 ├─ custom_name (nullable)
 │    CHECK (service_id XOR custom_name)
 ├─ base_price_paise, travel_fee_paise, addon_fee_paise
 ├─ duration_minutes
 └─ mode (online | offline | both)

availability                       ─── weekly recurring slots
 ├─ provider_id → providers.id
 ├─ day_of_week (0 = Sun … 6 = Sat)
 ├─ start_time, end_time (HH:MM, local)
 └─ is_break

kyc_videos                         ─── append-only history
 ├─ provider_id → providers.id
 ├─ s3_key, mime_type, size_bytes, duration_seconds
 ├─ status (pending | approved | rejected)
 ├─ review_notes (text, nullable)
 │    PARTIAL UNIQUE INDEX (provider_id) WHERE status <> 'rejected'
 ├─ CHECK duration_seconds >= 30
 └─ reviewed_at, reviewed_by

onboarding_drafts                  ─── resume-anywhere state
 ├─ user_id → users.id  UNIQUE
 ├─ step (int)
 ├─ data (jsonb, merged server-side)
 └─ updated_at
```

Key constraints worth flagging:

- **`provider_services.(service_id, custom_name)` XOR.** Enforced with a table-level CHECK. Matches DTO-level `@ValidateIf` and the `services-providers.service.ts` `assertServiceXorCustom` guard. Three layers is deliberate — DB is the last line of defence when a future caller forgets to validate.
- **`uq_kyc_live_per_provider WHERE status <> 'rejected'`** — a partial unique index. Rejected videos are kept for audit, but the provider can only have one live upload at a time. Reviews that reject will typically include a note and the provider re-records.
- **`chk_kyc_duration >= 30`** — a DB-level minimum so a misbehaving client can't short-circuit the rule.

---

## Seven-step flow

All steps are JWT-authenticated. Base route: `/api/v1`.

| Step | Title | Endpoint | Method | Idempotent? |
|---:|---|---|---|---|
| 1 | Basic details | `/provider/register` | POST | Yes — upserts by `user_id` |
| 2 | Professional info | `/provider/professional` | PATCH | Yes |
| 3 | Religion | `/provider/religion` | PATCH | Yes — clears provider_services on change |
| 4 | Services | `/provider/services` | POST | Yes — replaces the set |
| 5 | Pricing | `/provider/pricing` | POST | Yes — upserts per (service_id \| custom_name) |
| 6 | Availability | `/provider/availability` | POST | Yes — replaces the weekly plan |
| 7 | KYC submit | `/provider/kyc` | POST | No — flips status to `pending_review` |

There's also `/provider/draft` (GET / PATCH) for the autosave blob, and the public `/services?religion=…` for the religion-scoped catalogue.

### Request/response shapes

```ts
// Step 1 — always creates or updates the provider row.
POST /provider/register
{ "fullName": "Ramesh Sharma", "dob": "1978-05-12",
  "phone": "9876543210",      "city": "Jaipur" }
→ { "providerId": "uuid", "step": 1 }

// Step 3 — switching religion clears downstream selections + pricing.
PATCH /provider/religion
{ "religion": "hindu" }
→ { "providerId": "uuid", "step": 3, "religion": "hindu" }

// Step 4 — serviceIds (from catalogue) and customServiceNames (free-text).
POST /provider/services
{ "serviceIds": [12, 17, 22],
  "customServiceNames": ["Rudraksha consultation"] }
→ { "providerId": "uuid", "step": 4, "selected": 4 }

// Step 5 — one row per selected service. Each matches
// step 4's selection exactly (enforced by the service).
POST /provider/pricing
{ "items": [
    { "serviceId": 12, "basePricePaise": 150000, "durationMinutes": 60, "mode": "offline" },
    { "customName": "Rudraksha consultation", "basePricePaise": 80000,
      "addonFeePaise": 20000, "durationMinutes": 30, "mode": "online" }
  ] }
→ { "providerId": "uuid", "step": 5, "itemCount": 4 }

// Step 7 — presign, then PUT directly to S3, then finalize.
POST /provider/kyc/presign   { "mimeType": "video/webm", "sizeBytes": 6123456 }
→ { "url": "…", "s3Key": "kyc/<providerId>/<uuid>.webm", "expiresIn": 900 }

PUT  <presigned.url>          // direct to S3, not through our API
POST /provider/kyc            { "s3Key": "…", "durationSeconds": 42, … }
→ { "providerId": "uuid", "step": 7, "status": "pending_review" }
```

### Validation responsibility

Validation lives in three layers, with increasing authority:

1. **UI (inline, per-field)** — keeps the user informed and prevents submit when broken. Ex: DOB ≥ 18 years ago, base price > 0, every row has a duration ≥ 5 min.
2. **DTO (class-validator)** — enforced by the Nest pipeline, independent of the UI. Ex: phone `^\d{10}$`, duration 5–720, `@ValidateIf` for service_id XOR custom_name.
3. **Service (business rules)** — cross-row and cross-table invariants. Ex: every pricing item corresponds to a step-4 selection; can't submit KYC before steps 1-6 are complete.

If a rule could plausibly be broken by a malicious client, it has to live in layer 2 or 3.

---

## Pricing formula

```
final = base + addons + travel + platform_fee(subtotal)

subtotal     = max(0, base) + max(0, addons) + max(0, travel)
platform_fee = { subtotal ≤ ₹5,000     →  10% · subtotal
               { subtotal ≤ ₹20,000    →   8% · subtotal
               { subtotal   > ₹20,000  →   6% · subtotal
```

Design choices:

- **Integer paise only.** `Math.round` is used at each fee step, which produces a single well-defined result. Never use `toFixed()` or division-then-float.
- **Fee is not frozen.** We don't store `platform_fee` on `provider_services`; it's computed at display/booking time. If the fee schedule changes, every active listing picks up the new number — no data migration needed.
- **Single source of truth.** `religiogram-backend/src/service-providers/pricing.ts` owns the canonical `computeFinalPrice()`. The frontend pricing screen mirrors this exactly in `app/(app)/provider-onboarding/step-5/page.tsx` so the provider sees the number the booking path will compute. The mirror must be kept in sync on every fee change (there's a test coverage reminder in `pricing.ts`).
- **Travel fee is disabled for `online` services** in the UI. The backend doesn't reject it — a provider choosing `both` can legitimately charge travel — but the UX prevents the obvious footgun.

---

## Draft lifecycle & autosave

Three-layer persistence, in order of authority:

```
┌─ server (Postgres `onboarding_drafts`) ───┐
│                                           │
│  PATCH /provider/draft  (3s debounce)     │
│                                           │
└───────────────▲───────────────────────────┘
                │
┌───────────────▼───────────────────────────┐
│    localStorage("rg_provider_onboarding") │   ← synchronous, survives tab close
└───────────────▲───────────────────────────┘
                │
┌───────────────▼───────────────────────────┐
│    React context (stateRef)               │   ← in-memory for current tab
└───────────────────────────────────────────┘
```

Read path (on `<ProviderOnboardingProvider>` mount):

1. Hydrate from `localStorage` synchronously (instant UI).
2. Async `GET /provider/draft`. If the local copy is missing and the server has data, adopt server. If both exist, local wins (it's the freshest write by definition).
3. If the server says `providerStatus` is `approved`, hard-reset — the user already finished. This handles a stale "resume" link.

Write path:

1. `update(patch)` → shallow-merges into in-memory state, writes to `localStorage` synchronously, schedules a server PATCH 3 seconds later.
2. `flush()` → forces an immediate PATCH. Called on every explicit "Next" button press.
3. Server-side, `saveDraft(step, data)` **merges** the incoming `data` into the existing JSONB blob rather than replacing it. This prevents a stale tab from clobbering fields it doesn't know about.

The `saveStatus` field drives the footer badge: `idle` / `saving` / `synced` / `offline`. Offline is surfaced to the user — retries happen on the next `update()`.

---

## KYC video pipeline

```
  ┌─ client ──────────────────────────────────────────────┐
  │                                                       │
  │  MediaRecorder → Blob (webm/mp4, ≥30s, ≤120s)         │
  │                │                                      │
  │                ▼                                      │
  │  POST /provider/kyc/presign {mimeType, sizeBytes}     │
  │                │                                      │
  │                ▼                                      │
  │  PUT <presigned> blob        (xhr, progress events)   │
  │                │                                      │
  │                ▼                                      │
  │  POST /provider/kyc {s3Key, duration, size, mime}     │
  │                │                                      │
  └────────────────┼──────────────────────────────────────┘
                   │
  ┌─ server ───────▼──────────────────────────────────────┐
  │  - Validates s3Key prefix belongs to this provider    │
  │  - CHECK duration ≥ 30                                │
  │  - Inserts kyc_videos row (status = pending)          │
  │  - Partial-unique constraint: rejects if another      │
  │    non-rejected row exists for this provider          │
  │  - Flips provider.status = 'pending_review'           │
  └───────────────────────────────────────────────────────┘
```

- **Presign TTL is 15 minutes** — long enough for slow connections, short enough that a copied URL expires before abuse becomes interesting.
- **S3 key is namespaced by provider ID**: `kyc/<providerId>/<uuid>.<ext>`. The server verifies the prefix on step-7 submit; a malicious client can't claim someone else's upload.
- **Direct-to-S3 upload.** The API server never sees the video bytes. Unlocks a 100× scale-up — our NestJS service doesn't have to buffer huge blobs.
- **Retry is cheap.** If S3 PUT fails, the recorded Blob is still in memory. The UI re-presents "Submit for review" and the user tries again. If they close the tab, they re-record — we deliberately do NOT persist blobs to IndexedDB to keep the abuse surface small.
- **Codec autoselect**: we probe `MediaRecorder.isTypeSupported(…)` for `webm/vp9` → `webm` → `mp4`. The mime we used is passed back to the server so downstream playback (HLS transcode, moderation) picks the right pipeline.

---

## Religion gate

> Until religion is selected: **service selection must be disabled.**

Three-layer enforcement:

1. **UI**: the Step 3 → 4 Next button requires `religion`; Step 4 `useEffect` bounces to Step 3 if the store is empty (handles deep-links and stale tabs).
2. **API**: `GET /services?religion=…` requires a religion query. The services-picker POST endpoint calls `assertReligionSet(providerId)` which throws `BadRequestException` with error code `RELIGION_REQUIRED`.
3. **DB**: `services_master.religion` is NOT NULL and catalogue lookups are scoped by religion — even if something slipped past the above, the only services a provider could attach are those that match a religion (and that religion has to match their profile at step-5 validation time).

Changing religion mid-flow clears previous selections (server-side transaction in `saveStep3`). The UI prompts with `confirm(…)` before letting the provider switch so this never happens by accident.

---

## Edge cases & how they're handled

| Scenario | Handling |
|---|---|
| Provider refreshes mid-flow | Rehydrate from `localStorage`; reconcile with server on next request. No data loss. |
| Provider opens the wizard in two tabs | Server-side merge in `saveDraft` preserves both tabs' edits; whichever flushes last wins per-field, but they don't clobber each other's fields. |
| Provider closes laptop before final submit | `localStorage` persists across sessions. "Resume — Step X of 7" on the landing page. |
| Provider tries to skip to Step 4 via deep-link with no religion | `useEffect` gate bounces to Step 3; server rejects the API call too. |
| Provider picks 0 services | Step 4 Next is disabled (`canContinue = total > 0`); server validates `items.length >= 1`. |
| Provider sets base price of 0 on Step 5 | Per-row validation shows "base price missing"; Next is disabled. |
| Overlapping availability windows | Per-day overlap check in Step 6; error shown inline. Breaks are allowed inside available windows (that's the point). |
| No availability set | Step 6 Next disabled until at least one non-break window exists. |
| Video shorter than 30 s | Client rejects before upload; server also CHECKs at DB level. |
| S3 upload fails halfway | Blob stays in memory; `err` state surfaces message; Retry is one button click. |
| Provider re-uploads a video that was rejected | Allowed — the rejected row stays for audit; a new pending row is inserted; partial unique index permits this because it excludes `status = 'rejected'`. |
| Provider switches religion after picking services | UI `confirm()` + server transaction deletes downstream provider_services and pricing rows. |
| Cross-religion pricing smuggle (custom_name from Hindu with Islam religion) | Custom names are religion-agnostic by design; catalogue IDs are not — `saveStep5` verifies every `service_id` maps to the provider's current religion. |

---

## Admin review pipeline

Not in this commit, but the data model is ready for it:

- `kyc_videos.status` is `pending | approved | rejected`. An internal admin UI (`/admin/kyc/:id/approve|reject`) updates this and stamps `reviewed_by`/`reviewed_at`.
- On approval, `providers.status` flips to `approved`, and the provider appears in devotee search (a future indexer job).
- On rejection, `review_notes` is populated and pushed via SMS/email. The partial unique index releases so the provider can upload again.
- Manual audit trail: the `kyc_videos` table is append-only — deletion is a soft action via `status`. This satisfies KYC retention requirements.

---

## Scaling notes

Paths that will get hot first at lakhs-of-providers scale:

1. **`/services?religion=<r>`** — cached on the edge (1 h TTL), keyed by religion. Invalidation on seed changes via deploy-triggered CDN purge.
2. **`/provider/draft` PATCH** — each provider writes every 3 seconds while active. Partition `onboarding_drafts` by `user_id` hash; rate-limit at 20 req/min per user at the gateway.
3. **KYC presign** — rate-limited to 6/min per provider to discourage grinding. Cloudfront in front of S3 for CDN-accelerated downloads when the admin UI streams video for review.
4. **`providers` status transitions** — an `after-update` trigger emits a domain event (`provider.status.changed`) into the outbox table; a worker picks it up for search indexing, notifications, and analytics. Keeps the request path cheap.

Indexes in place for the first wave of queries:

```sql
CREATE INDEX idx_providers_status_updated ON providers(status, updated_at DESC);
CREATE INDEX idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX idx_services_master_religion_category ON services_master(religion, category);
CREATE INDEX idx_availability_provider_day ON availability(provider_id, day_of_week);
CREATE INDEX idx_kyc_videos_provider_created ON kyc_videos(provider_id, created_at DESC);
```

---

## File map

```
religiogram-backend/
  src/
    migrations/
      1700000000012-CreateServiceProviders.ts     ← tables + enums + CHECKs + partial unique
      1700000000013-SeedServicesMaster.ts         ← ~50 services across religions
    service-providers/
      entities/
        provider.entity.ts
        service-master.entity.ts
        provider-service.entity.ts
        availability.entity.ts
        kyc-video.entity.ts
        onboarding-draft.entity.ts
      dto/onboarding.dto.ts
      pricing.ts
      service-providers.service.ts                ← ProviderOnboardingService
      services.controller.ts                      ← public /services?religion
      providers.controller.ts                     ← /provider/* (JWT)
      service-providers.module.ts

religiogram-frontend/
  lib/
    provider-onboarding-api.ts                    ← API client + wire types
    provider-onboarding-store.tsx                 ← context + 3-layer persistence
  components/provider-onboarding/
    WizardShell.tsx                               ← progress bar, sticky footer, Save badge
  app/(app)/provider-onboarding/
    layout.tsx                                    ← wraps children in Provider
    page.tsx                                      ← landing / resume
    step-1/page.tsx   Basic details
    step-2/page.tsx   Professional info
    step-3/page.tsx   Religion (gate for step 4)
    step-4/page.tsx   Services picker (religion-scoped)
    step-5/page.tsx   Pricing grid (live total preview)
    step-6/page.tsx   Weekly availability (with breaks)
    step-7/page.tsx   Video KYC (MediaRecorder + S3 PUT)
    submitted/page.tsx  Success screen
```
