'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  getPlaceDetail,
  listReviews,
  getDonationStats,
  upsertReview,
  createDonationOrder,
  verifyDonation,
  googleMapsDirectionsUrl,
  formatRupees,
  starBreakdown,
  type PlaceDetailDto,
  type ReviewsPageDto,
  type DonationStatsDto,
  type ReviewDto,
} from '@/lib/places-api';

/* ── Design tokens ───────────────────────────────────────────────── */
const GOLD  = '#C8920A';
const GOLD2 = '#E8C050';
const NAVY  = '#0A1628';
const DARK  = '#06101E';
const PARCH = '#F5E6C0';
const CARD  = 'rgba(255,255,255,0.05)';

/* ── Religion config ─────────────────────────────────────────────── */
const REL_CONFIG: Record<string, {
  donateSymbol: string; color: string; typeLabel: string; services: string[];
}> = {
  hindu:     { donateSymbol: 'ॐ',  color: '#E8B060', typeLabel: 'Hindu Temple',  services: ['Aarti','Havan','Weddings','Prasad','Yoga'] },
  muslim:    { donateSymbol: '☪',  color: '#60B890', typeLabel: 'Masjid',         services: ['Jumu\'ah','Nikah','Funeral','Quran Classes','Zakat'] },
  sikh:      { donateSymbol: '☬',  color: '#E8C060', typeLabel: 'Gurudwara',      services: ['Ardas','Langar Seva','Anand Karaj','Kirtan','Naam Simran'] },
  christian: { donateSymbol: '✝',  color: '#A080D0', typeLabel: 'Church',         services: ['Sunday Mass','Baptism','Confession','Choir','Bible Study'] },
  other:     { donateSymbol: '✶',  color: GOLD2,     typeLabel: 'Place of Worship', services: ['Prayer','Meditation','Community Service','Events'] },
};

const TYPE_TO_REL: Record<string, string> = {
  temple: 'hindu', mosque: 'muslim', church: 'christian', gurudwara: 'sikh',
};

/* ── Arch SVG frame ──────────────────────────────────────────────── */
function ArchFrame({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 360 320" preserveAspectRatio="none"
      style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
      {/* Arch outline */}
      <path d="M40,300 L40,160 Q40,40 180,40 Q320,40 320,160 L320,300"
        fill="none" stroke={color} strokeWidth="2" opacity="0.85"/>
      {/* Inner arch */}
      <path d="M60,300 L60,165 Q60,65 180,65 Q300,65 300,165 L300,300"
        fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
      {/* Top ornament */}
      <circle cx="180" cy="38" r="6" fill={color} opacity="0.9"/>
      <circle cx="180" cy="38" r="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6"/>
      {/* Corner brackets */}
      <path d="M40,120 L20,120 L20,280" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5"/>
      <path d="M320,120 L340,120 L340,280" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5"/>
      {/* Hanging lanterns */}
      <line x1="100" y1="40" x2="100" y2="72" stroke={color} strokeWidth="1.2" opacity="0.5"/>
      <ellipse cx="100" cy="80" rx="9" ry="12" fill="none" stroke={color} strokeWidth="1.2" opacity="0.6"/>
      <line x1="260" y1="40" x2="260" y2="72" stroke={color} strokeWidth="1.2" opacity="0.5"/>
      <ellipse cx="260" cy="80" rx="9" ry="12" fill="none" stroke={color} strokeWidth="1.2" opacity="0.6"/>
    </svg>
  );
}

