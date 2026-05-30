'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tokenStore } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

const NAVY    = '#0A1628';
const NAVY_2  = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFF8E7';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';
const GREEN   = '#16A34A';
const PRICE   = '#7A1F1F';

type Faith = 'hindu' | 'muslim' | 'sikh' | 'christian';
type Mode  = 'chat' | 'call' | 'video';

const FAITH_CONFIG: Record<Faith, { label: string; role: string; hero: string }> = {
  hindu:     { label: 'Hindu',     role: 'Pandit',  hero: '/priests/hindu-ask.jpg'     },
  muslim:    { label: 'Muslim',    role: 'Imam',    hero: '/priests/muslim-ask.jpg'    },
  sikh:      { label: 'Sikh',      role: 'Granthi', hero: '/priests/sikh-ask.jpg'      },
  christian: { label: 'Christian', role: 'Priest',  hero: '/priests/christian-ask.jpg' },
};

interface ConsultPriest {
  id: string; name: string; specialty: string;
  yearsExp: number; languages: string[];
  rating: number; reviews: number;
  ratePerMin: number;          // rupees per minute
  introMinutesFree: number;    // first N minutes free
  online: boolean; busy: boolean;
  photo: string;
}

// No hardcoded priest pool. The list below is driven entirely by the real
// backend's GET /v1/providers/by-religion/:religion. When the endpoint is
// unreachable or returns no rows we show an empty state instead of fake
// names — never serve fabricated humans.

