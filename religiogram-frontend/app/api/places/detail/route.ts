import { NextRequest, NextResponse } from 'next/server';

const PHOTO_BASE = 'https://maps.googleapis.com/maps/api/place/photo';
const DETAIL_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

function photoUrl(ref: string, _key: string) {
  // S4: Never embed the server API key in URLs returned to clients.
  return `/api/places/photo?ref=${encodeURIComponent(ref)}`;
}

const TYPE_TO_REL: Record<string, string> = {
  hindu_temple: 'temple', mosque: 'mosque', church: 'church',
  place_of_worship: 'gurudwara', synagogue: 'other', buddhist_temple: 'other',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get('placeId');
  const apiKey  = process.env.GOOGLE_PLACES_API_KEY;

  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API not configured' }, { status: 503 });
  }

  try {
    const res  = await fetch(
      `${DETAIL_URL}?place_id=${placeId}&fields=place_id,name,formatted_address,geometry,rating,user_ratings_total,opening_hours,photos,types,url,formatted_phone_number,website&key=${apiKey}`,
      { next: { revalidate: 3600 } } as RequestInit,
    );
    const data = await res.json();

    if (data.status !== 'OK' || !data.result) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    const r      = data.result;
    const loc    = r.geometry?.location ?? {};
    const types  = (r.types ?? []) as string[];
    const relKey = types.map((t: string) => TYPE_TO_REL[t]).find(Boolean) ?? 'other';
    const photos = ((r.photos ?? []) as Array<{ photo_reference: string }>)
      .slice(0, 8)
      .map((p) => photoUrl(p.photo_reference, apiKey));

    const addrParts  = (r.formatted_address ?? '').split(',');
    const city  = addrParts.length >= 2 ? addrParts[addrParts.length - 2].trim() : 'India';
    const state = addrParts.length >= 1 ? addrParts[addrParts.length - 1].trim().replace(/\s\d{6}/, '').trim() : null;
    const hoursText: string | null =
      r.opening_hours?.weekday_text?.join(' | ') ?? null;

    const detail = {
      id:            placeId,
      type:          relKey,
      name:          r.name ?? '',
      city,
      state,
      address:       r.formatted_address ?? null,
      lat:           Number(loc.lat ?? 0),
      lng:           Number(loc.lng ?? 0),
      ratingAvg:     r.rating != null ? Number(r.rating) : null,
      ratingCount:   Number(r.user_ratings_total ?? 0),
      openingHours:  hoursText?.slice(0, 120) ?? null,
      description:   null,
      imageUrl:      photos[0] ?? null,
      galleryUrls:   photos.slice(1),
      donationEnabled: false,
      donationUpiId: null,
      ownerId:       null,
      isVerified:    false,
      googlePlaceId: placeId,
      upcomingEvents: [],
      services:      [],
      nearbyPlaces:  [],
    };

    return NextResponse.json({ data: detail });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 500 });
  }
}
