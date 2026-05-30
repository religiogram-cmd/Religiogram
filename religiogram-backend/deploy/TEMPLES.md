# Temple Discovery — System Guide

End-to-end doc for the Temple Discovery feature that ships as the Home screen immediately after first-run onboarding.

---

## 1. Flow

```
Sign-up → OTP verify → Profile Setup (3 steps) → /permissions → /home (Temple Discovery)
                                                       │
                                                       ├─ Step 0: Location permission
                                                       └─ Step 1: Notifications permission
```

On subsequent sessions the user lands directly on `/home`. The one-time `rg_permissions_seen` localStorage flag is the gate; if it's missing, `/home` redirects back through `/permissions`.

---

## 2. Backend

### Module layout

```
src/temples/
  entities/temple.entity.ts          PostGIS geography + mirror lat/lng
  dto/nearby-temples.dto.ts          lat / lng / radiusKm (≤50) / limit (≤30)
  dto/list-temples.dto.ts            search (≥2 chars) / city / page / limit
  temples.service.ts                 /nearby raw PostGIS SQL + Redis cache
                                     /list QueryBuilder with ILIKE + paging
  temples.controller.ts              GET /nearby (60/min/user),
                                     GET /    (30/min/user), GET /:id
  temples.module.ts
```

### Endpoints (all JWT-required)

| Method | Path                       | Purpose                                                   | Rate limit (per user)   |
|--------|----------------------------|-----------------------------------------------------------|-------------------------|
| GET    | `/api/v1/temples/nearby`   | Geo radius, sorted by distance (GPS **or** city fallback) | 60/min                  |
| GET    | `/api/v1/temples`          | Search + city + paging (10 rows at a time)                | 30/min                  |
| GET    | `/api/v1/temples/search`   | Manual-search fallback (ILIKE across name + city + address) | 60/min                |
| GET    | `/api/v1/temples/:id`      | Single temple detail                                      | inherits global 100/min |

Write path (admin-only) and the analytics beacon live in a sibling doc — see [`CITY_AND_ADMIN.md`](./CITY_AND_ADMIN.md).

### Geo query

Nearby uses raw SQL so `ST_Distance(...)` can appear in the SELECT for sort-by-distance:

```sql
SELECT ..., ST_Distance(location, ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography) AS distance_m
FROM temples
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography, $radiusMetres)
ORDER BY distance_m ASC
LIMIT $limit
```

The GIST index on `location` prunes the candidate set in O(log n); `distance_m` is only computed for survivors.

### Redis caching

| Surface         | Key shape                                                              | TTL   | Notes                                                                                                       |
|-----------------|------------------------------------------------------------------------|-------|-------------------------------------------------------------------------------------------------------------|
| `/nearby`       | `temples:nearby:{lat.toFixed(3)}:{lng.toFixed(3)}:r{radius}:l{limit}` | 5 min | `resolveCentre()` normalises GPS and `city=<slug>` down to the same coord shape, so both paths share a key. |
| `/search`       | `temples:search:{q.toLowerCase()}:l{limit}`                            | 60 s  | Intentionally plain — the DTO already caps `q` at 40 chars and trims, so the key space is bounded.          |
| `/list`         | *(not cached)*                                                         | —     | Search + page + city is high-cardinality with low hit rate; PostgreSQL + pg_trgm serves it in <30 ms.       |
| cache version   | `temples:cache:version`                                                | never | Timestamp breadcrumb written on admin edit (SET, not DEL). Read paths rely on the short TTL for freshness in v1; the key is in place for future strict-freshness read paths and dashboards. See `CITY_AND_ADMIN.md`. |

Two users standing within ~110 m share the same `/nearby` bucket — the second one's query resolves in <20 ms. 5 minutes is short enough that newly-verified or edited temples propagate within the same session.

### Schema

Migration: `1700000000004-CreateTemples.ts`

