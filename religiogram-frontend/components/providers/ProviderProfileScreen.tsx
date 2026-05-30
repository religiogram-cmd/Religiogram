'use client';

import { useState, useEffect } from 'react';
import { tokenStore } from '@/lib/api';
import { formatRupees } from '@/lib/format-currency';

const NAVY  = '#1B2A5C';
const GOLD  = '#C8920A';
const PARCH = '#FFFBF0';
const WHITE = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.65)';

interface Props {
  providerId?: string;
  onBack?: () => void;
  onBookNow?: () => void;
  onChatNow?: () => void;
}

// Reviews loaded from API — see state below

const FAQS = [
  { q: 'What is included in the Satyanarayan Katha price?',
    a: 'Base price includes priest services for 2-3 hours. Samagri/materials can be arranged as an add-on for Rs.500.' },
  { q: 'Do you travel outside Delhi?',
    a: 'Yes, with a travel fee of Rs.50/km beyond 20km from Central Delhi.' },
  { q: 'How to prepare for Griha Pravesh?',
    a: 'I provide a preparation checklist 48 hours before. Basic requirements: clean entrance, rangoli at door, diyas, and specific items listed in the checklist.' },
];

function Stars({ n, t = 5 }: { n: number; t?: number }) {
  return <span style={{ color: GOLD, fontSize: 14 }}>{'\u2605'.repeat(n)}{'\u2606'.repeat(t - n)}</span>;
}

