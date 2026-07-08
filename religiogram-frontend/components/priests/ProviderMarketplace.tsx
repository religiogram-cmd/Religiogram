'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

const NAVY  = '#0A1628';
const CREAM = '#FFF8E7';

export type Faith = 'hindu' | 'muslim' | 'sikh' | 'christian';
export type ConsultChannel = 'chat' | 'voice' | 'video';

/**
 * Provider record shape used by the marketplace card grid.
 * Extracted from PriestInviteBookingScreen so /priests and the invite
 * flow's `select` step both render the exact same UI.
 */
export interface ProviderRecord {
  id: string;
  name: string;
  yearsExp: number;
  languages: string[];
  rating: number;
  reviews: number;
  fee: number;
  available: boolean;
  distanceKm: number;
  photo: string;
  city: string;
  specialisations: string[];
  isVerified: boolean;
  /** consultationChannels from the backend — decides which chat/voice/video
   *  buttons are available in the FaithDetail bottom sheet. */
  channels: ConsultChannel[];
}

interface Props {
  faith: Faith;
  /** Lowercased city string. Empty string means "unknown user city" and
   *  Local shows an empty state. */
  userCity: string;
  onProviderTap: (provider: ProviderRecord) => void;
  /** Optional: force the top-level provider tab (invite flow lets the user
   *  toggle it, but a caller could pin it if needed). Defaults to 'priest'. */
  initialProviderTab?: 'astrologer' | 'priest';
  /** Role label to substitute for "Pandits" (e.g. faith-specific "Imams",
   *  "Granthis", "Priests"). Default: 'Pandit'. */
  priestRoleLabel?: string;
  /** If set, the Astrologers tab becomes a navigation link to this URL
   *  instead of toggling to the local astrologer list. FaithDetailPage
   *  passes `/astrology/browse` so users get the full-featured astrology
   *  marketplace (hero + search + topic chips + filters). The invite flow
   *  leaves this unset — tab toggle stays local. */
  astrologerHref?: string;
  /** Optional server-side filters, forwarded as query params to
   *  GET /v1/providers. Keeps the marketplace's default view fast and
   *  scales with backend indexes rather than 50-row client-side scans. */
  filters?: {
    availableNowOnly?: boolean;
    minRating?: number;
    languages?: string[];
    specialisation?: string;
    channel?: 'chat' | 'voice' | 'video';
  };
}

/**
 * Shared marketplace panel — Astrologers / Pandits segmented control on top,
 * a golden panel with Nearby/Global sub-tabs and provider cards below.
 *
 * This is the exact layout from PriestInviteBookingScreen's `select` step,
 * factored out so:
 *   1. The invite booking flow keeps working: it wraps this + a "Next" button.
 *   2. The FaithDetailPage on /priests renders the same UI, and taps open a
 *      3-button bottom sheet (Invite / Ask via Chat / Voice-Video Call) instead
 *      of advancing a booking wizard.
 */
