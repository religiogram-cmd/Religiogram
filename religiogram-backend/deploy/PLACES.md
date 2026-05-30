# Place Profile System — System Guide

Sibling to [`TEMPLES.md`](./TEMPLES.md) and [`CITY_AND_ADMIN.md`](./CITY_AND_ADMIN.md). Covers the neutral, denomination-agnostic **Place Profile** surface: the detail page users land on when they tap a card, receive a share link, or open a push notification.

## Why "place", not "temple"

The original catalogue modelled everything as a `temples` row — fine for a launch in one city, insufficient as a platform. Generalising to "place of worship" (temple, mosque, church, gurudwara, other) unlocks a larger market, sidesteps the awkward "everything is a temple but we display it as a mosque" data model, and matches how admins already talk about editorial scope.

We did **not** rename the physical table. `user_favorites.temple_id`, analytics event metadata, and external share URLs (`/temple/<uuid>`) all reference the `temples.id` PK; renaming would force a weeks-long coordinated migration across services for no product gain. Instead the schema carries a `type` discriminator and the public API exposes the same rows under the `places` namespace.

## 1. Schema changes

Migration `1700000000008-CreatePlaceTypes.ts`:

- Creates the `place_type` enum: `'temple' | 'mosque' | 'church' | 'gurudwara' | 'other'`.
- Adds `temples.type place_type NOT NULL DEFAULT 'temple'`. Every existing row defaults to `'temple'`; admins flip later rows via the admin UI.
- Indexes `IDX_temples_type` on the new column for faceted filters ("all mosques in Lucknow").
- Creates `place_events` and `place_services`:

```
place_events (
  id          uuid PK
  place_id    uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE
  title       varchar(160) NOT NULL
  description text
  start_time  timestamptz NOT NULL
  end_time    timestamptz
  recurring   boolean NOT NULL DEFAULT false
  created_at  timestamptz DEFAULT now()
  updated_at  timestamptz DEFAULT now()
)

place_services (
  id          uuid PK
  place_id    uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE
  name        varchar(120) NOT NULL
  description text
  created_at  timestamptz DEFAULT now()
  updated_at  timestamptz DEFAULT now()
)
```

Column name is `place_id` but it physically FKs to `temples.id` — the neutral naming makes the schema read consistently even though the base table wasn't renamed.

Indexes: `IDX_place_events_place_start (place_id, start_time)` for "next events at this place" lookups, `IDX_place_services_place (place_id, created_at)` for sorted service reads.

Both FKs are `ON DELETE CASCADE` so an admin hard-delete of a place drops orphaned events and services automatically — matches the CASCADE policy already in use for `user_favorites`.

## 2. Public API

All routes are `@Public()` — the profile page is shareable and indexable.

| Method | Path                             | Purpose                                                          |
|--------|----------------------------------|------------------------------------------------------------------|
| GET    | `/api/v1/places/:id`             | Full profile: place + next 10 upcoming events + services list    |
| GET    | `/api/v1/places/:id/events`      | Dedicated events list; `?upcoming=0&limit=100` for admin/history |
| GET    | `/api/v1/places/:id/services`    | Dedicated services list                                          |

Each route carries a per-user/IP throttle of 120 req/min — a shared viral link can get hundreds of reads a minute, but a scraper gets slowed.

### Response shapes

```ts
PlaceDetail {
  id, type, name, city, state, address,
  lat, lng, ratingAvg, ratingCount,
  openingHours, imageUrl, isVerified,
  upcomingEvents: PlaceEvent[],
  services: PlaceServiceItem[],
}

PlaceEvent {
  id, placeId, title, description,
  startTime (ISO), endTime (ISO | null),
  recurring, createdAt (ISO),
}

PlaceServiceItem {
  id, placeId, name, description, createdAt (ISO),
}
```

### Caching

Pattern mirrors `temples.service.ts` — `INCR places:cache:version` on any admin mutation, prepend the version to every read key, 1-second in-process memo to avoid a Redis RTT on every request.

