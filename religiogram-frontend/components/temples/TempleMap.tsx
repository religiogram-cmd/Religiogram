/// <reference types="@types/google.maps" />
'use client';

import { useEffect, useRef } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import type { Temple } from '@/lib/temples-api';

export interface TempleMapProps {
  temples: Temple[];
  /** User's current location, if known — rendered as a blue dot. */
  userLocation?: { lat: number; lng: number } | null;
  /** Marker highlighted by the list (card hover). */
  activeId: string | null;
  /** Fires when a map pin is clicked so the list can scroll to that card. */
  onMarkerClick?: (id: string) => void;
  /**
   * Optional external "camera" override. When provided, the map recenters
   * here (user selected a place from autocomplete). Ignored otherwise —
   * we keep the user's current pan/zoom.
   */
  cameraTarget?: { lat: number; lng: number } | null;
}

const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 }; // Geographic center of India

/**
 * Map view synced with the list. Key behaviours:
 *
 *   - Markers are rebuilt when `temples` identity changes. We compare by
 *     id set, so a list re-sort doesn't thrash the DOM.
 *   - Active marker gets a larger halo + higher z-index, matching the
 *     list card's border glow.
 *   - When the user location is known, we auto-fit to bounds containing
 *     both the user and the top-N nearest temples on first load.
 *   - `cameraTarget` (from search) overrides the fit and pans smoothly.
 *
 * Clustering — planned, not yet enabled.
 * -------------------------------------
 * At ≤30 pins per Local query + ≤10 visible All-India rows the map is fine
 * without a clusterer. Once the Local radius grows (or we introduce a
 * "full-country" view), pin count crosses the ~100-marker performance cliff
 * on mobile Chrome / Safari.
 *
 * Drop-in plan when that threshold is reached:
 *
 *   npm i @googlemaps/markerclusterer
 *
 *   import { MarkerClusterer } from '@googlemaps/markerclusterer';
 *
 *   // inside the markers-sync effect, after building all pins:
 *   clustererRef.current?.clearMarkers();
 *   clustererRef.current = new MarkerClusterer({
 *     map, markers: Array.from(markersRef.current.values()),
 *   });
 *
 * The component's public API (`temples` / `activeId` / `cameraTarget`) does
 * not change — callers stay ignorant. The clusterer handles its own DOM
 * churn, and our active-marker styling continues to work because the
 * clusterer unwraps individual markers at high zoom.
 *
 * Threshold to flip the switch: >75 pins typical, or a p75 FPS-drop report
 * on low-end Android in the discovery screen.
 */