/* ── Star row ────────────────────────────────────────────────────── */
function Stars({ avg, size = 14 }: { avg: number | null; size?: number }) {
  const stars = starBreakdown(avg);
  return (
    <span style={{ display:'inline-flex', gap:2 }}>
      {stars.map((s, i) => (
        <span key={i} style={{ fontSize: size, color: s === 'empty' ? 'rgba(232,192,80,0.3)' : GOLD2 }}>
          {s === 'half' ? '★' : s === 'full' ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

/* ── Rating distribution bar ─────────────────────────────────────── */
function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
      <span style={{ fontSize:11, color:'rgba(245,230,192,0.7)', width:12 }}>{star}</span>
      <span style={{ fontSize:11 }}>&#9733;</span>
      <div style={{ flex:1, height:5, borderRadius:3, background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg,${GOLD},${GOLD2})`, borderRadius:3, transition:'width 0.5s' }} />
      </div>
      <span style={{ fontSize:11, color:'rgba(245,230,192,0.5)', width:24, textAlign:'right' }}>{count}</span>
    </div>
  );
}

/* ── Review card ─────────────────────────────────────────────────── */
function ReviewCard({ review }: { review: ReviewDto }) {
  const date = new Date(review.createdAt).toLocaleDateString('en-IN', { month:'short', year:'numeric' });
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'12px 14px', marginBottom:10, border:'1px solid rgba(200,146,10,0.15)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:15, background:`linear-gradient(135deg,${GOLD},${GOLD2})`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:13, fontWeight:800, color:NAVY }}>
              {(review.userName ?? 'A').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:PARCH }}>{review.userName ?? 'Anonymous'}</div>
            <div style={{ fontSize:10, color:'rgba(245,230,192,0.5)' }}>{date}</div>
          </div>
        </div>
        <Stars avg={review.rating} size={12} />
      </div>
      {review.body && (
        <p style={{ fontSize:12, color:'rgba(245,230,192,0.8)', lineHeight:1.6, margin:0 }}>{review.body}</p>
      )}
      {review.photoUrls?.length > 0 && (
        <div style={{ display:'flex', gap:6, marginTop:8, overflowX:'auto' }}>
          {review.photoUrls.map((url, i) => (
            <img key={i} src={url} alt="" style={{ width:60, height:60, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Write review modal ──────────────────────────────────────────── */
function WriteReviewModal({
  placeId, onClose, onSubmit,
}: { placeId: string; onClose: () => void; onSubmit: (r: ReviewDto) => void }) {
  const [rating, setRating] = useState(5);
  const [body, setBody]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit() {
    setSaving(true); setError('');
    try {
      const r = await upsertReview(placeId, { rating, body: body || undefined });
      onSubmit(r);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to submit review');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(6,16,30,0.85)', zIndex:500, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:480, background:NAVY, borderRadius:'20px 20px 0 0', padding:'24px 20px 36px', border:`1px solid rgba(200,146,10,0.25)` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <span style={{ fontSize:17, fontWeight:800, color:PARCH, fontFamily:"'Playfair Display',serif" }}>Write a Review</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:GOLD2, fontSize:22, cursor:'pointer', lineHeight:1 }}>&times;</button>
        </div>

        {/* Star selector */}
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:18 }}>
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => setRating(s)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:30, color: s <= rating ? GOLD2 : 'rgba(232,192,80,0.2)', lineHeight:1 }}>
              &#9733;
            </button>
          ))}
        </div>

        <textarea
          placeholder="Share your experience (optional)..."
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:`1px solid rgba(200,146,10,0.3)`, borderRadius:10, padding:'10px 12px', color:PARCH, fontSize:13, fontFamily:'inherit', resize:'none', boxSizing:'border-box', outline:'none' }}
        />

        {error && <p style={{ color:'#FF6B6B', fontSize:12, marginTop:6 }}>{error}</p>}

        <button onClick={submit} disabled={saving}
          style={{ width:'100%', marginTop:14, padding:'13px 0', borderRadius:30, background:`linear-gradient(90deg,${GOLD},${GOLD2})`, border:'none', color:NAVY, fontSize:14, fontWeight:800, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </div>
  );
}

/* ── Donation modal ──────────────────────────────────────────────── */
const DONATION_PRESETS = [10100, 20100, 50100, 100100]; // paise

function DonationModal({
  place, onClose,
}: { place: PlaceDetailDto; onClose: () => void }) {
  const [amount, setAmount] = useState(10100);
  const [customAmt, setCustomAmt] = useState('');
  const [message, setMessage] = useState('');
  const [anon, setAnon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const relKey = TYPE_TO_REL[place.type] ?? 'other';
  const cfg = REL_CONFIG[relKey] ?? REL_CONFIG.other;

  async function initiateDonation() {
    const paise = customAmt ? Math.round(parseFloat(customAmt) * 100) : amount;
    if (!paise || paise < 100) { setError(`Minimum donation is ${formatRupees(1)}`); return; }

    setLoading(true); setError('');
    try {
      const order = await createDonationOrder(place.id, {
        amountPaise: paise, message: message || undefined, isAnonymous: anon,
      });

      // Load Razorpay script
      await loadRazorpay();
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'ReligioGram',
        description: `Donation to ${place.name}`,
        order_id: order.razorpayOrderId,
        handler: async (resp: any) => {
          try {
            await verifyDonation({
              donationId: order.donationId,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            }, place.id);
            setSuccess(true);
          } catch { setError('Payment verification failed. Please contact support.'); }
        },
        prefill: { name: '', email: '', contact: '' },
        theme: { color: GOLD },
      });
      rzp.open();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to initiate payment');
    } finally { setLoading(false); }
  }

  if (success) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(6,16,30,0.9)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ background:NAVY, borderRadius:20, padding:'32px 24px', textAlign:'center', maxWidth:320, border:`1px solid ${GOLD}` }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{cfg.donateSymbol}</div>
          <h2 style={{ color:GOLD2, fontFamily:"'Playfair Display',serif", fontSize:20, margin:'0 0 8px' }}>Donation Successful!</h2>
          <p style={{ color:'rgba(245,230,192,0.7)', fontSize:13, marginBottom:20 }}>
            Thank you for your offering to {place.name}. May you be blessed.
          </p>
          <button onClick={onClose}
            style={{ padding:'11px 30px', borderRadius:30, background:`linear-gradient(90deg,${GOLD},${GOLD2})`, border:'none', color:NAVY, fontWeight:800, fontSize:14, cursor:'pointer' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(6,16,30,0.88)', zIndex:500, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:480, background:NAVY, borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', border:`1px solid rgba(200,146,10,0.3)` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:17, fontWeight:800, color:PARCH, fontFamily:"'Playfair Display',serif" }}>
            {cfg.donateSymbol}&nbsp; Donate to {place.name}
          </span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:GOLD2, fontSize:22, cursor:'pointer' }}>&times;</button>
        </div>
        <p style={{ fontSize:12, color:'rgba(245,230,192,0.55)', marginBottom:16 }}>100% goes directly to the place. Secure via Razorpay.</p>

        {/* Presets */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
          {DONATION_PRESETS.map(p => (
            <button key={p} onClick={() => { setAmount(p); setCustomAmt(''); }}
              style={{ padding:'9px 4px', borderRadius:10, border:`1.5px solid ${amount===p && !customAmt ? GOLD : 'rgba(200,146,10,0.25)'}`, background: amount===p && !customAmt ? `rgba(200,146,10,0.12)` : 'transparent', color: amount===p && !customAmt ? GOLD2 : 'rgba(245,230,192,0.6)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              {formatRupees(p)}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:GOLD2, fontSize:14, fontWeight:700 }}>&#8377;</span>
          <input
            type="number" placeholder="Custom amount" value={customAmt}
            onChange={e => setCustomAmt(e.target.value)}
            style={{ width:'100%', boxSizing:'border-box', paddingLeft:28, padding:'11px 12px 11px 28px', background:'rgba(255,255,255,0.06)', border:`1px solid rgba(200,146,10,0.3)`, borderRadius:10, color:PARCH, fontSize:13, outline:'none' }}
          />
        </div>

        {/* Message */}
        <textarea
          placeholder="Message to the temple (optional)"
          value={message} onChange={e => setMessage(e.target.value)} rows={2}
          style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:`1px solid rgba(200,146,10,0.2)`, borderRadius:10, padding:'9px 12px', color:PARCH, fontSize:12, fontFamily:'inherit', resize:'none', marginBottom:10, outline:'none' }}
        />

        {/* Anonymous toggle */}
        <label style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, cursor:'pointer' }}>
          <div onClick={() => setAnon(!anon)}
            style={{ width:40, height:22, borderRadius:11, background: anon ? GOLD : 'rgba(255,255,255,0.15)', transition:'background 0.2s', position:'relative' }}>
            <div style={{ position:'absolute', top:2, left: anon ? 20 : 2, width:18, height:18, borderRadius:9, background:'white', transition:'left 0.2s' }} />
          </div>
          <span style={{ fontSize:12, color:'rgba(245,230,192,0.65)' }}>Donate anonymously</span>
        </label>

        {error && <p style={{ color:'#FF6B6B', fontSize:12, marginBottom:8 }}>{error}</p>}

        <button onClick={initiateDonation} disabled={loading}
          style={{ width:'100%', padding:'14px 0', borderRadius:30, background:`linear-gradient(90deg,${GOLD},${GOLD2})`, border:'none', color:NAVY, fontSize:15, fontWeight:800, cursor:'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Processing...' : `Donate ${customAmt ? formatRupees(parseFloat(customAmt)) : formatRupees(amount)}`}
        </button>
      </div>
    </div>
  );
}

/* ── Razorpay loader ─────────────────────────────────────────────── */
function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.head.appendChild(s);
  });
}

/* ── Gallery carousel ────────────────────────────────────────────── */
function GalleryCarousel({ urls, name }: { urls: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  if (!urls.length) return null;

  return (
    <div style={{ position:'relative', width:'100%', height:220, background:DARK, overflow:'hidden' }}>
      {urls.map((url, i) => (
        <img key={url} src={url} alt={name}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity: i === idx ? 1 : 0, transition:'opacity 0.4s' }} />
      ))}
      {/* Gradient overlay */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(6,16,30,0.4) 0%, transparent 40%, rgba(6,16,30,0.7) 100%)' }} />

      {/* Dot nav */}
      {urls.length > 1 && (
        <div style={{ position:'absolute', bottom:10, left:0, right:0, display:'flex', justifyContent:'center', gap:5 }}>
          {urls.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              style={{ width: i===idx ? 18 : 7, height:7, borderRadius:4, background: i===idx ? GOLD2 : 'rgba(255,255,255,0.4)', border:'none', cursor:'pointer', padding:0, transition:'all 0.2s' }} />
          ))}
        </div>
      )}

      {/* Prev / Next */}
      {urls.length > 1 && (
        <>
          <button onClick={() => setIdx((i: any) => (i - 1 + urls.length) % urls.length)}
            style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.4)', border:'none', color:'white', borderRadius:20, width:30, height:30, cursor:'pointer', fontSize:16 }}>‹</button>
          <button onClick={() => setIdx((i: any) => (i + 1) % urls.length)}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.4)', border:'none', color:'white', borderRadius:20, width:30, height:30, cursor:'pointer', fontSize:16 }}>›</button>
        </>
      )}
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────────────────── */
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:18, border:'1px solid rgba(200,146,10,0.18)', borderRadius:14, overflow:'hidden' }}>
      <div style={{ background:'rgba(200,146,10,0.08)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:16, height:1, background:GOLD2, opacity:0.7 }} />
          <span style={{ fontSize:13, fontWeight:800, color:GOLD2, fontFamily:"'Playfair Display',serif", letterSpacing:1 }}>{title.toUpperCase()}</span>
          <div style={{ width:16, height:1, background:GOLD2, opacity:0.7 }} />
        </div>
        {action}
      </div>
      <div style={{ padding:'12px 14px' }}>
        {children}
      </div>
    </div>
  );
}

/* Fake temple/dargah/gurudwara/church fallback data with fake UPI IDs
 * (`laxminarayan@upi`, `somnath@upi`, `goldentemple@upi`, ...) previously
 * lived here. Removed — including the variable itself and every call site.
 * If backend is unreachable we render the honest "Place not found" state.
 * If a real seed dataset is needed later, source it from the backend, mark
 * `isVerified: false` by default, and never ship fake UPI handles.
 */

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */

export default function PlaceProfile({ id }: { id: string }) {
  const router = useRouter();

  const [place,    setPlace]    = useState<PlaceDetailDto | null>(null);
  const [reviews,  setReviews]  = useState<ReviewsPageDto | null>(null);
  const [donStats, setDonStats] = useState<DonationStatsDto | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [showReviewModal,   setShowReviewModal]   = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [reviewsPage,       setReviewsPage]       = useState(1);

  /* Load all data on mount */
  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      setLoading(true); setError('');
      try {
        // Parallel: place detail + reviews + donation stats
        const [p, rv, ds] = await Promise.allSettled([
          getPlaceDetail(id, undefined, ac.signal),
          listReviews(id, { page: 1, limit: 5 }, ac.signal),
          getDonationStats(id, ac.signal),
        ]);

        if (p.status === 'fulfilled') {
          setPlace(p.value);
        } else {
          // No local static fallback (previously served fake temple/dargah/
          // gurudwara data with fake UPI IDs — a fraud vector). Try Google
          // Places Detail API for live Google IDs; otherwise honest empty.
          try {
            const gRes  = await fetch(`/api/places/detail?placeId=${encodeURIComponent(id)}`);
            const gData = await gRes.json();
            if (gData?.data) {
              setPlace(gData.data as PlaceDetailDto);
            } else {
              setError('Place not found');
              setLoading(false);
              return;
            }
          } catch {
            setError('Place not found');
            setLoading(false);
            return;
          }
        }

        if (rv.status === 'fulfilled') {
          setReviews(rv.value);
        } else {
          // Honest empty ratings block — do not synthesise counts.
          setReviews({
            reviews: [], total: 0,
            ratingAvg: null,
            ratingCount: 0,
            distribution: { 1:0, 2:0, 3:0, 4:0, 5:0 },
          });
        }
        if (ds.status === 'fulfilled') {
          setDonStats(ds.value);
        } else {
          setDonStats({ totalDonations: 0, totalAmountPaise: 0, recentDonors: [] });
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message ?? 'Failed to load');
      } finally { setLoading(false); }
    }

    load();
    return () => ac.abort();
  }, [id]);

  /* Load more reviews */
  const loadMoreReviews = useCallback(async (page: number) => {
    if (!place) return;
    const rv = await listReviews(id, { page, limit: 5 });
    setReviews((prev: any) => prev ? {
      ...rv,
      reviews: page === 1 ? rv.reviews : [...prev.reviews, ...rv.reviews],
    } : rv);
    setReviewsPage(page);
  }, [id, place]);

  /* ── Loading / error states ──────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight:'100svh', background:DARK, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12, animation:'spin 2s linear infinite' }}>&#9651;</div>
          <p style={{ color:GOLD2, fontSize:13, fontFamily:"'Playfair Display',serif" }}>Loading sacred place...</p>
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      </div>
    );
  }

  if (error || !place) {
    return (
      <div style={{ minHeight:'100svh', background:DARK, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', padding:24 }}>
          <p style={{ color:'rgba(245,230,192,0.5)', fontSize:15, marginBottom:16 }}>{error || 'Place not found'}</p>
          <button onClick={() => router.back()}
            style={{ padding:'10px 24px', borderRadius:30, border:`1.5px solid ${GOLD}`, background:'none', color:GOLD2, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const relKey = TYPE_TO_REL[place.type] ?? 'other';
  const cfg = REL_CONFIG[relKey] ?? REL_CONFIG.other;
  const accent = cfg.color;
  const allPhotos = [
    ...(place.imageUrl ? [place.imageUrl] : []),
    ...place.galleryUrls.filter((u: any) => u !== place.imageUrl),
  ];
  const services = place.services.length > 0
    ? place.services.map((s: any) => s.name)
    : cfg.services;

  const mapsUrl = googleMapsDirectionsUrl(place.lat, place.lng, place.name);

  /* ── Religion-specific icon for nav tabs ── */
  const relIcons: Record<string, string> = {
    hindu:'🪷', muslim:'🕌', sikh:'🛕', christian:'⛪', other:'🏛️',
  };
  const serviceIcon = relIcons[relKey] ?? '✶';

  const heroImg = allPhotos[0] ?? null;

  return (
    <div style={{ background:NAVY, minHeight:'100svh', paddingBottom:90, fontFamily:"'Plus Jakarta Sans',sans-serif", overflowX:'hidden' }}>

      {/* ── Back button ── */}
      <button onClick={() => router.back()}
        style={{ position:'absolute', top:16, left:16, zIndex:20, background:'rgba(6,16,30,0.65)', border:`1px solid rgba(200,146,10,0.4)`, borderRadius:20, padding:'6px 14px', color:GOLD2, fontSize:12, fontWeight:700, cursor:'pointer', backdropFilter:'blur(8px)' }}>
        &#8592; Back
      </button>

      {/* ════════════════════════════════════════════════════════
          HERO — ornate arch frame
          ════════════════════════════════════════════════════════ */}
      <div style={{ position:'relative', height:380, overflow:'hidden' }}>
        {/* Background photo */}
        {heroImg
          ? <img src={heroImg} alt={place.name}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }} />
          : <div style={{ position:'absolute', inset:0, background:`linear-gradient(160deg,${NAVY},${DARK})` }} />
        }
        {/* Dark overlay for readability */}
        <div style={{ position:'absolute', inset:0, background:'rgba(6,16,30,0.38)' }} />

        {/* ── Ornate arch SVG overlay ── */}
        <svg viewBox="0 0 390 380" preserveAspectRatio="none"
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
          <defs>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C8920A" stopOpacity="0.6"/>
              <stop offset="50%" stopColor="#F0C830" stopOpacity="1"/>
              <stop offset="100%" stopColor="#C8920A" stopOpacity="0.6"/>
            </linearGradient>
          </defs>

          {/* Outer arch */}
          <path d="M28,375 L28,175 Q28,30 195,30 Q362,30 362,175 L362,375"
            fill="none" stroke="url(#goldGrad)" strokeWidth="2.5" opacity="0.9"/>
          {/* Inner arch */}
          <path d="M50,375 L50,178 Q50,58 195,58 Q340,58 340,178 L340,375"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.2" opacity="0.55"/>

          {/* ── Top finial ── */}
          <circle cx="195" cy="28" r="8" fill="#E8C050" opacity="0.95"/>
          <circle cx="195" cy="28" r="14" fill="none" stroke="#E8C050" strokeWidth="1.5" opacity="0.65"/>
          <line x1="195" y1="14" x2="195" y2="0" stroke="#E8C050" strokeWidth="1.5" opacity="0.7"/>
          <polygon points="188,14 195,6 202,14" fill="#E8C050" opacity="0.8"/>

          {/* ── Left pillar ── */}
          <rect x="12" y="160" width="16" height="215" rx="3"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.65"/>
          <rect x="8" y="155" width="24" height="12" rx="2"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.7"/>
          <rect x="8" y="368" width="24" height="8" rx="2"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.7"/>
          {/* Left pillar diamonds */}
          <polygon points="20,200 26,210 20,220 14,210" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>
          <polygon points="20,240 26,250 20,260 14,250" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>
          <polygon points="20,280 26,290 20,300 14,290" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>

          {/* ── Right pillar ── */}
          <rect x="362" y="160" width="16" height="215" rx="3"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.65"/>
          <rect x="358" y="155" width="24" height="12" rx="2"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.7"/>
          <rect x="358" y="368" width="24" height="8" rx="2"
            fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.7"/>
          {/* Right pillar diamonds */}
          <polygon points="370,200 376,210 370,220 364,210" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>
          <polygon points="370,240 376,250 370,260 364,250" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>
          <polygon points="370,280 376,290 370,300 364,290" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.55"/>

          {/* ── Left hanging lantern ── */}
          <line x1="88" y1="30" x2="88" y2="72" stroke="#E8C050" strokeWidth="1.5" opacity="0.75"/>
          <ellipse cx="88" cy="86" rx="12" ry="18" fill="rgba(200,146,10,0.18)" stroke="#E8C050" strokeWidth="1.5" opacity="0.85"/>
          <ellipse cx="88" cy="79" rx="10" ry="5" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>
          <line x1="84" y1="104" x2="88" y2="110" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>
          <line x1="92" y1="104" x2="88" y2="110" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>

          {/* ── Right hanging lantern ── */}
          <line x1="302" y1="30" x2="302" y2="72" stroke="#E8C050" strokeWidth="1.5" opacity="0.75"/>
          <ellipse cx="302" cy="86" rx="12" ry="18" fill="rgba(200,146,10,0.18)" stroke="#E8C050" strokeWidth="1.5" opacity="0.85"/>
          <ellipse cx="302" cy="79" rx="10" ry="5" fill="none" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>
          <line x1="298" y1="104" x2="302" y2="110" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>
          <line x1="306" y1="104" x2="302" y2="110" stroke="#E8C050" strokeWidth="1" opacity="0.6"/>

          {/* ── Decorative corner rosettes ── */}
          <circle cx="60" cy="175" r="5" fill="none" stroke="#E8C050" strokeWidth="1.2" opacity="0.5"/>
          <circle cx="60" cy="175" r="2" fill="#E8C050" opacity="0.5"/>
          <circle cx="330" cy="175" r="5" fill="none" stroke="#E8C050" strokeWidth="1.2" opacity="0.5"/>
          <circle cx="330" cy="175" r="2" fill="#E8C050" opacity="0.5"/>

          {/* ── Bottom arch edge decorations ── */}
          <line x1="28" y1="370" x2="362" y2="370" stroke="url(#goldGrad)" strokeWidth="1.5" opacity="0.6"/>
          <circle cx="195" cy="370" r="4" fill="#E8C050" opacity="0.7"/>
          <circle cx="110" cy="370" r="2.5" fill="#E8C050" opacity="0.5"/>
          <circle cx="280" cy="370" r="2.5" fill="#E8C050" opacity="0.5"/>
        </svg>

        {/* Bottom fade to navy */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:100,
          background:`linear-gradient(to bottom, transparent, ${NAVY})` }} />
      </div>

      {/* ════════════════════════════════════════════════════════
          NAME + RATING
          ════════════════════════════════════════════════════════ */}
      <div style={{ textAlign:'center', padding:'4px 24px 0', marginTop:-20, position:'relative', zIndex:2 }}>
        <h1 style={{ margin:'0 0 8px', fontSize:26, fontWeight:800, color:PARCH,
          fontFamily:"'Playfair Display',Georgia,serif", letterSpacing:0.5, lineHeight:1.2, textShadow:'0 2px 12px rgba(0,0,0,0.5)' }}>
          {place.name}
        </h1>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:10 }}>
          <Stars avg={place.ratingAvg} size={16} />
          {place.ratingAvg != null && (
            <span style={{ fontSize:15, color:GOLD2, fontWeight:800 }}>{Number(place.ratingAvg).toFixed(1)}</span>
          )}
          <Stars avg={place.ratingAvg} size={16} />
          {place.isVerified && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.4)', borderRadius:20, padding:'3px 10px', fontSize:11, color:'#60A5FA', fontWeight:700 }}>
              ✓ Verified
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          QUICK NAV TABS
          ════════════════════════════════════════════════════════ */}
      <div style={{ margin:'12px 16px', display:'flex',
        background:'rgba(10,22,40,0.95)', border:`1.5px solid rgba(200,146,10,0.45)`,
        borderRadius:14, overflow:'hidden' }}>
        {[
          { icon:'🤲', label:'Donation', onClick: () => place.donationEnabled && setShowDonationModal(true) },
          { icon:'📅', label:'Events',   onClick: () => {} },
          { icon: serviceIcon, label:'Services', onClick: () => {} },
          { icon:'📍', label:'Location', onClick: () => window.open(mapsUrl,'_blank') },
        ].map((tab, i, arr) => (
          <button key={tab.label} onClick={tab.onClick}
            style={{ flex:1, padding:'12px 4px', background:'transparent', border:'none',
              borderRight: i < arr.length - 1 ? '1px solid rgba(200,146,10,0.25)' : 'none',
              cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:20 }}>{tab.icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color:GOLD2, letterSpacing:0.5 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          DONATE BUTTON
          ════════════════════════════════════════════════════════ */}
      {place.donationEnabled && (
        <div style={{ margin:'0 16px 16px' }}>
          <button onClick={() => setShowDonationModal(true)}
            style={{ width:'100%', padding:'15px', borderRadius:50,
              background:`linear-gradient(135deg, #B8780A 0%, #E8C050 35%, #F0D060 50%, #E8C050 65%, #B8780A 100%)`,
              border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              boxShadow:'0 4px 20px rgba(200,146,10,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
              position:'relative', overflow:'hidden' }}>
            {/* decorative dots */}
            <span style={{ position:'absolute', left:20, fontSize:14, opacity:0.6 }}>✦</span>
            <span style={{ position:'absolute', right:20, fontSize:14, opacity:0.6 }}>✦</span>
            <span style={{ fontSize:22 }}>{cfg.donateSymbol}</span>
            <span style={{ fontSize:17, fontWeight:800, color:DARK, fontFamily:"'Playfair Display',serif", letterSpacing:1 }}>
              Donate
            </span>
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          UPCOMING EVENTS
          ════════════════════════════════════════════════════════ */}
      {place.upcomingEvents.length > 0 && (
        <div style={{ margin:'0 16px 14px' }}>
          {/* Section header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:GOLD2, opacity:0.7 }}>⟵</span>
              <h2 style={{ margin:0, fontSize:14, fontWeight:800, color:GOLD2, letterSpacing:0.8,
                textTransform:'uppercase', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                Upcoming Events
              </h2>
              <span style={{ fontSize:11, color:GOLD2, opacity:0.7 }}>⟶</span>
            </div>
            <span style={{ fontSize:18, color:GOLD, opacity:0.7 }}>›</span>
          </div>

          {/* Events card */}
          <div style={{ background:'rgba(8,18,35,0.95)', border:`1.5px solid rgba(200,146,10,0.35)`,
            borderRadius:16, overflow:'hidden' }}>
            {place.upcomingEvents.slice(0,3).map((ev: any, i: any) => {
              const d = new Date(ev.startTime);
              const mon = d.toLocaleString('en-IN', { month:'short' }).toUpperCase();
              const day = d.getDate();
              const weekday = d.toLocaleString('en-IN', { weekday:'long' });
              const date = d.toLocaleDateString('en-IN', { month:'long', day:'numeric' });
              const time = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
              return (
                <div key={ev.id}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                    borderBottom: i < Math.min(place.upcomingEvents.length, 3) - 1
                      ? '1px solid rgba(200,146,10,0.12)' : 'none' }}>
                  {/* Date badge */}
                  <div style={{ minWidth:48, textAlign:'center', background:`rgba(200,146,10,0.15)`,
                    border:`1px solid rgba(200,146,10,0.35)`, borderRadius:10, padding:'6px 4px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:GOLD, letterSpacing:1 }}>{mon}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:PARCH, lineHeight:1 }}>{day}</div>
                  </div>
                  {/* Event info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:PARCH, marginBottom:3,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {ev.title}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(245,230,192,0.55)' }}>
                      <span>📅</span>
                      <span>{weekday}, {date} • {time}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:18, color:'rgba(200,146,10,0.5)', flexShrink:0 }}>›</span>
                </div>
              );
            })}
            {place.upcomingEvents.length > 0 && (
              <div style={{ padding:'10px', textAlign:'center', borderTop:'1px solid rgba(200,146,10,0.12)' }}>
                <span style={{ fontSize:12, color:GOLD2, fontWeight:700, cursor:'pointer' }}>
                  View All Events ›
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SERVICES
          ════════════════════════════════════════════════════════ */}
      {services.length > 0 && (
        <div style={{ margin:'0 16px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:GOLD2, opacity:0.7 }}>⟵</span>
              <h2 style={{ margin:0, fontSize:14, fontWeight:800, color:GOLD2, letterSpacing:0.8,
                textTransform:'uppercase', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                Services
              </h2>
              <span style={{ fontSize:11, color:GOLD2, opacity:0.7 }}>⟶</span>
            </div>
            <span style={{ fontSize:18, color:GOLD, opacity:0.7 }}>›</span>
          </div>

          <div style={{ background:'rgba(8,18,35,0.95)', border:`1.5px solid rgba(200,146,10,0.35)`,
            borderRadius:16, overflow:'hidden' }}>
            {services.slice(0,4).map((s: any, i: any) => (
              <div key={i}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px',
                  borderBottom: i < Math.min(services.length, 4) - 1
                    ? '1px solid rgba(200,146,10,0.12)' : 'none' }}>
                <div style={{ width:22, height:22, borderRadius:6, border:`1.5px solid ${GOLD}`,
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, color:GOLD, fontWeight:800 }}>✓</span>
                </div>
                <span style={{ flex:1, fontSize:14, fontWeight:600, color:'rgba(245,230,192,0.85)' }}>{s}</span>
                <span style={{ fontSize:18, color:'rgba(200,146,10,0.5)' }}>›</span>
              </div>
            ))}
            {services.length > 0 && (
              <div style={{ padding:'10px', textAlign:'center', borderTop:'1px solid rgba(200,146,10,0.12)' }}>
                <span style={{ fontSize:12, color:GOLD2, fontWeight:700, cursor:'pointer' }}>
                  View All Services ›
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          LOCATION
          ════════════════════════════════════════════════════════ */}
      <div style={{ margin:'0 16px 20px' }}>
        <h2 style={{ margin:'0 0 8px', fontSize:14, fontWeight:800, color:GOLD2, letterSpacing:0.8,
          textTransform:'uppercase', display:'flex', alignItems:'center', gap:6 }}>
          <span>📍</span> Location
        </h2>

        <div style={{ background:'rgba(8,18,35,0.95)', border:`1.5px solid rgba(200,146,10,0.35)`,
          borderRadius:16, overflow:'hidden' }}>
          {/* Google Maps embed — F4: graceful fallback when key is missing */}
          {(() => {
            const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
            if (mapsKey && place?.lat && place?.lng) {
              return (
                <iframe
                  title="Location map"
                  width="100%"
                  height="220"
                  style={{ border: 0, borderRadius: 12, display: 'block' }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${place.lat},${place.lng}&zoom=15`}
                />
              );
            }
            if (mapsKey && place?.address) {
              return (
                <iframe
                  title="Location map"
                  width="100%"
                  height="220"
                  style={{ border: 0, borderRadius: 12, display: 'block' }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(place.address)}&zoom=15`}
                />
              );
            }
            return (
              <div style={{ height: 140, background: '#f0ebe0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B7355', fontSize: 14, gap: 8 }}>
                <span>&#128205;</span> {place?.address ?? 'Location not available'}
              </div>
              );
          })()}

          {/* Address + directions */}
          {place.address && (
            <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:8,
              borderBottom:'1px solid rgba(200,146,10,0.12)' }}>
              <span style={{ fontSize:16, flexShrink:0 }}>📍</span>
              <span style={{ fontSize:13, color:'rgba(245,230,192,0.75)', lineHeight:1.4 }}>{place.address}</span>
            </div>
          )}
          <button onClick={() => window.open(mapsUrl, '_blank')}
            style={{ width:'100%', padding:'14px', background:'rgba(10,22,40,0.8)', border:'none',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              fontSize:14, fontWeight:700, color:PARCH }}>
            <span style={{ fontSize:16 }}>→</span>
            Get Directions
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          ABOUT (if description)
          ════════════════════════════════════════════════════════ */}
      {place.description && (
        <div style={{ margin:'0 16px 14px', background:'rgba(8,18,35,0.95)',
          border:`1.5px solid rgba(200,146,10,0.3)`, borderRadius:16, padding:'14px 16px' }}>
          <h2 style={{ margin:'0 0 8px', fontSize:13, fontWeight:800, color:GOLD, letterSpacing:1, textTransform:'uppercase' }}>About</h2>
          <p style={{ margin:0, fontSize:13, color:'rgba(245,230,192,0.72)', lineHeight:1.7 }}>{place.description}</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          REVIEWS
          ════════════════════════════════════════════════════════ */}
      <div style={{ margin:'0 16px 14px', background:'rgba(8,18,35,0.95)',
        border:`1.5px solid rgba(200,146,10,0.3)`, borderRadius:16, padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h2 style={{ margin:0, fontSize:14, fontWeight:800, color:GOLD2, letterSpacing:0.8, textTransform:'uppercase' }}>Reviews</h2>
          <button onClick={() => setShowReviewModal(true)}
            style={{ background:'transparent', border:`1px solid rgba(200,146,10,0.4)`, borderRadius:20,
              padding:'4px 14px', fontSize:11, color:GOLD, cursor:'pointer', fontWeight:700 }}>
            + Write
          </button>
        </div>
        {reviews && reviews.ratingAvg != null && (
          <div style={{ display:'flex', gap:16, marginBottom:14, alignItems:'center' }}>
            <div style={{ textAlign:'center', minWidth:56 }}>
              <div style={{ fontSize:38, fontWeight:900, color:PARCH, lineHeight:1 }}>{Number(reviews.ratingAvg).toFixed(1)}</div>
              <Stars avg={reviews.ratingAvg} size={12} />
              <div style={{ fontSize:10, color:'rgba(245,230,192,0.4)', marginTop:3 }}>{reviews.ratingCount.toLocaleString()}</div>
            </div>
            <div style={{ flex:1 }}>
              {([5,4,3,2,1] as const).map(star => (
                <RatingBar key={star} star={star} count={reviews.distribution[star]} total={reviews.ratingCount} />
              ))}
            </div>
          </div>
        )}
        {reviews && reviews.reviews.length > 0 ? (
          <>
            {reviews.reviews.map((r: any) => <ReviewCard key={r.id} review={r} />)}
            {reviews.total > reviews.reviews.length && (
              <button onClick={() => loadMoreReviews(reviewsPage + 1)}
                style={{ width:'100%', marginTop:8, background:'transparent', border:`1px solid rgba(200,146,10,0.3)`,
                  borderRadius:10, padding:'8px', fontSize:12, color:GOLD2, cursor:'pointer', fontWeight:600 }}>
                Load more reviews
              </button>
            )}
          </>
        ) : (
          <p style={{ fontSize:12, color:'rgba(245,230,192,0.3)', textAlign:'center', margin:'8px 0' }}>
            No reviews yet — be the first!
          </p>
        )}
      </div>

      {/* ── Modals ── */}
      {showReviewModal && (
        <WriteReviewModal
          placeId={id}
          onClose={() => setShowReviewModal(false)}
          onSubmit={(r) => {
            setReviews((prev: any) => prev ? { ...prev, reviews:[r,...prev.reviews], total:prev.total+1 } : prev);
            setShowReviewModal(false);
          }}
        />
      )}
      {showDonationModal && place && (
        <DonationModal place={place} onClose={() => setShowDonationModal(false)} />
      )}
    </div>
  );
}