Key prefixes + TTLs:

- `places:v{v}:detail:{id}`  — 10 min
- `places:v{v}:events:{id}:u{upcomingOnly}:l{limit}`  — 5 min
- `places:v{v}:services:{id}`  — 30 min (services change rarely)

A place detail hit serves from Redis in O(1) with no DB touch. A typical viral-share load spike stays entirely in Redis.

## 3. Admin API

All routes are gated by `JwtAuthGuard + RolesGuard + @Roles('admin')`.

| Method | Path                                                  | Body                       | Purpose       |
|--------|-------------------------------------------------------|----------------------------|---------------|
| GET    | `/api/v1/admin/places/:id/events?upcoming=0&limit=100`| —                          | Admin events  |
| POST   | `/api/v1/admin/places/:id/events`                     | `CreatePlaceEventDto`      | Add event     |
| PUT    | `/api/v1/admin/places/:id/events/:eventId`            | `UpdatePlaceEventDto`      | Edit event    |
| DELETE | `/api/v1/admin/places/:id/events/:eventId`            | —                          | Remove event  |
| GET    | `/api/v1/admin/places/:id/services`                   | —                          | Admin services|
| POST   | `/api/v1/admin/places/:id/services`                   | `CreatePlaceServiceDto`    | Add service   |
| PUT    | `/api/v1/admin/places/:id/services/:serviceId`        | `UpdatePlaceServiceDto`    | Edit service  |
| DELETE | `/api/v1/admin/places/:id/services/:serviceId`        | —                          | Remove service|

Validation rules:

- `title` 2–160 chars, `description` ≤ 4000 chars, `startTime` ISO8601, `endTime` optional ISO8601 (must be > startTime, enforced service-side).
- Service `name` 2–120 chars, `description` ≤ 2000 chars.
- Forbid-unknown-properties is on globally, so stray keys are stripped before validation.

Every admin mutation calls `placesService.bustCaches()` which `INCR`s `places:cache:version` — all three read caches invalidate in one round-trip without SCAN fan-out.

