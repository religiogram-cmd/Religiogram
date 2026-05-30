# City Launch, Admin CRUD & Analytics — System Guide

Sibling to [`TEMPLES.md`](./TEMPLES.md). This doc covers the features that shipped on top of the initial Temple Discovery surface for the city-by-city launch, plus the retention/resilience layer wired in right before scale:

1. **City-first experience** — static launch-city list, GPS-optional fallback, frontend state provider.
2. **Admin temples CRUD** — JWT + RBAC-guarded write surface with duplicate control and versioned cache busting.
3. **Analytics events** — fire-and-forget event beacon with JSONB storage and a 30-day BullMQ sweeper.
4. **Favorites** — per-user saved temples with an idempotent write surface, mirrored by the client `useFavorites` singleton.

---

## 1. City-first experience

### Why

A large chunk of first-time users (especially on desktop and older mobile browsers) either deny location or use a browser that refuses the prompt in an iframe. Until now the Local tab was dead weight for them. The fix is deliberate and minimal: hardcode the six launch cities and let the user pick one.

### Launch city list

Source of truth: `src/common/config/cities.config.ts` (backend) mirrored at `lib/cities.ts` (frontend). Both files keep the same slug / display-name / lat / lng so a round-trip through either API works without translation.

| Slug       | Display name | Anchor coordinate   |
|------------|--------------|---------------------|
| `delhi`    | Delhi        | 28.6139, 77.2090    |
| `mumbai`   | Mumbai       | 19.0760, 72.8777    |
| `kolkata`  | Kolkata      | 22.5726, 88.3639    |
| `lucknow`  | Lucknow      | 26.8467, 80.9462    |
| `ahmedabad`| Ahmedabad    | 23.0225, 72.5714    |
| `varanasi` | Varanasi     | 25.3176, 82.9739    |

### Backend behaviour