export function TempleMap({
  temples,
  userLocation,
  activeId,
  onMarkerClick,
  cameraTarget,
}: TempleMapProps) {
  const { status, google, error } = useGoogleMaps();
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const initialFitDoneRef = useRef(false);

  /* ── Instantiate the map once the SDK is ready. ── */
  useEffect(() => {
    if (status !== 'ready' || !google || !mapElRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(mapElRef.current, {
      center: userLocation ?? INDIA_CENTER,
      zoom: userLocation ? 13 : 5,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      // Subtle styled-map matching the warm brand tone. Keeps landmarks
      // readable but softens the road saturation so pins pop.
      styles: [
        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
      ],
    });
  }, [status, google, userLocation]);

  /* ── Recenter on first userLocation arrival. ──
   * The map is instantiated once (guarded by `mapRef.current`), so if the
   * user's coords resolve *after* mount (the common case — Geolocation is
   * async), the initial center is stale. Pan + zoom once, then let the
   * markers-effect do a tighter fitBounds when temples arrive.
   */
  useEffect(() => {
    if (!google || !mapRef.current || !userLocation) return;
    if (initialFitDoneRef.current) return;
    mapRef.current.setCenter(userLocation);
    if ((mapRef.current.getZoom() ?? 0) < 13) {
      mapRef.current.setZoom(13);
    }
  }, [google, userLocation]);

  /* ── Render the user's location pin. ── */
  useEffect(() => {
    if (!google || !mapRef.current || !userLocation) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userLocation);
      return;
    }
    userMarkerRef.current = new google.maps.Marker({
      map: mapRef.current,
      position: userLocation,
      zIndex: 5,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2980B9',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 3,
      },
      title: 'Your location',
    });
  }, [google, userLocation]);

  /* ── Sync temple markers with the list. ── */
  useEffect(() => {
    if (!google || !mapRef.current) return;
    const map = mapRef.current;
    const existing = markersRef.current;
    const nextIds = new Set(temples.map((t) => t.id));

    // Remove stale markers.
    for (const [id, marker] of existing) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }

    // Add / update current markers.
    for (const t of temples) {
      const isActive = t.id === activeId;
      const position = { lat: t.lat, lng: t.lng };
      const existingMarker = existing.get(t.id);
      if (existingMarker) {
        existingMarker.setPosition(position);
        existingMarker.setZIndex(isActive ? 100 : 10);
        existingMarker.setIcon(buildIcon(google, isActive, t.isVerified));
        continue;
      }
      const m = new google.maps.Marker({
        map,
        position,
        title: t.name,
        zIndex: isActive ? 100 : 10,
        icon: buildIcon(google, isActive, t.isVerified),
      });
      m.addListener('click', () => onMarkerClick?.(t.id));
      existing.set(t.id, m);
    }

    // On first list render, fit bounds around user + temples.
    if (!initialFitDoneRef.current && temples.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      if (userLocation) bounds.extend(userLocation);
      for (const t of temples) bounds.extend({ lat: t.lat, lng: t.lng });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 60);
        initialFitDoneRef.current = true;
      }
    }
  }, [google, temples, activeId, userLocation, onMarkerClick]);

  /* ── Pan to external camera target (from search). ── */
  useEffect(() => {
    if (!google || !mapRef.current || !cameraTarget) return;
    mapRef.current.panTo(cameraTarget);
    // A gentle zoom-in if the user jumps to a specific place.
    if ((mapRef.current.getZoom() ?? 0) < 12) {
      mapRef.current.setZoom(13);
    }
  }, [google, cameraTarget]);

  /* ── Render states ── */
  if (status === 'missing-key' || status === 'error') {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: 'rgba(255,252,245,.6)',
          border: '1px dashed rgba(197,138,75,.3)',
          color: '#0F2452',
        }}
      >
        <p className="text-[13px] font-semibold mb-1">Map unavailable</p>
        <p className="text-[11.5px] opacity-70">{error ?? 'Google Maps could not be loaded.'}</p>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        border: '1px solid rgba(197,138,75,.2)',
        boxShadow: '0 4px 16px rgba(107,63,29,.1)',
        height: '320px',
      }}
    >
      <div ref={mapElRef} className="w-full h-full" aria-label="Temple map" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F6F7FA]/40 backdrop-blur-sm">
          <span className="w-6 h-6 border-2 border-[#0F2452]/30 border-t-amber-700 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Builds the custom SVG marker. We use a Google-styled pin with a gold
 * fill and a green dot for verified status. Distinct enough at a glance,
 * cheap to render (path geometry), and consistent across zoom levels.
 */
function buildIcon(
  g: typeof google,
  active: boolean,
  verified: boolean,
): google.maps.Symbol {
  return {
    // Teardrop SVG path — origin anchored at the tip.
    path: 'M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z',
    fillColor: verified ? '#C8932A' : '#C8932A',
    fillOpacity: 1,
    strokeColor: active ? '#0F2452' : '#ffffff',
    strokeWeight: active ? 3 : 2,
    scale: active ? 1.4 : 1.0,
    anchor: new g.maps.Point(12, 36),
    labelOrigin: new g.maps.Point(12, 13),
  };
}