Future "owner" role (a place's own account can edit its events) is a one-line change in `@Roles(...)` plus a method-level guard that scopes to the `place_id`. Not shipping yet.

## 4. Neutrality rules

Enforced by convention, not schema:

- The `type` column picks iconography and a chip label in the UI; nothing branches on denomination beyond that.
- UI labels are generic: "Event", "Gathering", "Service" — no "aarti", "salah", "mass".
- Place type chip displays the factual noun ("Temple", "Mosque", "Church", "Gurudwara") rather than a loaded synonym.
- Admins populate all religion-specific vocabulary in event/service titles. The product's job is to keep the scaffolding neutral.
- The donate flow has zero religious language — the CTA says "Donate", the placeholder says "Support {placeName}".

## 5. Frontend surface

### Route: `/place/[id]`

Thin route under the `(app)` group (inherits auth guard + bottom nav). Behaviour lives in `components/places/PlaceProfile.tsx`.

`PlaceProfile` sections, in order:

1. **Header** — image banner (next/image, WebP + lazy), name, type chip, verified badge, rating, address, opening hours.
2. **Action bar** — sticky four-button cluster: Donate (opens modal), Events (jump), Services (jump), Location (jump).
3. **Donate section** — large CTA; opens the `DonateModal` (placeholder, no payment integration).
4. **Events section** — next 10 upcoming events, each with a date badge, neutral "Recurring" chip when applicable, and a friendly "Today, 6:00 AM" / "Mon, 18 May · 8:00 PM – 9:30 PM" when-line. Empty state: "No upcoming events — check back soon."
5. **Services section** — 2-column grid of name + description. Empty state: "No services listed yet."
6. **Location section** — Google Maps Static API preview (no interactive SDK load on first paint) + address + lat/lng + "Open in Maps" universal link.

### Data flow

- One `placesApi.get(id)` call on mount pulls everything.
- Retry-tick pattern handles transient failures (same as TempleDetail).
- No SSR — client-side fetch so the in-memory access token is available.

### Client library: `lib/api.ts`

The `placesApi` block exports:

```ts
placesApi.get(id)                                  → Promise<PlaceDetail>
placesApi.listEvents(id, { upcomingOnly, limit })  → Promise<PlaceEvent[]>
placesApi.listServices(id)                         → Promise<PlaceServiceItem[]>
```

Types `Place`, `PlaceDetail`, `PlaceEvent`, `PlaceServiceItem`, `PlaceType` are exported alongside.

## 6. Verification checklist

Schema:

- [ ] `npm run migration:run` runs clean against a fresh DB.
- [ ] `SELECT type FROM temples LIMIT 1` returns `'temple'` for existing rows.
- [ ] `\d+ place_events` shows FK cascade to `temples`.
- [ ] Hard-deleting a temple drops orphaned events and services.

Public API:

- [ ] `GET /api/v1/places/:id` returns a `PlaceDetail` with `type`, `upcomingEvents`, `services`.
- [ ] `GET /api/v1/places/<unknown-uuid>` returns `404 Place not found`.
- [ ] `GET /api/v1/places/:id/events?upcoming=1` excludes past events.
- [ ] Repeated GETs to the same id hit Redis on the 2nd call (no DB rows read).

Admin API:

- [ ] A non-admin user gets `403` on `POST /api/v1/admin/places/:id/events`.
- [ ] `POST` with `endTime < startTime` returns `400 endTime must be after startTime`.
- [ ] `PUT /admin/places/:id/events/:eventId` with a partial body keeps un-mentioned fields intact.
- [ ] Any admin mutation increments `places:cache:version` in Redis by 1.
- [ ] The next public `GET /places/:id` reflects the edit within the 1 s in-process memo window.

Frontend:

- [ ] `/place/<uuid>` renders the full profile on a cold visit.
- [ ] The action bar's Donate opens the placeholder modal; Events / Services / Location smoothly scroll to the matching section.
- [ ] A place with no events renders the neutral empty card, not an error.
- [ ] A place with no services renders the neutral empty card.
- [ ] "Open in Maps" opens the native maps app on mobile and Google Maps on desktop.
- [ ] Switching a place's `type` column in the DB updates the chip label on next refresh.

## 7. Migration order

```
1700000000001 — users
1700000000002 — profiles
1700000000003 — uploads
1700000000004 — temples + PostGIS / pg_trgm / pgcrypto extensions
1700000000005 — temple seed
1700000000006 — analytics_events
1700000000007 — user_favorites
1700000000008 — place_type enum + temples.type + place_events + place_services
1700000000009 — temples.owner_id + place_claims
1700000000010 — event_reminders
```

No data migration required — all existing temples default to `type = 'temple'` on column add. `owner_id` is nullable and seeds as NULL; admins or the claim flow populate it later.

## 8. Claim system — self-service ownership

Admin-only listings don't scale past a few thousand places. The claim surface lets real custodians (a temple's head priest, a mosque's imam, a church's secretary) request ownership of their page; once an admin approves, the user can edit events/services for that place without admin involvement.

### Schema (migration 1700000000009)

```
temples
  + owner_id uuid NULL REFERENCES users(id) ON DELETE SET NULL

place_claims (
  id              uuid PK
  place_id        uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE
  user_id         uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE
  status          claim_status NOT NULL DEFAULT 'pending'
  claim_evidence  text NOT NULL
  contact_email   varchar(255)
  contact_phone   varchar(20)
  admin_notes     text
  reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL
  reviewed_at     timestamptz
  created_at, updated_at
)
```

`claim_status` enum: `pending | approved | rejected | withdrawn`.

Indexes:

