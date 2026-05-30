import type { Metadata } from 'next';
import FavoritesScreen from '@/components/temples/FavoritesScreen';

/**
 * /favorites — the user's saved temples.
 *
 * Sits under the (app) route group, so it picks up the auth guard and
 * bottom nav automatically. Thin file — all behaviour lives in the
 * FavoritesScreen component so it can be unit-tested independently.
 */
export const metadata: Metadata = {
  title: 'My favourites · Religiogram',
};

export default function FavoritesPage() {
  return <FavoritesScreen />;
}