export default function ProviderMarketplace({
  faith,
  userCity,
  onProviderTap,
  initialProviderTab = 'priest',
  priestRoleLabel = 'Pandit',
  astrologerHref,
  filters,
}: Props) {
  const router = useRouter();
  const [providerTab, setProviderTab] = useState<'astrologer' | 'priest'>(initialProviderTab);
  /* When a nav URL is provided for the Astrologers tab, tapping it routes
   * there instead of toggling to the local astrologer list. Used by
   * FaithDetailPage to send users to /astrology/browse (which has the
   * richer hero + search + topic chips + filters UI). */
  const handleAstrologerTap = () => {
    if (astrologerHref) {
      router.push(astrologerHref);
      return;
    }
    setProviderTab('astrologer');
  };
  const providerLabel = providerTab === 'astrologer' ? 'Astrologer' : priestRoleLabel;

  const [allPriests, setAllPriests] = useState<ProviderRecord[]>([]);
  const [priestsLoading, setPriestsLoading] = useState(false);

  /* Fetch providers when the tab flips or the faith changes. Same endpoints
   * the invite flow uses:
   *   priest      → /providers?category=priest&religion=<faith>&limit=50
   *   astrologer  → /providers?category=astrologer&limit=50
   */
  useEffect(() => {
    const tok = tokenStore.access ?? '';
    setPriestsLoading(true);
    setAllPriests([]);
    const religionParam = faith === 'muslim' ? 'islam' : faith;
    const headers: Record<string, string> = {};
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    /* Compose the query. Server-side narrowing is preferred wherever the
     * backend supports it (category + religion + specialisation + channel
     * + available + minRating + languages). Everything else stays client-
     * side and applies to the returned page. */
    const params = new URLSearchParams({ limit: '50' });
    params.set('category', providerTab);
    if (providerTab === 'priest') params.set('religion', religionParam);
    if (filters?.availableNowOnly) params.set('available', 'now');
    if (filters?.minRating != null && filters.minRating > 0) {
      params.set('minRating', String(filters.minRating));
    }
    if (filters?.languages?.length) params.set('languages', filters.languages.join(','));
    if (filters?.specialisation)    params.set('specialisation', filters.specialisation);
    if (filters?.channel)           params.set('channel', filters.channel);
    const url = `${API_BASE}/providers?${params.toString()}`;
    fetch(url, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any[] = Array.isArray(j) ? j : (j?.items ?? j?.data ?? []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAllPriests(raw.map((p: any): ProviderRecord => ({
          id:              String(p.id ?? p.providerId ?? ''),
          name:            String(p.fullName ?? p.name ?? 'Provider'),
          yearsExp:        Number(p.experienceYears ?? 0),
          languages:       Array.isArray(p.languages) ? p.languages.map(String) : [],
          rating:          Number(p.ratingAvg ?? p.rating ?? 0),
          reviews:         Number(p.ratingCount ?? p.reviewCount ?? 0),
          fee:             Math.round(Number(p.perMinutePaise ?? p.basePricePaise ?? 0) / 100),
          available:       Boolean(p.availableNow ?? p.isOnline ?? true),
          distanceKm:      Number(p.distanceKm ?? 0),
          photo:           String(p.avatarUrl ?? p.photoUrl ?? `/priests/${faith}-ask.jpg`),
          city:            String(p.city ?? ''),
          specialisations: Array.isArray(p.specialisations) ? p.specialisations.map(String) : [],
          isVerified:      Boolean(p.isVerified ?? true),
          channels:        Array.isArray(p.consultationChannels)
            ? (p.consultationChannels as ConsultChannel[]).filter(c => c === 'chat' || c === 'voice' || c === 'video')
            : [],
        })));
      })
      .catch(() => setAllPriests([]))
      .finally(() => setPriestsLoading(false));
    // Depend on filter primitives too so the list refetches when they
    // change. Arrays flattened via JSON to trigger on shape change.
  }, [
    faith,
    providerTab,
    filters?.availableNowOnly,
    filters?.minRating,
    filters?.specialisation,
    filters?.channel,
    JSON.stringify(filters?.languages ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  /* Local/Global sub-tabs. Auto-flip to Local if the user's city is known
   * AND at least one provider matches — that's the more useful default. */
  const [priestTab, setPriestTab] = useState<'local' | 'global'>('global');
  useEffect(() => {
    if (userCity && allPriests.some(p => p.city.toLowerCase() === userCity)) {
      setPriestTab('local');
    }
  }, [userCity, allPriests]);
  const filteredPriests = priestTab === 'local' && userCity
    ? allPriests.filter(p => p.city.toLowerCase() === userCity)
    : allPriests;

  return (
    <div>
      {/* Top-level Astrologers / Pandits segmented control */}
      <div style={{
        display: 'flex',
        background: 'rgba(10,22,40,0.08)',
        borderRadius: 999,
        padding: 4,
        marginBottom: 14,
        border: '1px solid rgba(10,22,40,0.15)',
      }}>
        <button
          type="button"
          onClick={handleAstrologerTap}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 999, border: 'none',
            background: providerTab === 'astrologer' ? NAVY : 'transparent',
            color: providerTab === 'astrologer' ? CREAM : NAVY,
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: providerTab === 'astrologer' ? '0 3px 8px rgba(10,22,40,0.25)' : 'none',
            fontFamily: '"Playfair Display",Georgia,serif',
            transition: 'background 0.15s',
            minHeight: 44,
          }}
        >Astrologers</button>
        <button
          type="button"
          onClick={() => setProviderTab('priest')}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 999, border: 'none',
            background: providerTab === 'priest' ? NAVY : 'transparent',
            color: providerTab === 'priest' ? CREAM : NAVY,
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: providerTab === 'priest' ? '0 3px 8px rgba(10,22,40,0.25)' : 'none',
            fontFamily: '"Playfair Display",Georgia,serif',
            transition: 'background 0.15s',
            minHeight: 44,
          }}
        >Pandits</button>
      </div>

      {/* Golden card panel */}
      <div style={{
        borderRadius: 20,
        padding: '18px 14px 20px',
        background: `linear-gradient(180deg,#F4C67B 0%,#E1B461 50%,#C99436 100%)`,
        border: '2px solid #7A4A10',
        boxShadow:
          '0 12px 30px rgba(107,50,16,0.25),' +
          'inset 0 1px 0 rgba(255,255,255,0.6),' +
          'inset 0 0 0 1px rgba(122,74,16,0.35)',
      }}>
        <div style={{
          textAlign: 'center',
          fontSize: 18, fontWeight: 800, color: '#2D1500',
          fontFamily: '"Playfair Display",Georgia,serif',
          letterSpacing: '0.01em',
          marginBottom: 4,
        }}>Available {providerLabel}s</div>
        <div style={{
          textAlign: 'center', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#7A4A10', fontSize: 10 }}>◆</span>
          <span style={{ height: 1, width: 46, background: '#7A4A10', opacity: 0.55 }} />
          <span style={{ color: '#7A4A10', fontSize: 10 }}>◆</span>
        </div>

        {/* Local / Global toggle */}
        <div style={{
          display: 'flex',
          background: 'rgba(45,21,0,0.15)',
          borderRadius: 999,
          padding: 4,
          marginBottom: 16,
          border: '1px solid rgba(122,74,16,0.30)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)',
        }}>
          <button
            type="button"
            onClick={() => setPriestTab('local')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 999, border: 'none',
              background: priestTab === 'local' ? '#0A1628' : 'transparent',
              color: priestTab === 'local' ? '#F4C67B' : '#2D1500',
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: priestTab === 'local' ? '0 3px 8px rgba(0,0,0,0.25)' : 'none',
              fontFamily: '"Playfair Display",Georgia,serif',
              transition: 'background 0.15s',
              minHeight: 44,
            }}
          >Nearby</button>
          <button
            type="button"
            onClick={() => setPriestTab('global')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 999, border: 'none',
              background: priestTab === 'global' ? '#0A1628' : 'transparent',
              color: priestTab === 'global' ? '#F4C67B' : '#2D1500',
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: priestTab === 'global' ? '0 3px 8px rgba(0,0,0,0.25)' : 'none',
              fontFamily: '"Playfair Display",Georgia,serif',
              transition: 'background 0.15s',
              minHeight: 44,
            }}
          >Global</button>
        </div>

        {/* Loading + empty states */}
        {priestsLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <span aria-hidden style={{
              display: 'inline-block', width: 28, height: 28,
              borderRadius: '50%',
              border: '3px solid rgba(45,21,0,0.20)',
              borderTopColor: '#2D1500',
              animation: 'rgpmspin 0.8s linear infinite',
            }} />
            <style>{`@keyframes rgpmspin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {!priestsLoading && filteredPriests.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center',
            fontSize: 13, color: '#2D1500', lineHeight: 1.5, fontWeight: 600,
          }}>
            {priestTab === 'local' && !userCity
              ? `Set your city in Profile to see nearby ${providerLabel.toLowerCase()}s.`
              : priestTab === 'local'
                ? `No verified ${providerLabel}s in your city yet. Try Global.`
                : `No verified ${providerLabel}s available right now.`}
          </div>
        )}

        {/* Provider cards */}
        {!priestsLoading && filteredPriests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredPriests.map((p) => {
              const isLocal = !!(userCity && p.city.toLowerCase() === userCity);
              return (
                <div key={p.id}>
                  <div style={{
                    fontSize: 12, fontWeight: 800, color: '#2D1500',
                    display: 'flex', alignItems: 'center', gap: 5,
                    marginBottom: 6, paddingLeft: 4,
                  }}>
                    <span style={{ fontSize: 13 }}>{isLocal ? '📍' : '🌐'}</span>
                    <span>{isLocal ? 'Nearby' : 'Global'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onProviderTap(p)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: 0, borderRadius: 12,
                      background: `linear-gradient(180deg,#F9DFA4 0%,#E5BE79 100%)`,
                      border: `1.5px solid #8B5A16`,
                      boxShadow: '0 3px 8px rgba(107,50,16,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      minHeight: 44,
                    }}
                  >
                    <div style={{
                      height: 3,
                      background: 'linear-gradient(90deg,transparent 0%,#8B5A16 20%,#8B5A16 80%,transparent 100%)',
                      opacity: 0.55,
                    }} />

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 12px' }}>
                      <div style={{
                        width: 58, height: 58, borderRadius: 8,
                        overflow: 'hidden', flexShrink: 0,
                        background: 'linear-gradient(135deg,#C8920A,#6B3210)',
                        border: '2px solid #2D1500',
                        boxShadow: '0 2px 6px rgba(45,21,0,0.35)',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.photo}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: '"Playfair Display",Georgia,serif',
                          fontSize: 16, fontWeight: 800, color: '#1A0800',
                          lineHeight: 1.2,
                        }}>
                          {p.name}
                        </div>

                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          fontSize: 13, marginTop: 4,
                        }}>
                          <span style={{
                            color: '#5A2A00', fontWeight: 800,
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <span style={{ color: '#E0A020', fontSize: 14 }}>★</span>
                            {p.rating.toFixed(1)}
                          </span>
                          {p.isVerified && (
                            <span style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              color: '#0F5132', fontWeight: 700, fontSize: 12,
                            }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 15, height: 15, borderRadius: '50%',
                                background: '#16a34a', color: '#fff',
                                fontSize: 10, fontWeight: 900,
                              }}>✓</span>
                              Verified
                            </span>
                          )}
                        </div>

                        <div style={{
                          fontSize: 12, color: '#3D1F00', marginTop: 5,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}>
                          {p.specialisations.length > 0
                            ? p.specialisations.slice(0, 3).join(', ')
                            : `${p.yearsExp}+ yrs · ${p.languages.slice(0,2).join(', ')}`}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      height: 3,
                      background: 'linear-gradient(90deg,transparent 0%,#8B5A16 20%,#8B5A16 80%,transparent 100%)',
                      opacity: 0.55,
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Exported so the invite flow can pass this tab state up if it wants —
 * currently unused externally but useful for testing. */
export { ProviderMarketplace as _ProviderMarketplace };
