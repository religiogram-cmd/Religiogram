'use client';

import { useParams } from 'next/navigation';
import PlaceProfile from '@/components/places/PlaceProfile';

/**
 * /place/[id] — neutral Place Profile route.
 *
 * The "place" namespace is religion-agnostic on purpose. Under the hood
 * every row still lives in the `temples` table (backward compatibility
 * with existing share links, FKs, analytics), but the UI and API here
 * treat the row as a generic place of worship: temple, mosque, church,
 * gurudwara, or other. The `/temple/[id]` route continues to work so
 * any pre-rename share links don't 404.
 *
 * Thin-route convention: behaviour lives in PlaceProfile so it can be
 * unit-tested and storybooked without a router.
 */
export default function PlacePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  if (!id) return null;
  return <PlaceProfile id={id} />;
}