- `UQ_place_claims_pending (place_id, user_id) WHERE status = 'pending'` — one active pending claim per user per place.
- `IDX_place_claims_status_created (status, created_at DESC)` — admin review queue.
- `IDX_place_claims_user_created (user_id, created_at DESC)` — "my claims" list.
- `IDX_temples_owner (owner_id) WHERE owner_id IS NOT NULL` — fast "places I own" lookups for future surfaces.

Rejected / withdrawn rows are retained for audit and so a reviewer sees prior history on resubmission.

### Routes

User-facing (auth required):

| Method | Path                                 | Purpose                              |
|--------|--------------------------------------|--------------------------------------|
| POST   | `/api/v1/places/:id/claim`           | Submit a claim (5/hour per user)     |
| GET    | `/api/v1/places/:id/claim/status`    | Status of my claim on this place     |
| DELETE | `/api/v1/places/:id/claim`           | Withdraw my pending claim            |
| GET    | `/api/v1/me/claims`                  | List all my claims                   |

Admin (`@Roles('admin')`):

| Method | Path                                               | Purpose                     |
|--------|----------------------------------------------------|-----------------------------|
| GET    | `/api/v1/admin/claims?status=pending`              | Review queue                |
| POST   | `/api/v1/admin/claims/:claimId/approve`            | Approve + flip ownership    |
| POST   | `/api/v1/admin/claims/:claimId/reject`             | Reject with admin notes     |
| POST   | `/api/v1/admin/places/:id/transfer-owner`          | Direct owner assignment     |

Owner-scoped management (`OwnerOrAdminGuard`):

| Method         | Path                                                  |
|----------------|-------------------------------------------------------|
| GET            | `/api/v1/places/:id/manage/events`                    |
| POST           | `/api/v1/places/:id/manage/events`                    |
| PUT            | `/api/v1/places/:id/manage/events/:eventId`           |
| DELETE         | `/api/v1/places/:id/manage/events/:eventId`           |
| GET/POST/PUT/DELETE | `/api/v1/places/:id/manage/services[/:serviceId]` |

`OwnerOrAdminGuard` reads `req.params.id`, fetches `temples.owner_id`, and lets the request through if the user matches or carries role `admin`. Non-owners get 403; missing places surface as 404.

### Approval atomicity

Approval runs inside a TypeORM transaction that commits three changes together:

1. The subject claim transitions to `approved`.
2. Every other pending claim on the same place is auto-rejected with a standard "another claim was approved" note.
3. `temples.owner_id` is set to the claimant's user id.

A crashed pod mid-approve can never leave a place with two "approved" claim rows. After commit the places cache version is bumped so `/places/:id` reflects the new state immediately.

### UX — frontend ClaimBanner

Displayed under the header on `/place/[id]`. States:

- Signed out → hidden.
- No claim yet → "Are you a custodian of this place?" CTA that opens a modal with an evidence textarea (≥ 20 chars, ≤ 4000), email, and phone.
- Pending → dim amber card "Claim under review".
- Approved → green card "You manage this place".
- Rejected → red-tinted card with the admin's note + "Submit a new claim".

A signed-in visitor who owns the place gets the approved card; the future "Manage Events" tooling hangs off that state.

## 9. Event reminders + add-to-calendar

Static event lists don't drive retention. A tap that turns a listing into a scheduled notification does. The reminder surface is where most of the engagement value lives.

### Schema (migration 1700000000010)

```
event_reminders (
  id         uuid PK
  event_id   uuid NOT NULL REFERENCES place_events(id) ON DELETE CASCADE
  user_id    uuid NOT NULL REFERENCES users(id)        ON DELETE CASCADE
  remind_at  timestamptz NOT NULL
  status     reminder_status NOT NULL DEFAULT 'scheduled'
  sent       boolean NOT NULL DEFAULT false
  sent_at    timestamptz
  error      text
  created_at, updated_at
)
```

`reminder_status` enum: `scheduled | sent | cancelled | failed`.

Indexes tuned for the three hot queries:

- `UQ_event_reminders_active (event_id, user_id) WHERE status = 'scheduled'` — "am I subscribed?".
- `IDX_event_reminders_due (remind_at) WHERE status = 'scheduled' AND sent = false` — dispatcher scan; partial on scheduled-only keeps the B-tree tight even when sent/cancelled rows pile up.
- `IDX_event_reminders_user_remind (user_id, remind_at DESC)` — "my reminders" list.

### Routes

| Method | Path                                                      | Auth    | Purpose            |
|--------|-----------------------------------------------------------|---------|--------------------|
| POST   | `/api/v1/places/:id/events/:eventId/remind`               | User    | Subscribe          |
| DELETE | `/api/v1/places/:id/events/:eventId/remind`               | User    | Unsubscribe        |
| GET    | `/api/v1/me/reminders`                                    | User    | My reminders       |
| GET    | `/api/v1/places/:id/events/:eventId/ics`                  | Public  | Add to calendar    |

Subscribe body: `{ leadMinutes?: number }`. Default 60 minutes before `event.startTime`. The service rejects reminders that are already past due or more than a year in the future. Unsubscribe is idempotent — double-taps don't 404.

### BullMQ dispatcher

`EventRemindersScheduler` registers a repeatable BullMQ job every 60 s; `EventRemindersDispatcherProcessor` runs at concurrency = 1 and calls `EventRemindersService.dispatchDue()`:

1. `SELECT … WHERE status = 'scheduled' AND sent = false AND remind_at <= now() LIMIT 200` (partial index above makes this a cheap B-tree scan).
2. For each row, dispatch the notification (MVP: log-backed; real push/email transport slots in as a NotificationDispatcher port).
3. Flip the row to `sent` on success, `failed` with `error` on throw.

The batch loop saves one row at a time. With typical traffic (hundreds of scheduled rows per tick at most), that's fine; moving to a batched save is a straightforward optimisation later. Retries with exponential backoff (3 attempts) handle transient DB / Redis hiccups.

Why not per-reminder delayed jobs in BullMQ? A popular event with 10 k subscriptions would park 10 k jobs in Redis all waiting for one promoted_at timestamp. The batched scan against a partial index stays O(due-rows) regardless of total subscriptions.

### ICS / add-to-calendar

`GET /places/:id/events/:eventId/ics` returns a single-VEVENT calendar file:

- UTC `DTSTAMP` / `DTSTART` / `DTEND` with CRLF line endings (Outlook chokes on LF-only).
- UID = `<eventId>@religiogram` so calendar clients dedupe on re-import.
- LOCATION combines place name + address + city.
- Recurring events emit `RRULE:FREQ=WEEKLY` (upgraded to arbitrary RRULE when the backend carries structured recurrence).
- `Content-Disposition: attachment; filename="<slug>.ics"` + 10-min edge cache.

Frontend threads an `<a href={remindersApi.icsUrl(...)}>` — no library, no SDK load, OS handles the handoff.

### UX — frontend engagement row

`EventCard` grows two actions below the description:

- **Remind me** — toggles subscription via `remindersApi.subscribe/unsubscribe`. Shows outline when off, filled amber when on, with ARIA `aria-pressed`. Signed-out users get an inline "Sign in to get reminders" message instead of a silent failure.
- **Add to calendar** — plain `<a href>` to the ICS URL. No JS fetch/blob dance.

### Verification checklist additions

Claims:

- [ ] `POST /places/:id/claim` with valid evidence returns a `pending` claim.
- [ ] A second submit by the same user returns `409`.
- [ ] Submitting on a place with an existing owner returns `409`.
- [ ] Admin approve flips `temples.owner_id` and auto-rejects other pending claims on the same place — transactionally (kill the pod mid-approve; no double-owner state).
- [ ] A non-owner hits 403 on `POST /places/:id/manage/events`; the owner succeeds.
- [ ] The ClaimBanner hides for anonymous viewers and shows the correct state (none/pending/approved/rejected) for signed-in viewers.