export default function AskPriestScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const rawFaith = (params?.get('faith') ?? 'hindu') as Faith;
  const faith: Faith = (['hindu','muslim','sikh','christian'] as const).includes(rawFaith as Faith) ? rawFaith : 'hindu';
  const cfg = FAITH_CONFIG[faith];

  const [filter, setFilter] = useState<'all' | 'online' | 'top'>('all');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [priestList, setPriestList] = useState<ConsultPriest[] | null>(null);
  const [loadingPriests, setLoadingPriests] = useState(false);

  // Wallet balance lookup so users see if they can afford to start
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    const tok = tokenStore.access;
    if (!tok) return;
    fetch(`${API_BASE}/wallet/balance`, { headers: { Authorization: 'Bearer ' + tok } })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const paise = j?.data?.availablePaise ?? j?.availablePaise ?? null;
        if (typeof paise === 'number') setWalletBalance(paise / 100);
      })
      .catch(() => { /* mock backend may not have this; ignore */ });
  }, []);

  /**
   * Fetch real priests from the backend's OpenSearch-backed provider index.
   *   GET /v1/priests?faith=<faith>&online=1   (when filter === 'online')
   *   GET /v1/priests?faith=<faith>&sort=rating  (when filter === 'top')
   *
   * Backend ProviderDocument shape (per provider-index.service.ts):
   *   { id, name, bio, specialties, religion, roles, city, location,
   *     rating, reviewCount, experienceYears, onlineNow, pricePerMinPaise,
   *     servicesOffered, languages, ... }
   *
   * Falls back to the static POOL[faith] when the API is unreachable / empty
   * so the UI never blanks in dev against the mock backend.
   */
  useEffect(() => {
    let cancelled = false;
    setLoadingPriests(true);
    const tok = tokenStore.access;
    // Real backend route is GET /v1/providers/by-religion/:religion (NOT
    // /v1/priests — that was a v0 path that never landed).
    //   path :religion ∈ hindu | islam | sikh | christian  (NOT "muslim")
    //   query: city?, lang?, availableNow?, cursor?, limit?
    //   per-priest fields: id, fullName, religion, city, experienceYears,
    //     languages[], ratingAvg, ratingCount, bio, perMinutePaise,
    //     perMinuteTier, serviceMode, servicesCount
    const faithParam: string = faith === 'muslim' ? 'islam' : faith;
    const qs = new URLSearchParams({ limit: '50' });
    if (filter === 'online') qs.set('availableNow', 'true');
    const headers: Record<string,string> = {};
    if (tok) headers['Authorization'] = 'Bearer ' + tok;

    fetch(`${API_BASE}/providers/by-religion/${faithParam}?${qs.toString()}`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return;
        // Backend returns { items, limit, hasMore, nextCursor }. Accept the
        // older shapes too in case the API evolves.
        const raw: unknown[] = Array.isArray(j)
          ? j
          : (j?.items ?? j?.data ?? []);
        if (!raw.length) { setPriestList(null); return; }
        const mapped: ConsultPriest[] = raw.map((rec): ConsultPriest => {
          const p = rec as Record<string, unknown>;
          const langField = p['languages'];
          const langs: string[] = Array.isArray(langField)
            ? langField.map(String)
            : (typeof langField === 'string' ? langField.split(/[·,]/).map(s => s.trim()).filter(Boolean) : []);
          const ratePerMinPaise = Number(p['perMinutePaise'] ?? p['pricePerMinPaise'] ?? p['ratePerMinPaise'] ?? 0);
          return {
            id:         String(p['id'] ?? p['providerId'] ?? ''),
            name:       String(p['fullName'] ?? p['name'] ?? p['displayName'] ?? 'Unknown'),
            specialty:  String(p['bio'] ?? p['specialty'] ?? ''),
            yearsExp:   Number(p['experienceYears'] ?? p['yearsExp'] ?? 0),
            languages:  langs,
            rating:     Number(p['ratingAvg'] ?? p['rating'] ?? 0),
            reviews:    Number(p['ratingCount'] ?? p['reviewCount'] ?? p['reviews'] ?? 0),
            ratePerMin: ratePerMinPaise > 0 ? Math.round(ratePerMinPaise / 100) : Number(p['ratePerMin'] ?? 0),
            introMinutesFree: Number(p['introMinutesFree'] ?? 5),
            online:     Boolean(p['availableNow'] ?? p['onlineNow'] ?? p['online'] ?? false),
            busy:       Boolean(p['busy'] ?? false),
            photo:      String(p['avatarUrl'] ?? p['photoUrl'] ?? p['photo'] ?? `/priests/${faith}-ask.jpg`),
          };
        });
        setPriestList(mapped);
      })
      .catch(() => { if (!cancelled) setPriestList(null); })
      .finally(() => { if (!cancelled) setLoadingPriests(false); });

    return () => { cancelled = true; };
  }, [faith, filter]);

  // Drive the list directly off the API. An empty list renders the
  // "no priests available" state below — no fake fallback.
  const allPriests = priestList ?? [];
  const priests = (() => {
    if (filter === 'online') return allPriests.filter(p => p.online && !p.busy);
    if (filter === 'top')    return [...allPriests].sort((a, b) => b.rating - a.rating);
    return allPriests;
  })();

  /**
   * Start a per-minute consultation session.
   * Backend contract (already exists in ConsultationController):
   *   POST /v1/consultation/start
   *     body: { providerId, planType: 'per_minute' | 'intro_5', mode }
   *     returns: { sessionId, ratePerMin, walletBalancePaise }
   * If the mock backend doesn't have this, we synthesise a session id so the
   * dev flow still routes to the consultation room (which is itself defensive).
   */
  async function startConsult(p: ConsultPriest, mode: Mode) {
    setStartingId(p.id);
    setErrorMsg('');
    const tok = tokenStore.access ?? '';
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    try {
      // Real backend's StartSessionDto only accepts { providerId, planType? }.
      // Global ValidationPipe runs forbidNonWhitelisted:true → any other body
      // field causes HTTP 400. The `mode` choice (chat/call/video) is
      // negotiated client-side via the WS namespace + the query string we
      // append on the /consultation/[sessionId] redirect below.
      const res = await fetch(`${API_BASE}/consultation/start`, {
        method: 'POST', headers,
        body: JSON.stringify({
          providerId: p.id,
          planType: 'intro_5',
        }),
      }).catch(() => null);

      let sessionId = 'sess-' + p.id + '-' + mode + '-' + Date.now().toString(36);
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        sessionId = json?.data?.sessionId ?? json?.sessionId ?? sessionId;
      } else if (res && res.status === 402) {
        setErrorMsg('Insufficient wallet balance. Please add money to start the consultation.');
        setStartingId(null);
        return;
      }
      router.push(`/consultation/${sessionId}?mode=${mode}&providerId=${p.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start consultation.');
      setStartingId(null);
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        backgroundImage: `linear-gradient(135deg, rgba(10,22,40,0.82) 0%, rgba(26,36,56,0.65) 50%, rgba(42,24,8,0.55) 100%), url('${cfg.hero}')`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        backgroundColor: NAVY,
        padding: '14px 16px 18px', color: '#fff',
      }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginBottom: 12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ fontSize: 10.5, color: GOLD_L, letterSpacing: '0.1em', fontWeight: 800, marginBottom: 4 }}>{cfg.label.toUpperCase()} CONSULTATION</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Playfair Display",Georgia,serif', margin: '0 0 4px', lineHeight: 1.1 }}>
          Ask a {cfg.role}
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.4 }}>
          Get instant guidance via chat, voice or video. First 5 minutes are free with every {cfg.role}.
        </p>
        {walletBalance !== null && (
          <div style={{ marginTop: 12, padding: '6px 10px', background: 'rgba(200,146,10,0.18)', border: '1px solid rgba(200,146,10,0.45)', borderRadius: 10, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>💰 Wallet balance:</span>
            <strong style={{ color: GOLD_L }}>₹{walletBalance.toLocaleString('en-IN')}</strong>
            <button onClick={() => router.push('/wallet')} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Add money</button>
          </div>
        )}
      </div>

      {/* ── FILTER PILLS ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, padding: '14px 14px 0' }}>
        {([{ k: 'all', l: 'All' }, { k: 'online', l: 'Online now' }, { k: 'top', l: 'Top rated' }] as const).map(t => {
          const active = filter === t.k;
          return (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{
              background: active ? NAVY_2 : '#fff',
              color: active ? '#fff' : TEXT2,
              border: `1px solid ${active ? NAVY_2 : 'rgba(200,146,10,0.30)'}`,
              fontSize: 11.5, fontWeight: 700,
              padding: '7px 14px', borderRadius: 18,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{t.l}</button>
          );
        })}
      </div>

      {/* ── ERROR ─────────────────────────────────────────────── */}
      {errorMsg && (
        <div style={{ margin: '12px 14px 0', padding: 10, background: '#FEE2E2', color: '#7A1F1F', borderRadius: 8, fontSize: 12 }}>{errorMsg}</div>
      )}

      {/* ── PRIEST LIST ────────────────────────────────────────── */}
      <div style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>
        {loadingPriests && priestList === null && (
          <div style={{ padding: 16, textAlign: 'center', color: TEXT3, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(200,146,10,0.3)', borderTopColor: GOLD, borderRadius: '50%', animation: 'rgspin 0.8s linear infinite' }} />
            Looking up verified {cfg.role}s…
            <style>{`@keyframes rgspin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {!loadingPriests && priests.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: TEXT3, fontSize: 13 }}>No {cfg.role}s match this filter right now.</div>
        )}
        {priests.map(p => {
          const isStarting = startingId === p.id;
          return (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 12,
              border: `1px solid ${p.online && !p.busy ? 'rgba(22,163,74,0.30)' : 'rgba(200,146,10,0.22)'}`,
              padding: 12,
              opacity: p.busy ? 0.78 : 1,
            }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#C8920A,#6B3210)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: p.busy ? '#D97706' : (p.online ? GREEN : '#9CA3AF'),
                    border: '2px solid #fff',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{p.name}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: TEXT3, lineHeight: 1.35 }}>{p.specialty}</div>
                  <div style={{ fontSize: 10, color: TEXT3, marginTop: 2 }}>{p.yearsExp}+ yrs · {p.languages.join(' · ')}</div>
                  <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 800, marginTop: 4 }}>⭐ {p.rating.toFixed(1)} ({p.reviews})</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: PRICE, lineHeight: 1 }}>₹{p.ratePerMin}</div>
                  <div style={{ fontSize: 9, color: TEXT3, fontWeight: 600 }}>/ min</div>
                  <div style={{ fontSize: 9, color: GREEN, fontWeight: 700, marginTop: 4 }}>First {p.introMinutesFree} mins FREE</div>
                </div>
              </div>

              {/* Mode buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {(['chat','call','video'] as Mode[]).map(mode => {
                  const disabled = isStarting || p.busy || !p.online;
                  return (
                    <button key={mode}
                      onClick={() => startConsult(p, mode)}
                      disabled={disabled}
                      style={{
                        background: disabled ? 'rgba(15,36,82,0.18)' : NAVY_2,
                        color: '#fff',
                        fontSize: 11, fontWeight: 800,
                        padding: '8px 0', borderRadius: 8,
                        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                      {mode === 'chat' && <>💬 Chat</>}
                      {mode === 'call' && <>📞 Call</>}
                      {mode === 'video' && <>📹 Video</>}
                    </button>
                  );
                })}
              </div>
              {p.busy && <div style={{ fontSize: 10, color: '#D97706', fontWeight: 700, textAlign: 'center', marginTop: 6 }}>● Busy in another session — try later</div>}
              {isStarting && <div style={{ fontSize: 10.5, color: NAVY_2, fontWeight: 700, textAlign: 'center', marginTop: 6 }}>Starting session…</div>}
            </div>
          );
        })}
      </div>

      {/* ── Bottom info bar — Rupees/min explainer ─────────────── */}
      <div style={{ margin: '8px 14px 0', padding: '10px 12px', background: '#FFF6E0', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 10, fontSize: 11, color: TEXT2, lineHeight: 1.55 }}>
        <strong>How rupees/min works:</strong> Every {cfg.role}'s first <strong>5 minutes are free</strong>. After that, your wallet is debited per minute at the rate shown. End anytime — you only pay for time used.
      </div>
    </div>
  );
}