export default function ProviderProfileScreen({ providerId: _p, onBack, onBookNow, onChatNow }: Props) {
  const [expandSvc, setExpandSvc] = useState<string | null>(null);
  const [expandFaq, setExpandFaq] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [providerServices, setProviderServices] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    if (!_p) return;
    fetch(`/api/v1/providers/${_p}`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` }
    })
      .then(r => r.json())
      .then(data => setProvider(data))
      .catch(console.error);

    fetch(`/api/v1/catalog/services?providerId=${_p}`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` }
    })
      .then(r => r.json())
      .then(data => setProviderServices(data.items ?? []))
      .catch(console.error);

    // F3: Load real reviews
    fetch(`/api/v1/reviews?targetId=${_p}&targetType=provider&limit=5`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` }
    })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setReviews(data.items ?? []))
      .catch(() => setReviews([]));
  }, [_p]);

  const card: React.CSSProperties = { background: WHITE, borderRadius: 16, padding: 16, marginBottom: 12 };
  const secTitle: React.CSSProperties = { color: NAVY, fontWeight: 700, fontSize: 17, marginBottom: 12 };

  return (
    <div style={{ background: PARCH, minHeight: '100vh', fontFamily: 'system-ui,sans-serif' }}>

      {/* HEADER */}
      <div style={{ background: NAVY, padding: '52px 16px 20px', position: 'relative' }}>
        {onBack && (
          <button onClick={onBack} style={{
            position: 'absolute', top: 52, left: 16, background: 'rgba(255,255,255,0.15)',
            border: 'none', borderRadius: '50%', width: 36, height: 36,
            color: WHITE, fontSize: 22, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>{'<'}</button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: '#0d1a3a',
            border: '3px solid ' + GOLD, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: GOLD, fontWeight: 700, fontSize: 22,
          }}>PR</div>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: WHITE, fontWeight: 700, fontSize: 20, margin: 0 }}>{provider?.displayName ?? provider?.name ?? 'Service Provider'}</h1>
            <p style={{ color: GOLD, fontSize: 13, margin: '3px 0 0' }}>Vedic Pandit · Hindu</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 6 }}>
              <span style={{ color: GOLD }}>✓</span>
              <span style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>Identity Verified</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ color: GOLD }}>★</span>
              <span style={{ color: WHITE, fontWeight: 700, fontSize: 14 }}>{(provider?.ratingAvg ?? 0).toFixed(1)}</span>
              <span style={{ color: MUTED, fontSize: 12 }}>({provider?.reviewCount ?? 0} reviews)</span>
            </div>
            {(provider?.yearsExperience ?? provider?.experience) ? <p style={{ color: MUTED, fontSize: 12, margin: '4px 0 0' }}>{provider?.yearsExperience ?? provider?.experience} years experience</p> : null}
            <p style={{ color: MUTED, fontSize: 12, margin: '2px 0 0' }}>Responds in &lt; 30 min</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />
              <span style={{ color: '#4CAF50', fontSize: 12, fontWeight: 600 }}>Available today</span>
            </div>
          </div>

          <button onClick={onBookNow} style={{
            background: GOLD, color: WHITE, border: 'none', borderRadius: 12,
            padding: '13px 0', width: '100%', fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>Book Now</button>

          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            {[
              { label: 'Chat',                         fn: onChatNow },
              { label: saved ? 'Saved ♥' : 'Save ♡',  fn: () => setSaved((s: any) => !s) },
              { label: 'Share',                        fn: () => {} },
            ].map(b => (
              <button key={b.label} onClick={b.fn} style={{
                flex: 1, background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 10, padding: '9px 4px', color: WHITE,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{b.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px 80px' }}>

        {/* STATS */}
        <div style={{ ...card, display: 'flex', justifyContent: 'space-around', textAlign: 'center', padding: '14px 8px' }}>
          {[
            ...(provider?.responseRate != null ? [{ v: `${provider.responseRate}%`, l: 'Response Rate' }] : []),
            { v: `${(provider?.ratingAvg ?? 0).toFixed(1)}★`, l: 'Rating' },
            { v: String(provider?.reviewCount ?? 0), l: 'Reviews' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ color: NAVY, fontWeight: 700, fontSize: 18 }}>{s.v}</div>
              <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* ABOUT */}
        <div style={card}>
          <h2 style={secTitle}>About</h2>
          <p style={{ color: '#444', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            {provider?.bio ?? provider?.description ?? 'Experienced spiritual service provider with deep knowledge of rituals and ceremonies.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            {['Sanskrit Diploma (2008)', 'Vedic Studies — Kashi', 'Jyotish Certificate'].map(c => (
              <span key={c} style={{ background: '#F5F0E8', color: NAVY, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: '1px solid #ddd' }}>{c}</span>
            ))}
          </div>
          <p style={{ color: '#666', fontSize: 12, marginTop: 10 }}><strong>Languages:</strong> Hindi • English • Sanskrit</p>
        </div>

        {/* SERVICES */}
        <div style={card}>
          <h2 style={secTitle}>Services</h2>
          {providerServices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#888', fontSize: 13 }}>Loading services...</div>
            ) : providerServices.map((svc: any, idx: number) => (
            <div key={svc.id} style={{ borderBottom: idx < providerServices.length - 1 ? '1px solid #f0ebe0' : 'none', paddingBottom: 12, marginBottom: idx < providerServices.length - 1 ? 12 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{svc.name}</div>
                  <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{svc.duration}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>From {formatRupees(svc.price)}</div>
                  <button onClick={onBookNow} style={{ marginTop: 5, border: '1.5px solid ' + GOLD, background: 'transparent', color: GOLD, borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Book</button>
                </div>
              </div>
              {svc.addons.length > 0 && (
                <>
                  <button onClick={() => setExpandSvc(expandSvc === svc.id ? null : svc.id)} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 6, padding: 0 }}>
                    {expandSvc === svc.id ? '▲ Hide add-ons' : '▼ View add-ons'}
                  </button>
                  {expandSvc === svc.id && (
                    <div style={{ marginTop: 8, paddingLeft: 12 }}>
                      {svc.addons.map((a: any) => (
                        <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: '#555', fontSize: 12, borderBottom: '1px solid #f5f0e8' }}>
                          <span>+ {a.name}</span>
                          <span style={{ color: GOLD, fontWeight: 600 }}>+{formatRupees(a.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* REVIEWS */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ color: NAVY, fontWeight: 700, fontSize: 17, margin: 0 }}>Reviews ({provider?.reviewCount ?? reviews.length})</h2>
            <select style={{ border: '1px solid #ddd', borderRadius: 8, padding: '5px 8px', fontSize: 12, color: NAVY, background: WHITE }}>
              <option>Most recent</option>
              <option>Highest rated</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: 12, background: '#FAFAF5', borderRadius: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: NAVY }}>{(provider?.ratingAvg ?? 0).toFixed(1)}</div>
              <div style={{ color: GOLD, fontSize: 16 }}>{'★'.repeat(Math.round(provider?.ratingAvg ?? 0))}{'☆'.repeat(5 - Math.round(provider?.ratingAvg ?? 0))}</div>
            </div>
            <div style={{ flex: 1 }}>
              {[5, 4, 3, 2, 1].map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: '#888', fontSize: 11, width: 12 }}>{n}</span>
                  <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 6 }}>
                    <div style={{ height: 6, borderRadius: 4, background: GOLD, width: n === 5 ? '88%' : n === 4 ? '9%' : '2%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {reviews.length === 0 ? <div style={{ textAlign: 'center', padding: '16px 0', color: '#888', fontSize: 13 }}>No reviews yet.</div> : reviews.map((r, i) => (
            <div key={i} style={{ borderBottom: i < reviews.length - 1 ? '1px solid #f0ebe0' : 'none', paddingBottom: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>{r.name}</span>
                  <span style={{ color: '#aaa', fontSize: 11, marginLeft: 8 }}>{r.time}</span>
                </div>
                <Stars n={r.stars} />
              </div>
              <p style={{ color: '#555', fontSize: 13, lineHeight: 1.5, margin: '6px 0 8px' }}>{r.text}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.badges.map((b: any) => (
                  <span key={b} style={{ background: '#E8F5E9', color: '#2E7D32', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20 }}>✓ {b}</span>
                ))}
              </div>
            </div>
          ))}
          <button style={{ background: 'none', border: 'none', color: GOLD, fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>Show all {provider?.reviewCount ?? 0} reviews →</button>
        </div>

        {/* TRUST */}
        <div style={{ ...card, border: '1.5px solid ' + GOLD }}>
          <h2 style={secTitle}>Trust &amp; Safety</h2>
          {[
            { label: 'Identity Verified', sub: 'Aadhaar, 12 Jan 2024' },
            { label: 'Video Verified',    sub: '14 Jan 2024' },
            { label: 'Admin Approved',    sub: '15 Jan 2024' },
            { label: 'Member since 2022', sub: '' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2E7D32', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>✓</div>
              <div>
                <div style={{ color: NAVY, fontWeight: 600, fontSize: 13 }}>{t.label}</div>
                {t.sub && <div style={{ color: '#888', fontSize: 11 }}>{t.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={card}>
          <h2 style={secTitle}>FAQ</h2>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid #f0ebe0' : 'none', marginBottom: 10, paddingBottom: 10 }}>
              <button onClick={() => setExpandFaq(expandFaq === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', padding: 0, textAlign: 'left', gap: 8 }}>
                <span style={{ color: NAVY, fontWeight: 600, fontSize: 13, flex: 1 }}>{faq.q}</span>
                <span style={{ color: GOLD, fontSize: 16 }}>{expandFaq === i ? '▲' : '▼'}</span>
              </button>
              {expandFaq === i && <p style={{ color: '#555', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0', paddingLeft: 4 }}>{faq.a}</p>}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