Reminders:

- [ ] Subscribe returns the scheduled `remindAt = startTime - 60 min`.
- [ ] Second subscribe by the same user → `409`.
- [ ] Unsubscribe returns `{ success: true }` even when nothing was subscribed.
- [ ] `GET /me/reminders` lists scheduled + sent rows with embedded event + place.
- [ ] Dispatcher flips due rows to `status = 'sent'` within one minute of `remind_at`.
- [ ] A failed dispatch lands on `status = 'failed'` with `error` populated.
- [ ] `GET /places/:id/events/:eventId/ics` returns CRLF-terminated, Outlook-openable content with the attachment header.
- [ ] EventCard's Remind toggle shows filled bell + aria-pressed when active; Add-to-calendar opens the OS calendar app on mobile.

## 10. Content moderation — user reports + admin review

Once users can subscribe to events and save services, the long tail of low-effort or outright inappropriate content starts to matter. The report pipeline lets any signed-in user flag a specific `place_events` or `place_services` row; an admin reviews and either hides the target (approve) or closes the report (reject). Hidden rows vanish from every public read but stay in the database for audit and appeal.

### Schema (migration 1700000000011)

```
report_target_type enum ('event','service')
report_status      enum ('pending','reviewed','rejected')

content_reports (
  id          uuid PK
  user_id     uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE
  place_id    uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE
  target_type report_target_type NOT NULL
  target_id   uuid NOT NULL
  reason      text NOT NULL
  status      report_status NOT NULL DEFAULT 'pending'
  admin_note  text
  reviewed_at timestamptz
  created_at, updated_at
)
```

Plus a UNIQUE INDEX `UQ_content_reports_user_target (user_id, target_id)` — a single user can only flag a given row once. Dedup races land in a PG 23505 which the service translates to `ConflictException`.

Indexes matched to the three hot queries:

- `IDX_content_reports_target (target_type, target_id)` — "has this row been reported?" for the admin panel's target preview.
- `IDX_content_reports_status_created (status, created_at DESC)` — admin queue, newest-first.
- `IDX_content_reports_place_created (place_id, created_at DESC)` — "what's been flagged at this place?" view.

Same migration adds `is_hidden boolean NOT NULL DEFAULT false` to both `place_events` and `place_services`, plus partial indexes `(place_id, start_time) WHERE is_hidden = false` / `(place_id, created_at) WHERE is_hidden = false` so the public `listEvents` / `listServices` paths stay cheap even when a majority of rows are hidden. `target_id` is deliberately not FKed — it references one of two tables; the service validates at write time that the row exists and that its `place_id` matches.

### Routes

| Method | Path                                     | Auth   | Throttle   | Purpose                    |
|--------|------------------------------------------|--------|------------|----------------------------|
| POST   | `/api/v1/reports`                        | User   | 5/hour     | Submit a report            |
| GET    | `/api/v1/admin/reports?status=…`         | Admin  | default    | Queue — pending by default |
| PATCH  | `/api/v1/admin/reports/:id/review`       | Admin  | default    | Approve / reject           |
| POST   | `/api/v1/admin/reports/unhide`           | Admin  | default    | Un-hide an appealed target |

Submit body: `{ placeId, targetType: 'event'|'service', targetId, reason }`. `reason` is 10–1000 chars; the target row must exist **and** its `place_id` must match the submitted `placeId` — belt-and-braces against a tampered payload asking the admin queue to surface a row on the "wrong" place.

Submission is blocked when the reporter owns the place; owners have `/manage` endpoints instead. The 5-per-hour per-user throttle is enforced by `UserThrottlerGuard` with an IP fallback — a burst-flag attack can't outrun it without multiple accounts.

### Approve is transactional

```
dataSource.transaction(trx => {
  update content_reports set status='reviewed', admin_note=?, reviewed_at=now() where id=?
  update (place_events|place_services) set is_hidden=true where id=?
  placesService.bustCaches(place_id)
})
```