```
temples (
  id           uuid PK
  name         varchar(200)
  city         varchar(100)
  state        varchar(100)
  address      text
  location     geography(Point, 4326)  [GIST]
  lat          double precision
  lng          double precision
  rating_avg   numeric(3,2)  -- NULL when no reviews
  rating_count int
  hours        varchar(120)
  deity        varchar(80)
  is_verified  bool
  image_url    text
  created_at   timestamptz
  updated_at   timestamptz
)
```

Indexes:
- `IDX_temples_location` (GIST on `location`)
- `IDX_temples_city` (on `LOWER(city)`)
- `IDX_temples_name_trgm` (GIN on `LOWER(name) gin_trgm_ops`)
- `IDX_temples_verified_rating` for default "verified first" ordering

Extensions required:
- `pgcrypto` (auto-created by migration — provides `gen_random_uuid()`)
- `postgis` (auto-created by migration)
- `pg_trgm` (auto-created by migration)

### Seed

Migration `1700000000005-SeedTemples.ts` seeds ~55 real temples across the six launch cities. The seed is idempotent — it no-ops if the table is already populated, and `down()` removes only the rows it inserted (matched on name+city).

Breakdown:
- Delhi — 10
- Mumbai — 10
- Kolkata — 7
- Lucknow — 6
- Ahmedabad — 8
- Varanasi — 9

All coordinates hand-verified. Verified flags reflect how widely the temple is recognised; rating values are bootstrap estimates until the reviews module lands.

### Running migrations

```bash
# Creates schema + seeds data in one pass
npm run migration:run
```

Both new migrations run in order because of their timestamp prefixes.

---

## 3. Frontend

### File layout

```
hooks/
  useDebounce.ts                 generic trailing-edge debounce
  useGeolocation.ts              Geolocation API wrapper w/ sessionStorage cache
  useGoogleMaps.ts               SDK loader (places + geometry + marker libs)

lib/
  temples-api.ts                 typed client with AbortSignal support
  cities.ts                      mirror of backend launch-city list
  analytics.ts                   fire-and-forget event beacon

contexts/
  CityContext.tsx                React Context + localStorage persistence

components/city/
  CitySelectorModal.tsx          first-load gate + re-selectable city picker

components/permissions/
  PermissionsScreen.tsx          2-step permission card (location → notifications)

app/permissions/page.tsx         auth-gated route that mounts PermissionsScreen

components/temples/
  TempleDiscovery.tsx            top-level screen (tabs + search + map + list)
  TempleTabs.tsx                 Local / All India pill switcher
  TempleSearchBar.tsx            input + Places Autocomplete + backend fallback
  TempleCard.tsx                 single row (next/image thumb, rating, distance)
  TempleList.tsx                 list with loading + error + empty + infinite scroll
  TempleMap.tsx                  Google Maps view with synced markers
  TempleDetail.tsx               shareable detail view

app/(app)/home/page.tsx          renders TempleDiscovery, enforces /permissions gate
app/(app)/temple/[id]/page.tsx   thin route file that mounts TempleDetail
```

### Environment

Add one line to the frontend env:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

Restrictions to set in Google Cloud Console:
- Application restriction: HTTP referrers (your domain(s))
- API restriction: Maps JavaScript API, Places API, Geocoding API

### Type dependency

The map + search code uses the global `google.maps.*` types. Install the
types package in the frontend:

```bash
npm i -D @types/google.maps
```

We reference the `google` namespace via `useGoogleMaps()` only — no runtime
`import` from `@types/google.maps` (types-only).

### Google Maps billing discipline

We load the SDK with `libraries=places,marker,geometry` and use **only**:
- `AutocompleteService.getPlacePredictions` — session-billed
- `Geocoder.geocode({ placeId })` — cheap per-call
- `google.maps.Map` + `Marker` — no per-render charge

We **never** call Place Details. The typical flow is:

```
User types  → debounced 300ms
           → AutocompleteService fires once
                         ↓
User picks a prediction
           → Geocoder({ placeId }) returns lat/lng
                         ↓
Map pans, session token reset for next query
```

