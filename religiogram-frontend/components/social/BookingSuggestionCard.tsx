'use client';
/**
 * BookingSuggestionCard
 *
 * Injected into the social feed at a maximum 1-in-6 ratio.
 * Shows a nearby approved priest from the user's preferred religion
 * with a "Book Now" deep-link into the booking flow.
 *
 * Feed composition (Phase 8 spec):
 *   40% personal · 25% local · 20% guidance · 15% action (this card)
 *   Score = Recency×0.4 + Relationship×0.3 + Engagement×0.2 + Relevance×0.1
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';

const GOLD  = '#C8920A';
const NAVY  = '#0A1628';
const PARCHMENT = '#FFFBF0';

interface SuggestedProvider {
  providerId: string;
  name: string;
  religion: string;
  city: string;
  serviceMode: 'online' | 'offline' | 'both';
  topService: string;
  ratingAvg: number;
  ratingCount: number;
  isOnline: boolean;
  avatarUrl?: string;
  /** §9.6 trust signals */
  slotsLow?: boolean;
  availableSlotsToday?: number;
  festiveAlert?: boolean;
}

const RELIGION_ICONS: Record<string, string> = {
  hindu: '🕉️', muslim: '☪️', sikh: '🪯', christian: '✝️',
};

function Stars({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, color: GOLD, letterSpacing: -1 }}>
      {'★'.repeat(Math.round(n))}{'☆'.repeat(Math.max(0, 5 - Math.round(n)))}
    </span>
  );
}

export default function BookingSuggestionCard({ religion, city }: { religion?: string; city?: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState<SuggestedProvider | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_BASE ?? '';
    const tok = tokenStore.access ?? '';
    const params = new URLSearchParams();
    if (religion) params.set('religion', religion);
    if (city) params.set('city', city);
    params.set('limit', '1');
    params.set('availableNow', 'true');

    fetch(`${API}/api/v1/providers/by-religion/${religion ?? 'hindu'}?${params}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      cache: 'default',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const items: any[] = d?.data?.items ?? d?.items ?? [];
        if (items.length > 0) {
          const p = items[0];
          return {
            providerId: p.id ?? p.providerId,
            name: p.user?.name ?? p.name ?? 'Spiritual Guide',
            religion: p.religion ?? religion ?? 'hindu',
            city: p.city ?? city ?? '',
            serviceMode: p.serviceMode ?? 'both',
            topService: p.services?.[0]?.name ?? 'Consultation',
            ratingAvg: p.ratingAvg ?? 0,
            ratingCount: p.ratingCount ?? 0,
            isOnline: p.isOnline ?? false,
            avatarUrl: p.avatarUrl ?? p.user?.avatarUrl,
          } as SuggestedProvider;
        }
        return null;
      })
      .then(async providerData => {
        // §9.6 Fetch slots trust signals for today
        if (providerData) {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const slotsRes = await fetch(
              `${API}/api/v1/providers/${providerData.providerId}/slots?date=${today}&durationMinutes=60`,
              { headers: tok ? { Authorization: `Bearer ${tok}` } : {}, cache: 'default' },
            );
            if (slotsRes.ok) {
              const slotsData = await slotsRes.json();
              providerData.slotsLow = slotsData.slotsLow ?? false;
              providerData.availableSlotsToday = slotsData.availableSlotsToday ?? 0;
              providerData.festiveAlert = slotsData.festiveAlert ?? false;
            }
          } catch { /* ignore — trust signals are best-effort */ }
          setProvider(providerData);
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [religion, city]);

  if (loading || !provider) return null;

  const icon = RELIGION_ICONS[provider.religion?.toLowerCase()] ?? '🛕';
  const initials = provider.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('');

  return (
    <div style={{
      margin: '8px 16px',
      borderRadius: 18,
      background: `linear-gradient(135deg, ${NAVY} 0%, #1e3a6e 100%)`,
      padding: '16px',
      boxShadow: '0 4px 20px rgba(10,22,40,0.18)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', top: -24, right: -24,
        width: 120, height: 120, borderRadius: '50%',
        background: `${GOLD}15`,
        pointerEvents: 'none',
      }} />

      {/* Label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
      }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: GOLD,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Suggested for You
        </span>
      </div>

      {/* Provider row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {/* Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: provider.avatarUrl ? `url(${provider.avatarUrl}) center/cover` : `${GOLD}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: GOLD, fontWeight: 800, fontSize: 16,
          border: `2px solid ${GOLD}60`,
          position: 'relative',
        }}>
          {!provider.avatarUrl && initials}
          {/* Online dot */}
          {provider.isOnline && (
            <div style={{
              position: 'absolute', bottom: 2, right: 2,
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: '#22c55e',
              border: '2px solid #fff',
            }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 1 }}>
            {provider.name}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 3 }}>
            {provider.topService}
            {provider.city ? ` · ${provider.city}` : ''}
          </div>
          {provider.ratingAvg > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Stars n={provider.ratingAvg} />
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                ({provider.ratingCount})
              </span>
            </div>
          )}
        </div>

        {/* Mode badge */}
        <div style={{
          padding: '3px 10px', borderRadius: 99,
          background: provider.serviceMode === 'online' ? '#16a34a20' : `${GOLD}20`,
          color: provider.serviceMode === 'online' ? '#4ade80' : GOLD,
          fontSize: 10, fontWeight: 700, flexShrink: 0,
          border: `1px solid ${provider.serviceMode === 'online' ? '#16a34a50' : `${GOLD}50`}`,
        }}>
          {provider.serviceMode === 'online' ? '📱 Online' :
           provider.serviceMode === 'offline' ? '🏠 In-Person' : '🔄 Both'}
        </div>
      </div>

      {/* §9.6 Trust signals */}
      {(provider.slotsLow || provider.festiveAlert) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {provider.slotsLow && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#ef4444',
              background: 'rgba(239,68,68,0.15)',
              padding: '3px 8px', borderRadius: 99,
              border: '1px solid rgba(239,68,68,0.3)',
            }}>
              🔥 Only {provider.availableSlotsToday} slot{provider.availableSlotsToday !== 1 ? 's' : ''} left today
            </span>
          )}
          {provider.festiveAlert && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: GOLD,
              background: `${GOLD}15`,
              padding: '3px 8px', borderRadius: 99,
              border: `1px solid ${GOLD}40`,
            }}>
              🎊 Festive slots filling fast
            </span>
          )}
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => router.push(`/booking/checkout?providerId=${provider.providerId}&mode=online`)}
          style={{
            flex: 1, padding: '11px 0',
            background: `linear-gradient(135deg, ${GOLD}, #e8a020)`,
            color: '#fff',
            border: 'none', borderRadius: 10,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          {provider.isOnline ? '⚡ Connect Now' : '📅 Book Session'}
        </button>
        <button
          onClick={() => router.push(`/priests/${provider.providerId}`)}
          style={{
            padding: '11px 16px',
            background: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          View Profile
        </button>
      </div>
    </div>
  );
}