`GET /api/v1/temples/nearby` now accepts **either** `lat`+`lng` (GPS-precise) **or** `city=<slug>` (anchor the search at the city's centroid). The DTO uses `class-validator`'s `@ValidateIf((o) => !o.city)` on `lat` / `lng`, so exactly one path is required.

```
GET /api/v1/temples/nearby?lat=28.61&lng=77.27&radiusKm=5
GET /api/v1/temples/nearby?city=delhi&radiusKm=15
```

`resolveCity(slug)` is the only place that maps a slug → coords; the service never trusts raw strings from the client for the anchor. An unknown or missing slug + missing coords returns `400 BAD_REQUEST` with `code: 'LOCATION_REQUIRED'`.

Redis keys are namespaced separately per path (`temples:nearby:{lat}:{lng}:...` vs `temples:nearby:city:{slug}:...`) so GPS and city-anchor results don't contaminate each other.

### Frontend behaviour

The selection lives in a React Context (`contexts/CityContext.tsx`) and is persisted to `localStorage` under `rg_selected_city`. We chose Context + `useCity()` over Zustand/Redux on purpose — the state is a single scalar, and introducing a second store for one value would just split the mental model.

Bootstrap order on `/home`:

1. `<CityProvider>` hydrates `city` from `localStorage` (inside a `useEffect` to avoid SSR mismatch).
2. `TempleDiscovery` checks three signals: (a) has GPS coords? (b) has a saved city? (c) did the user dismiss the modal already?
3. If no GPS **and** no saved city **and** the modal isn't open → open `<CitySelectorModal>`.
4. Picking a city writes to Context + `localStorage`, closes the modal, and fires `analytics.citySelected(slug, 'modal')`.

Users can re-open the modal later via the city pill in the header. The pill label is the current city's display name; it falls back to "Choose city" when the value is null.

`CitySelectorModal` details:

- `role="dialog"` with `aria-modal="true"`.
- A `radiogroup` of six city buttons arranged in a 2-column grid.
- Esc key + backdrop-click close (backdrop close is disabled on first open when `city === null`, so the user must make a choice).
- Focus moves to the first button on open; focus is restored to the pill on close.

---

## 2. Admin temples CRUD

### Routes

| Method | Path                        | Body                    | Purpose                        |
|--------|-----------------------------|-------------------------|--------------------------------|
| GET    | `/api/v1/admin/temples`     | —                       | List temples (admin view, includes unverified by default) |
| GET    | `/api/v1/admin/temples/:id` | —                       | Read a single temple            |
| POST   | `/api/v1/admin/temples`     | `CreateTempleDto`       | Create a temple                 |
| PUT    | `/api/v1/admin/temples/:id` | `UpdateTempleDto`       | Partial update                  |
| DELETE | `/api/v1/admin/temples/:id` | —                       | Hard delete                     |

### Guards

Class-level:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/temples', version: '1' })
```

Order matters — `JwtAuthGuard` populates `req.user`, then `RolesGuard` reads the `roles` array off the user and matches against `@Roles(...)`. A non-admin user gets `403 FORBIDDEN`, not `404`, so the failure is diagnosable.

### Validation (DTO sketch)

```ts
class CreateTempleDto {
  @IsString() @Length(2, 200) name!: string;
  @IsString() @Length(2, 100) city!: string;
  @IsOptional() @IsString() @Length(2, 100) state?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsOptional() @IsString() @MaxLength(120) hours?: string;
  @IsOptional() @IsString() @MaxLength(80) deity?: string;
  @IsOptional() @IsBoolean() isVerified?: boolean;
  @IsOptional() @IsUrl() imageUrl?: string;
}

class UpdateTempleDto extends PartialType(CreateTempleDto) {}
```

All fields optional in the update DTO. Forbid-unknown-properties is on (app-wide), so stray keys are stripped before validation.

### Write path nuances

1. **Exact duplicate guard** — `create()` first does a case-insensitive uniqueness check on `(LOWER(name), LOWER(city))` before inserting; collision returns `409 CONFLICT` with `code: 'TEMPLE_ALREADY_EXISTS'`. Not a unique index because exact-dup names across cities are valid (e.g. "Hanuman Mandir" in every city); name+city matches the editorial convention.
2. **Near-duplicate guard (pg_trgm)** — after the exact check passes, `create()` runs a `similarity()` lookup against temples in the same city (or within ~200 m if no city match) with a threshold of **0.6**. Any hit returns `409 CONFLICT` with `code: 'TEMPLE_NEAR_DUPLICATE'` and a `candidates` array of up to three suggestions: `{ id, name, city, similarity }`. This stops the common failure mode where an admin types "Shri Hanuman Mandir" when "Hanuman Mandir" already exists one block away.
   - **Bypass**: pass `force: true` in the `CreateTempleDto` to skip the near-duplicate check (the exact guard still runs). Use when the operator has confirmed the suggestion is unrelated. The body field is validated via `@IsOptional() @IsBoolean() force?: boolean`.
   - The `pg_trgm` extension is created in migration `1700000000004` and indexed on `LOWER(name)` via `gin_trgm_ops` to keep the `similarity()` lookup sub-millisecond even with tens of thousands of rows.
3. **Atomic coord update** — when `lat` / `lng` change, the SET clause pushes both scalars **and** rewrites `location` inside the same `UPDATE`:
   ```sql
   UPDATE temples
     SET lat = $1, lng = $2, location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, ...
     WHERE id = $n
   ```
   This avoids a split read where a reader could see new coords but the old geometry.
4. **Dynamic SET clause** — only columns present in the DTO are pushed, so a partial update doesn't null out unrelated fields.
5. **Hard delete** — no soft delete yet; admin deletion is intentional and rare. Can be revisited once the reviews module ships (soft delete will be required then to preserve review-chain integrity).

### Cache invalidation (versioned keys)

Every admin write calls `bustCaches()`, which issues an **`INCR temples:cache:version`** against Redis and returns the new integer. The read paths (`/nearby`, `/list`, `/search`) prepend this version to their Redis keys:

```
temples:v{version}:nearby:{lat}:{lng}:{radiusKm}:{limit}
temples:v{version}:list:{city}:{limit}:{offset}
temples:v{version}:search:{q}:{city}:{limit}
```

When the version is bumped, the old key space is instantly orphaned — no SCAN-DEL fan-out, no hot-spotted shard, no stale reads. The orphaned keys expire naturally on their original TTL.

To avoid a Redis round-trip on every read path, each Node pod caches the current version in-process for **one second**. The worst-case staleness is therefore `1s + whatever was already in the short TTL window` after an admin edit — acceptable for a curated catalogue, and tunable up or down.

`bustCaches()` is called from every `POST` / `PUT` / `DELETE` handler in the admin controller. It is **not** called from `/nearby`, `/list`, or `/search` — those are pure reads.

Why `INCR` and not `SET <timestamp>`?

- **Monotonic** — a monotonic counter avoids the "two writers in the same ms" race that `SET <timestamp>` can hit.
- **Cheap** — one Redis command, no clock read, no string parsing on the read path.
- **Observable** — the counter doubles as a lifetime-writes audit number for the admin dashboard.

---

## 3. Analytics events

### Endpoint

```
POST /api/v1/analytics/event
Content-Type: application/json
Authorization: Bearer <jwt>          (optional — anonymous events also accepted)

{
  "eventType": "temple_click",
  "metadata":  { "templeId": "...", "source": "list" },
  "clientTs":  "2026-04-18T06:21:44.200Z"  (optional; echoed into metadata)
}
```

Response: `202 Accepted`. No body. The client beacon is fire-and-forget — it doesn't await.

### Event type allowlist

Defined in `analytics/dto/log-event.dto.ts`:

```
search_query
temple_click
city_selected
tab_switch
location_permission
notification_permission
favorite_toggle
```

`@IsIn(ANALYTICS_EVENT_TYPES)` rejects anything else. Adding a new type is a one-line change in that const + a validator redeploy; no migration needed thanks to the JSONB column.

`favorite_toggle` was added alongside the Favorites module (§4). Metadata shape: `{ templeId, favorited: boolean, source: 'card' | 'detail-hero' }`.

### Rate limit

`@UseGuards(UserThrottlerGuard) @Throttle({ default: { limit: 120, ttl: 60_000 } })` — high enough to not throttle a user doing aggressive scroll+search, low enough to stop a bored tab from DoSing the endpoint.

### Storage

Migration `1700000000006-CreateAnalyticsEvents.ts` creates:

```
analytics_events (
  id          uuid PK
  user_id     uuid  NULL  (nullable for anon events)
  event_type  varchar(64)
  metadata    jsonb  DEFAULT '{}'::jsonb
  ip          inet   NULL
  user_agent  text   NULL
  created_at  timestamptz DEFAULT now()
)
```

Indexes:

- `IDX_analytics_events_type_created (event_type, created_at DESC)` — fast "last N of type" lookups for the dashboards to come.
- `IDX_analytics_events_user_created (user_id, created_at DESC)` — per-user funnels.

No GIN on `metadata` yet; add one when a real query path needs it. For now the metadata column is write-mostly, read-rarely — warehouse ETL is the intended consumer, not OLTP.

### PII discipline

`analytics.service.ts` strips a forbidden set of keys before insert — `email`, `phone`, `name`, `password`, `token`, etc. Strings are truncated to 500 chars, arrays to 20 items. The client-side `lib/analytics.ts` already avoids these keys by construction; the server strip is defence-in-depth in case a future refactor lets one slip.

The endpoint also captures `X-Forwarded-For` (first hop) and `User-Agent`. Those are stored for spam / abuse analysis; they are **not** joined to `users` in any read path.

### Frontend helper

```ts
import { analytics } from '@/lib/analytics';

analytics.searchQuery(q, 'google');         // typed helper; 'google' | 'manual'
analytics.templeClick(id, 'list');          // 'list' | 'map' | 'detail'
analytics.citySelected(slug, 'modal');      // 'modal' | 'chip' | 'settings'
analytics.tabSwitch('local');               // 'local' | 'all'
analytics.locationPermission('granted');    // 'granted' | 'denied' | 'unavailable'
analytics.notificationPermission('denied'); // 'granted' | 'denied' | 'default' | 'unsupported'
```

Under the hood `track()` issues a `fetch(..., { keepalive: true })` so the request survives a page navigation — same guarantee `navigator.sendBeacon` gives, but preserves our JSON content-type and auth header.

Failures are silently swallowed at `console.debug` level. Analytics must **never** break UX.

### Retention — 30-day sweeper

`analytics_events` is write-heavy and read-rarely, so without a retention policy the table grows unbounded (~300 rows/DAU/day at current instrumentation density). We hold 30 days at the OLTP layer; anything older is assumed to have been shipped to the warehouse by the nightly ETL.

Implementation:

- **BullMQ repeatable job** in `analytics/analytics-cleanup.processor.ts` (queue name `analytics-cleanup`, `jobId: 'analytics-30d-sweep'` so multiple pods don't enqueue duplicates).
- **Schedule**: every 24 h (`repeat: { every: 86_400_000 }`). The repeat pattern is registered once at module bootstrap in `AnalyticsModule.onApplicationBootstrap()`.
- **Batched DELETE** — the handler loops a CTE-plus-`ctid` delete in chunks of 5 000 rows so a long-tail catch-up doesn't hold a table-wide lock:
  ```sql
  WITH victims AS (
    SELECT ctid FROM analytics_events
    WHERE created_at < now() - INTERVAL '30 days'
    LIMIT 5000
  )
  DELETE FROM analytics_events WHERE ctid IN (SELECT ctid FROM victims);
  ```
  The loop exits when a pass deletes 0 rows; the whole sweep is usually <200 ms on healthy load.
- **No-op on cold start** — the processor tolerates a missing Redis/queue during smoke tests by logging and returning early.

Why BullMQ and not `pg_cron`?

- We already run BullMQ for the image pipeline, so adding a queue costs nothing.
- Failures surface in the same dashboard as everything else.
- Works on managed Postgres offerings where `pg_cron` isn't available.

---

## 4. Favorites

### Why

The retention reading of the v1 funnel showed that users who saved at least one temple returned 2.3× more often than those who only browsed. Favorites is the cheapest explicit-retention hook we can ship: one row per (user, temple), server-backed so it syncs across devices.

### Routes

| Method | Path                              | Purpose                                                    | Rate limit   |
|--------|-----------------------------------|------------------------------------------------------------|--------------|
| GET    | `/api/v1/favorites`               | Full list of the user's favourites with temple details     | 30 / min     |
| GET    | `/api/v1/favorites/ids?ids=a,b,c` | Bulk membership check — returns `{ ids: [uuid, …] }`       | 120 / min    |
| POST   | `/api/v1/favorites/:templeId`     | Add — idempotent (`ON CONFLICT DO NOTHING`). `{ added }`   | 60 / min     |
| DELETE | `/api/v1/favorites/:templeId`     | Remove — idempotent. `{ removed }`                         | 60 / min     |

All four require a valid JWT (`JwtAuthGuard` at the class level). There is **no admin override** — favorites are per-user.

### Schema

Migration `1700000000007-CreateUserFavorites.ts`:

```
user_favorites (
  user_id    uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE
  temple_id  uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE
  created_at timestamptz DEFAULT now()
  PRIMARY KEY (user_id, temple_id)
)
```

- **Composite PK** — both directions of the relation need fast lookups and the pair is the natural key.
- **FK CASCADE on both sides** — if a user is deleted, their favourites go; if a temple is hard-deleted by admin, it drops out of everyone's favourites automatically. Matches the hard-delete policy from §2.
- `IDX_user_favorites_temple (temple_id)` — inverse of the PK left edge, for "who favourited this temple" (future: trending list).
- `IDX_user_favorites_user_created (user_id, created_at DESC)` — the `/favorites` list query's sort key.

### Service details

- `add(userId, templeId)` — 404s if the temple id doesn't exist (explicit `EXISTS` check so we don't swallow a typo'd id silently), then `INSERT … ON CONFLICT DO NOTHING RETURNING TRUE AS added`. Returns `{ added: true }` on first save, `{ added: false }` on repeat. Lets the client still correctly report "already saved" to analytics without a second round-trip.
- `remove(userId, templeId)` — idempotent `DELETE … RETURNING 1`. Returns `{ removed: boolean }`.
- `getFavoriteIds(userId, templeIds[])` — QueryBuilder with `WHERE user_id = :u AND temple_id IN (:…ids)`, returns a `Set<string>` for O(1) lookup in hot render paths. Caller passes only the currently-visible temple ids so the payload stays bounded.
- `list(userId)` — one raw SQL `SELECT … JOIN temples` sorted by `user_favorites.created_at DESC`, returning a shape that matches the client `FavoriteTemple` DTO (all temple fields + `favouritedAt`).
- `count(userId)` — `SELECT COUNT(*)` for the profile header ("12 saved temples"); cached in the Profile screen only, not on the backend.

### Module shape

`FavoritesModule` imports only `TypeOrmModule.forFeature([UserFavorite, Temple])`. It deliberately does **not** import `TemplesModule` — that would drag the Redis-backed `TemplesService` into a module that just needs a `temples.id` existence check. The direct repo lookup is a single indexed pk hit and keeps the dependency graph tight.

### Client mirror

See `useFavorites` in `religiogram-frontend/hooks/useFavorites.ts` — a module-level singleton `Set<string>` with a pub/sub so the heart button and the favourites screen and the card grid all re-render coherently after any `add` / `remove`. Writes are optimistic with rollback on API error.

---

## 5. Verification checklist

### City

- [ ] First login with blocked GPS opens `CitySelectorModal` on `/home`.
- [ ] Selecting Delhi persists across a full reload (`localStorage.rg_selected_city === 'delhi'`).
- [ ] `GET /api/v1/temples/nearby?city=delhi&radiusKm=15` returns Delhi temples sorted by distance from the Delhi centroid.
- [ ] City pill in the header re-opens the modal; picking Mumbai refetches the Local tab.

### Admin

- [ ] A non-admin user gets `403` on `POST /api/v1/admin/temples`.
- [ ] Creating a temple with a duplicate `(name, city)` returns `409` with `TEMPLE_ALREADY_EXISTS`.
- [ ] Creating "Shree Hanuman Mandir" in a city that already has "Hanuman Mandir" returns `409` with `TEMPLE_NEAR_DUPLICATE` and a `candidates` array.
- [ ] Re-sending the same request with `"force": true` succeeds.
- [ ] Updating only `hours` keeps all other columns intact.
- [ ] Updating `lat` / `lng` updates both scalars and `location` in one transaction (verified via `SELECT ST_AsText(location)`).
- [ ] After any admin write, `GET temples:cache:version` in Redis has incremented by 1.
- [ ] The next `/nearby` call returns the edited row within `~1s + short TTL` (in-process version cache + any already-running in-flight reads).

### Analytics

- [ ] Opening `/home` fires exactly one `tab_switch=local` + one `location_permission` event.
- [ ] Selecting Delhi from the modal fires one `city_selected` event with `source: 'modal'`.
- [ ] Typing "kashi" fires a `search_query` event with `source: 'google'` (or `'manual'` when the fallback is used).
- [ ] Clicking a temple card fires `temple_click` with `source: 'list'`; opening via a shared URL fires `source: 'detail'`.
- [ ] `POST /api/v1/analytics/event` with `eventType: "malicious_custom"` is rejected with `400`.
- [ ] Sending `metadata: { email: "x@y.z", templeId: "..." }` stores `metadata: { templeId: "..." }` only.
- [ ] Toggling a heart fires a `favorite_toggle` event with `favorited: true|false` and the correct `source`.
- [ ] Manually inserting a row with `created_at = now() - INTERVAL '31 days'` is removed within 24 h by the sweeper (or immediately when the job is triggered via the admin queue dashboard).

### Favorites

- [ ] `POST /api/v1/favorites/:templeId` returns `{ added: true }` first time, `{ added: false }` on repeat.
- [ ] `DELETE /api/v1/favorites/:templeId` returns `{ removed: true }` when a row existed, `{ removed: false }` otherwise.
- [ ] `GET /api/v1/favorites` returns the user's saved temples sorted by `favouritedAt DESC`.
- [ ] `GET /api/v1/favorites/ids?ids=a,b,c` returns only the ids present in `user_favorites` for that user.
- [ ] Hard-deleting a temple via the admin API removes it from all users' favourites (FK cascade).
- [ ] Hearting a card on `/home`, then opening `/favorites`, shows the card immediately (no manual refresh).
- [ ] Un-hearting on the detail page reflects in `/home` card grid and in the favourites screen without a refresh.
- [ ] An unauthenticated request to any `/favorites` route returns `401`.

---

## 6. Migration order

If bringing up a fresh database:

```bash
npm run migration:run
```

Runs in timestamp order:

```
1700000000001 — users
1700000000002 — profile fields
1700000000003 — uploads
1700000000004 — temples + PostGIS / pg_trgm / pgcrypto extensions
1700000000005 — temple seed
1700000000006 — analytics_events
1700000000007 — user_favorites
```

No new migration is required for the admin, cities, or pg_trgm near-duplicate work — the admin routes operate on the existing `temples` table, the city list is static config, and the `pg_trgm` extension + `gin_trgm_ops` index on `LOWER(name)` were already provisioned in migration `1700000000004`.