One session token per typing session keeps billing in the lower tier.

### Routing

| Route              | Who can hit it            | Notes                                         |
|--------------------|---------------------------|-----------------------------------------------|
| `/profile-setup`   | authed                    | Finalizes → `/permissions`                    |
| `/permissions`     | authed                    | Sets `rg_permissions_seen`, → `/home`        |
| `/home`            | authed + permissions seen | TempleDiscovery. Missing flag → `/permissions` |
| `/temple/[id]`     | authed                    | Shareable detail view (hero + maps deeplink + share sheet) |

### UX states covered

- Permission prompt delayed until user-gesture click (Safari + Chrome heuristics)
- Denied geolocation → CitySelectorModal opens; Local tab then fetches by city slug
- No SDK key → map area shows graceful fallback (list still works)
- Google Places down / empty → backend `/temples/search` fallback in the dropdown
- In-flight request on query change → previous is `AbortController.abort()`'d
- All India tab paginates in 10s via `IntersectionObserver` sentinel
- Late-arriving `userLocation` recenters the map instead of staying on the default
- Skeletons for loading; friendly empty states; red error banner on fetch fail
- List ↔ map hover sync via shared `activeId`
- `/temple/[id]` supports native share sheet with clipboard fallback

---

## 4. Verification checklist

- [ ] `npm run migration:run` creates `postgis`, `pg_trgm`, `pgcrypto`, `temples` + indexes + ~55 rows + `analytics_events`
- [ ] `GET /api/v1/temples/nearby?lat=28.6127&lng=77.2773&radiusKm=5` returns Akshardham first, sorted by `distanceM`
- [ ] `GET /api/v1/temples/nearby?city=delhi&radiusKm=15` works **without** lat/lng (city fallback)
- [ ] `GET /api/v1/temples/nearby` with neither coords nor city returns `400 BAD_REQUEST`
- [ ] `GET /api/v1/temples/search?q=kashi` returns Kashi Vishwanath first (prefix-match ranked)
- [ ] `GET /api/v1/temples?search=kashi` returns Kashi Vishwanath + `hasMore` flag
- [ ] `GET /api/v1/temples?city=Varanasi&limit=10` returns only Varanasi temples
- [ ] Page 2 of `/temples?limit=10&page=2` excludes page-1 rows
- [ ] New user flow: `/auth` → OTP → `/profile-setup` → finish → `/permissions` → allow location → `/home`
- [ ] Returning user flow: `/auth` → OTP → `/home` (no re-prompt)
- [ ] First /home load with no city: CitySelectorModal appears; selecting Delhi loads a list
- [ ] Home with denied location: CitySelectorModal opens; Local tab then lists city temples
- [ ] Typing "dakshi" on the search bar returns Dakshineswar either via Places **or** backend fallback
- [ ] Hovering a card glows the matching map pin; clicking a pin highlights the card
- [ ] All-India tab scrolls past the 10th row and appends the next page without flicker
- [ ] Clicking a card navigates to `/temple/<uuid>`; back button returns to Discovery with state intact
- [ ] `/temple/<non-existent-uuid>` shows the "Temple not found" card, not a crash
- [ ] Pulling the plug on the API during a `/nearby` fetch shows the red error banner with a "Try again" button that recovers when the API comes back
- [ ] Opening a temple detail page records the visit in `Recently viewed` on the Home strip (clear with "Clear")
- [ ] Tapping the heart on any TempleCard turns it red instantly and persists a row in `user_favorites`
- [ ] `/favorites` lists saved temples newest-first; empty state points back to Discovery
- [ ] Removing a heart on `/temple/<id>` updates all mounted hearts (list card, Recently viewed strip) in the same tab
- [ ] `DEL temples:cache:version` is bumped by admin writes; subsequent `/nearby` hits miss the cache and repopulate under the new version prefix

---

## 5. Retention & resilience (gap-closure layer)

Addresses the "final 6 gaps before scale" checklist — see inline code comments for rationale.