A crashed pod between the three writes would leave a "reviewed" report with a still-visible target — transactional wrapping keeps the system honest. Reject is non-transactional: a single row flip + cache bust. The cache bust itself is an `INCR` on the Redis version key used by `/places/:id` and `/places/:id/events` caches; no per-key invalidation, no stale reads.

### Admin list response

The admin queue returns each report hydrated with:

- `reporter: { id, name, phone }` — who filed.
- `place: { id, name, type, city }` — where.
- `targetPreview: { title, description, isHidden, exists }` — pulled from `place_events` or `place_services` via a LEFT JOIN keyed by `target_type`. `exists: false` means the target was already deleted (rare but valid — someone reported a row, the owner removed it before review).

Keeping the preview here instead of making the admin click through saves the moderator a round-trip per review.

### Frontend surface

`components/places/ReportModal.tsx` owns the flow:

- Both `EventCard` and `ServiceCard` render a small outlined Report pill; tapping opens the modal with the right `targetType` + `targetId` + `placeId`.
- Not signed in → the modal renders an inline "Sign in to submit a report" instead of hitting the API. Saves a wasted round-trip and reads as a clearer prompt than a toast.
- On submit success → the form is replaced with a green confirmation and the Submit button is removed — the UI enforces what the `UNIQUE (user_id, target_id)` index enforces at the DB layer.
- 409 is surfaced as "You've already reported this"; 429 as "Too many reports recently".
- Analytics: `analytics.reportSubmitted(targetType, placeId, targetId)` fires on success. Server-side, `report_resolved` is emitted at approve/reject time so the rate-of-resolution is trackable without a polling job.

Both new event types are in the `ANALYTICS_EVENT_TYPES` allowlist; adding them was a two-line change on both sides of the wire.

### Verification checklist additions

- [ ] `POST /reports` with a valid payload returns a `pending` row.
- [ ] A second submit by the same user on the same target returns `409`.
- [ ] Submitting with a `targetId` that doesn't belong to `placeId` returns `400`.
- [ ] Submitting with a target the owner controls (owner reporting their own content) returns `400`.
- [ ] 6th submission within an hour returns `429`.
- [ ] Approve flips the target's `is_hidden = true` AND the report to `reviewed` AND busts the place cache — atomically (kill the pod mid-approve; no split state).
- [ ] Approved events/services no longer appear in `/places/:id`, `/places/:id/events`, or `/places/:id/services`.
- [ ] Admin can unhide via `POST /admin/reports/unhide`; the row reappears in public reads within one tick.
- [ ] Frontend: EventCard + ServiceCard both show a Report pill; modal blocks submit for signed-out users; successful submit replaces the form with a confirmation and disables re-submission.

## 11. Location Intelligence — distances + nearby places

Discovery's long-term engagement is "what's near me?" more than "what did I search for?". The profile now carries a distance line in the header and a horizontal strip of nearby places below Services. Both surfaces share the user's (lat, lng) when the browser has granted geolocation; otherwise the strip falls back to the anchor place's own coords so anonymous or location-denied users still see something meaningful.

### Backend: distanceKm on detail

`PlacesService.getDetail(id, userCoords?)` accepts an optional `{ lat, lng }` and layers a Haversine-computed `distanceKm` onto the cached response:

- The Redis cache key is unchanged (`places:v{v}:{id}`) — we deliberately do NOT include the caller's coords in the key. Folding coords in would shatter the cache across every viewer and turn a hot read into a near-miss.
- Distance is computed AFTER the cache layer, in-process, per request. Haversine on two doubles is ~20 ns; the savings from not baking per-viewer values into Redis dwarf any CPU cost.
- The field is `null` (not omitted) when the place has no usable coords — keeps the response shape stable.

### Backend: /places/:id/nearby

| Method | Path                          | Auth   | Throttle   |
|--------|-------------------------------|--------|------------|
| GET    | `/api/v1/places/:id/nearby`   | Public | 60/min     |

