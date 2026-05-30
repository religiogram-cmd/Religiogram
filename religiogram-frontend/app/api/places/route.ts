import { NextRequest, NextResponse } from 'next/server';

/* ── Google Places type → our religion mapping ─────────────────── */
const TYPE_MAP: Record<string, string> = {
  hindu_temple: 'hindu',
  mosque: 'muslim',
  church: 'christian',
  synagogue: 'sikh', // fallback
};

/* ── Photo URL helper ────────────────────────────────────────────── */
// S4: Return a server-side proxy path — never embed the API key in client responses
function googlePhotoUrl(ref: string, _apiKey: string, _maxWidth = 400) {
  return `/api/places/photo?ref=${encodeURIComponent(ref)}`;
}

/** Map our religion facet to the native temple `type` column. */
const NATIVE_TYPE: Record<string, string> = {
  hindu:     'temple',
  muslim:    'mosque',
  sikh:      'gurudwara',
  christian: 'church',
};

/** Pull from the backend's native temple catalogue. Best-effort: any failure
 *  drops to an empty payload so the screen renders its "coming soon" state. */
async function fetchNative(opts: { religion: string; city?: string }): Promise<any[]> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE
    ?? (process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/v1` : 'http://localhost:3001/api/v1');
  const qs = new URLSearchParams({ limit: '30' });
  const type = NATIVE_TYPE[opts.religion];
  if (type) qs.set('type', type);
  if (opts.city) qs.set('city', opts.city);
  try {
    const r = await fetch(`${apiBase}/places/search?${qs.toString()}`, {
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const j = await r.json();
    const items: any[] = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
    const labelOf: Record<string, string> = {
      temple: 'Hindu Temple', mosque: 'Masjid', gurudwara: 'Gurdwara',
      church: 'Church', monastery: 'Monastery',
    };
    return items.map(p => ({
      id:          p.id,
      name:        p.name,
      religion:    p.type === 'temple' ? 'hindu' :
                   p.type === 'mosque' ? 'muslim' :
                   p.type === 'gurudwara' ? 'sikh' :
                   p.type === 'church' ? 'christian' : 'all',
      placeType:   labelOf[p.type] ?? 'Place of Worship',
      location:    [p.city, p.state].filter(Boolean).join(', '),
      distance:    null,
      distKm:      0,
      rating:      Number(p.ratingAvg ?? 0),
      reviewCount: Number(p.ratingCount ?? 0),
      isOpen:      true,
      featured:    false,
      verified:    !!p.isVerified,
      photoUrl:    p.imageUrl ?? null,
      lat:         Number(p.lat ?? 0),
      lng:         Number(p.lng ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat      = searchParams.get('lat')      ?? '28.6139';
  const lng      = searchParams.get('lng')      ?? '77.2090';
  const religion = searchParams.get('religion') ?? 'all';
  const scope    = searchParams.get('scope')    ?? 'local';   // local | global
  const city     = searchParams.get('city')     ?? undefined;
  const apiKey   = process.env.GOOGLE_PLACES_API_KEY;

  /* ── No Google key → fall back to the native temple catalogue. ── */
  if (!apiKey) {
    const places = await fetchNative({ religion, city });
    return NextResponse.json({ places, source: places.length ? 'native' : 'empty' });
  }

  /* ── Google Places Nearby Search ── */
  const typeMap: Record<string, string> = {
    hindu: 'hindu_temple', muslim: 'mosque',
    sikh: 'place_of_worship', christian: 'church', all: 'place_of_worship',
  };
  const placeType = typeMap[religion] ?? 'place_of_worship';
  const radius    = scope === 'global' ? 50000 : 5000;

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${placeType}&key=${apiKey}`;
    const gRes  = await fetch(url, { next: { revalidate: 3600 } } as RequestInit);
    const gData = await gRes.json();

    const places = (gData.results ?? []).map((p: Record<string, unknown>) => {
      const types = (p.types as string[]) ?? [];
      const rel   = Object.keys(TYPE_MAP).find(t => types.includes(t));
      const photos = p.photos as Array<{ photo_reference: string }> | undefined;
      const geo    = p.geometry as { location: { lat: number; lng: number } } | undefined;
      return {
        id:          p.place_id,
        name:        p.name,
        religion:    rel ? TYPE_MAP[rel] : 'all',
        placeType:   rel ? rel.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Place of Worship',
        location:    p.vicinity,
        distance:    null,
        distKm:      0,
        rating:      p.rating ?? 4.0,
        reviewCount: p.user_ratings_total ?? 0,
        isOpen:      (p.opening_hours as { open_now?: boolean } | undefined)?.open_now ?? true,
        featured:    false,
        verified:    true,
        photoUrl:    photos?.[0]?.photo_reference
          ? googlePhotoUrl(photos[0].photo_reference, apiKey)
          : null,
        lat:         geo?.location.lat ?? 0,
        lng:         geo?.location.lng ?? 0,
      };
    });

    return NextResponse.json({ places, source: 'google' });
  } catch {
    return NextResponse.json({ places: [], source: 'error' });
  }
}