**Cache invalidation (Redis).** `/nearby` and `/search` keys are now versioned: `temples:v{N}:nearby:…`. Admin writes `INCR temples:cache:version`; reads memoise the version for 1 s in-process so a burst of requests makes one Redis hit. Old entries orphan for ≤ TTL (no SCAN/DEL fan-out) and this works across Redis Cluster.

**Duplicate control.** Admin temple create/update checks `similarity(LOWER(name), LOWER($1)) ≥ 0.6` within the same city (via `pg_trgm`). On a match the API throws `409 TEMPLE_NEAR_DUPLICATE` with the existing id + similarity score; an admin who's sure can pass `force: true` to bypass. Tight enough to block "Shri Kashi Vishwanath Temple" vs "Kashi Vishwanath", loose enough not to collide "Ram Mandir" with "Hanuman Mandir".

**Map readiness for clustering.** `TempleMap.tsx` carries a drop-in plan for `@googlemaps/markerclusterer` with trigger threshold (>75 pins or p75 FPS drop); wiring is a ≤ 30-line change when the product decision lands.

**Analytics retention.** `analytics_events` is now swept daily by a BullMQ repeatable job (`jobId: 'analytics-cleanup-repeatable'`, `every: 24h`). The sweep runs a batched CTE+ctid DELETE capped at 100 × 10 000 rows. 30-day cutoff, hardcoded — see the processor doc comment for why.

**Frontend retry.** `lib/temples-api.ts`'s `abortableGet` retries once after 400 ms on a pure network failure. UI error banners and the detail-page error shell both show a "Try again" button that bumps a per-tab retry tick, triggering a clean re-fetch. Retry applies to `/temples/nearby`, `/temples`, `/temples/search`, `/temples/:id`.

**Retention — Recently viewed.** Client-only; localStorage-backed via `useRecentlyViewed`. Snapshots the 10 most-recent temple opens, deduped, newest-first. Rendered as a horizontal scroll strip above the Map on /home. Schema-versioned key (`religiogram.recentTemples.v1`) so future migrations don't break layout. Emits a custom `religiogram:recent-temples-changed` event so two mounts in the same tab stay in sync.

**Retention — Favorites.** Server-backed. Table `user_favorites(user_id, temple_id, created_at)` with composite PK + an inverse index on `(temple_id)`. Endpoints:

| Method | Path                        | Purpose                                |
|--------|-----------------------------|----------------------------------------|
| GET    | `/api/v1/favorites`         | List user's favorites, newest-first    |
| GET    | `/api/v1/favorites/ids?ids=…` | Bulk "is favorited?" lookup (paints hearts) |
| POST   | `/api/v1/favorites/:id`     | Idempotent add (ON CONFLICT DO NOTHING) |
| DELETE | `/api/v1/favorites/:id`     | Idempotent remove                       |

Client: `useFavorites()` hook (module-level singleton, pub/sub re-render) + `<FavoriteButton variant="card|hero">`. Optimistic toggle with rollback on server error. `favorite_toggle` analytics event added — the single most important retention KPI for v1.

---

## 6. What's intentionally *not* here (v1)

- **Reviews** — `rating_avg` / `rating_count` are denormalised placeholders until the reviews module lands
- **Clustering on the map** — unnecessary below ~50 pins; plan documented in `TempleMap.tsx` for drop-in of `@googlemaps/markerclusterer`
- **Offline mode** — deferred; the empty states cover no-network readably
- **Server-rendered pages** — the discovery screen needs JS SDK + geolocation, so SSR adds no SEO value here
- **Self-serve temple registration** — admin CRUD covers the curated path (see CITY_AND_ADMIN.md); public submission is post-launch
- **Analytics dashboards** — `analytics_events` is the raw store; a warehouse ETL + BI layer is a separate workstream
- **Favorites pagination** — bounded by human behaviour (< 100 saves expected); the `(user_id, created_at DESC)` index supports keyset pagination trivially when we need it