Query params (all optional): `lat`, `lng`, `radiusKm` (clamped 1–50, default 15), `limit` (clamped 1–50, default 10). Partial input (only `lat` or only `lng`) is a 400.

Implementation uses PostGIS `ST_DWithin` + `ST_Distance` against `temples.location`, excluding the anchor place, ordered by distance. When the caller provides no coords the query point falls back to the anchor's own `(lat, lng)` so a share-link viewer with no location permission still gets "places near this one".

Cached in Redis for 300 s, keyed by place id + rounded coords + radius + limit:

```
places:v{version}:nearby:{anchorId}:{roundLat}:{roundLng}:r{radius}:l{limit}
```

Rounding lat/lng to ~3 decimals (≈100 m) folds neighbouring callers onto the same cache slot. `{version}` is bumped by `bustCaches(place_id)` — the same key that moderation + admin writes already use — so a newly hidden / newly added place propagates without per-key eviction logic.

### Frontend: useUserLocation + NearbyPlacesSection

- `hooks/useUserLocation.ts` wraps the existing `useGeolocation` and layers:
  - `shouldPromptBanner` — true when coords aren't available and the user hasn't persistently dismissed.
  - `dismissPrompt()` — writes a `localStorage` flag so the soft prompt stays hidden across tab opens.
  - One-shot analytics beacons (`location_permission` with `granted`/`denied`/`unavailable`) so the opt-in funnel is measurable.
- `PlaceProfile` wires the hook into both the detail fetch (second fetch fires as soon as coords arrive — the page renders immediately, distance hydrates when ready) and `NearbyPlacesSection`.
- `components/places/NearbyPlacesSection.tsx` is a horizontal-scroll strip with scroll-snap, skeleton row, and an `IntersectionObserver` that fires `nearby_viewed` the first time the strip enters the viewport. Each card emits `nearby_clicked(anchorPlaceId, nearbyPlaceId, index)` on tap. Empty / error states silently hide the section — nearby is nice-to-have, not required.
- `formatDistanceKm` is shared: metres below 1 km (rounded to nearest 10 m so "0.3 km" doesn't show up as false precision), one decimal place up to 10 km, integer kilometres above. Used both in the header distance chip and the card chip.

### Analytics additions

Allowlist grows on both client and server:

- `nearby_viewed { anchorPlaceId, count }` — fired once per profile visit when the strip first hits the viewport.
- `nearby_clicked { anchorPlaceId, nearbyPlaceId, index }` — fired on card tap, before navigation, with the card's rank in the strip.
- `location_permission { result }` — reused from the permissions flow; now also fires from the in-profile prompt so opt-in rate per surface is tracked separately.

### Verification checklist additions

- [ ] `GET /places/:id` with no coords returns the profile unchanged; `distanceKm` absent or null.
- [ ] `GET /places/:id?lat=&lng=` with both present populates `distanceKm` with a Haversine value.
- [ ] `GET /places/:id?lat=` with only one of the pair returns `400`.
- [ ] `GET /places/:id/nearby?lat=&lng=` returns up to 10 rows within 15 km, sorted ascending, anchor excluded.
- [ ] `GET /places/:id/nearby` (no coords) falls back to the anchor's coords and still returns results.
- [ ] Hiding an event / service via moderation does not remove a row from `/nearby` (nearby is about places, not events).
- [ ] Cache: a second `/nearby` call within 5 min is served from Redis; after `bustCaches(place_id)` the next call re-queries.
- [ ] Frontend: `PlaceProfile` renders immediately even with location denied; distance chip does not render. With location granted, the chip and the nearby strip show and `nearby_viewed` fires when the strip scrolls into view.
- [ ] The "Enable location" banner stays dismissed across a full page reload (localStorage persisted).
- [ ] `nearby_clicked` events include a zero-based `index`; the card link still navigates to `/place/<id>` on tap.
