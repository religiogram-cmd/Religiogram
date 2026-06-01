'use client';

import React, { useState, useEffect } from 'react';
import { tokenStore, apiFetch } from '@/lib/api';
import { formatINR } from '@/lib/format-currency';
import { previewBookingPrice } from '@/lib/bookings-api';

/** Returns true when the server signals the request was already processed. */
function isIdempotencyConflict(res: Response): boolean {
  return res.status === 422;
}

/** Inline info card explaining the cancellation refund tiers. */
function RefundTierExplainer() {
  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <span style={{ color: '#92400E', fontWeight: 700, fontSize: 13 }}>Cancellation Policy</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        <li style={{ color: '#B45309', fontSize: 12, padding: '2px 0' }}>• Cancel 24+ hours before: Full refund to wallet</li>
        <li style={{ color: '#B45309', fontSize: 12, padding: '2px 0' }}>• Cancel 2–24 hours before: 50% refund to wallet</li>
        <li style={{ color: '#B45309', fontSize: 12, padding: '2px 0' }}>• Cancel within 2 hours or no-show: No refund</li>
        <li style={{ color: '#B45309', fontSize: 12, padding: '2px 0' }}>• Refunds credited to your Religiogram wallet within minutes</li>
      </ul>
    </div>
  );
}

const NAVY  = '#1B2A5C';
const GOLD  = '#C8920A';
const PARCH = '#FFFBF0';
const WHITE = '#FFFFFF';
const GREY  = '#9CA3AF';

interface Props {
  providerId: string;
  serviceId?: string;
  providerName?: string;
  onBack: () => void;
  onComplete: (bookingId: string) => void;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MORNING    = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM'];
const AFTERNOON  = ['12:00 PM','2:00 PM','3:00 PM','4:00 PM'];
// AWAITING removed — Step 3 now uses real API slots

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }

export default function BookingCheckoutFlow({ providerId: _pid, serviceId, providerName, onBack, onComplete }: Props) {
  const [step, setStep]             = useState(serviceId ? 2 : 1);
  const [selSvc, setSelSvc]         = useState(serviceId ?? '');
  const [services, setServices]     = useState<any[]>([]);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string>('');
  const now = new Date();
  const [yr,  setYr]                = useState(now.getFullYear());
  const [mo,  setMo]                = useState(now.getMonth());
  const [day, setDay]               = useState<number | null>(null);
  const [slot, setSlot]             = useState('');
  const [addr,  setAddr]            = useState('');
  const [floor, setFloor]           = useState('');
  const [samagri,    setSamagri]    = useState(false);
  const [hindi,      setHindi]      = useState(false);
  const [outdoor,    setOutdoor]    = useState(false);
  const [large,      setLarge]      = useState(false);
  const [extra,      setExtra]      = useState('');
  const [promo,      setPromo]      = useState('');
  const [pay,        setPay]        = useState<'wallet'|'upi'>('upi');
  const [confirming, setConfirming] = useState(false);
  const submittingRef = React.useRef(false); // double-submit guard
  const [bookingId, setBookingId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<{date: string, times: string[]}[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasReviewed, setHasReviewed] = useState(false);

  const svc      = services.find((s: any) => s.id === selSvc);
  const base     = svc?.price ?? 2500;
  const samAmt   = samagri ? 500 : 0;
  const platFee  = Math.round(base * 0.03);
  const gst      = Math.round(platFee * 0.18 * 100) / 100;
  const localTotal = base + samAmt + platFee + gst;
  // Server-computed authoritative total (in rupees). Falls back to the
  // local estimate while loading or when the preview endpoint is
  // unavailable.
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const total   = previewTotal ?? localTotal;
  const [walBal, setWalBal] = useState(0);
  const walOk    = walBal >= total;

  // Load services from catalog API
  useEffect(() => {
    if (!_pid) return;
    fetch(`/catalog/services?providerId=${_pid}`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` }
    })
      .then(r => r.json())
      .then(data => setServices(data.items ?? data ?? []))
      .catch(() => setServices([]));
  }, [_pid]);

  // Fetch a server-side price quote whenever the user has chosen enough to
  // produce one (service + day + slot). Falls back silently to the local
  // estimate on any error so the checkout never blocks.
  useEffect(() => {
    if (!selSvc || !day || !slot) { setPreviewTotal(null); return; }
    // Build an ISO scheduledAt from the picked year/month/day + slot label.
    const m = slot.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (!m) return;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (/PM/i.test(m[3]) && hh < 12) hh += 12;
    if (/AM/i.test(m[3]) && hh === 12) hh = 0;
    const scheduledAt = new Date(yr, mo, day, hh, mm).toISOString();

    let cancelled = false;
    previewBookingPrice({ serviceId: selSvc, scheduledAt })
      .then(p => { if (!cancelled) setPreviewTotal(Math.round(p.totalPaise / 100)); })
      .catch(() => { if (!cancelled) setPreviewTotal(null); });
    return () => { cancelled = true; };
  }, [selSvc, yr, mo, day, slot]);

  // Load wallet balance on mount
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '';
    const token = tokenStore.access ?? '';
    fetch(`${base}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance != null) setWalBal(Math.round(d.balance / 100)); })
      .catch(() => {});
  }, []);

  // Pre-fill address from user profile
  useEffect(() => {
    apiFetch<{ address?: string; city?: string }>('/users/me', { auth: true })
      .then(user => {
        if (user.address) setAddr(user.address);
      })
      .catch(() => {});
  }, []);

  // F2: Fetch real availability slots when date changes
  useEffect(() => {
    if (!day || !_pid) return;
    setLoadingSlots(true);
    const dateStr = new Date(yr, mo, day).toISOString().split('T')[0];
    fetch(`/availability/${_pid}/slots?date=${dateStr}`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` }
    })
      .then(r => r.ok ? r.json() : { slots: [] })
      .then(data => setAvailableSlots(data.slots ?? []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [day, yr, mo, _pid]);

  function avail(d: number) {
    const dt  = new Date(yr, mo, d);
    const dow = dt.getDay();
    const past = dt < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return !past && [0, 1, 4, 6].includes(dow);
  }
  function nextAvail() {
    for (let d = now.getDate(); d <= daysInMonth(yr, mo); d++) if (avail(d)) return d;
    return null;
  }

  async function next() {
    if (step < 6) { setStep((s: any) => s + 1); return; }
    // Double-submit guard: if a booking request is already in-flight, ignore.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setConfirming(true); setStep(7);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const token = tokenStore.access ?? '';
      const scheduledAt = day ? new Date(yr, mo, day, parseInt((slot || '10:00').split(':')[0]), 0).toISOString() : new Date().toISOString();
      const res = await fetch(`${base}/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: _pid,
          serviceId: selSvc,
          scheduledAt,
          paymentMethod: pay,
          promoCode: promo || undefined,
          addSamagri: samagri,
        }),
      });
      if (isIdempotencyConflict(res)) {
        // 422 — this request was already processed; surface a friendly message
        submittingRef.current = false;
        setConfirming(false);
        setError('This request was already processed. Please refresh to see the latest status.');
        setStep(6); // return to summary so user sees the error
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.status) setBookingStatus(data.status as string);
        const bId = data.id ?? data.bookingId ?? '';
        setBookingId(bId);
        setConfirmedBookingId(bId);
        submittingRef.current = false;
        setConfirming(false);
        onComplete(bId || 'confirmed');
        return;
      }
    } catch { }
    submittingRef.current = false;
    setConfirming(false);
  }
  function back() { if (step > 1) setStep((s: any) => s - 1); else onBack(); }

  // F5: Submit review after completion
  const submitReview = async () => {
    await fetch('/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.access ?? ''}` },
      body: JSON.stringify({ targetId: _pid, targetType: 'provider', rating, body: reviewText, bookingId: confirmedBookingId })
    });
    setHasReviewed(true);
  };

  // F6: Razorpay payment handler
  const handleRazorpayPayment = async (bookingId: string, orderId: string, amountPaise: number) => {
    return new Promise<void>((resolve, reject) => {
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
        amount: amountPaise,
        currency: 'INR',
        order_id: orderId,
        name: 'ReligioGram',
        description: 'Service Booking',
        handler: async (response: any) => {
          await fetch('/payments/verify-razorpay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.access ?? ''}` },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId
            })
          });
          resolve();
        },
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    });
  };

  // F6: Load Razorpay SDK dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, []);

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1.5px solid #ddd',
    borderRadius: 10, padding: 12, fontSize: 14, color: NAVY, background: WHITE, outline: 'none',
  };
  const card: React.CSSProperties = { background: WHITE, borderRadius: 14, padding: 16, marginBottom: 12 };
  const btnG: React.CSSProperties = { width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: GOLD, color: WHITE, fontWeight: 700, fontSize: 15, cursor: 'pointer' };
  const btnO: React.CSSProperties = { width: '100%', padding: '14px 0', borderRadius: 12, border: '1.5px solid ' + GOLD, background: 'transparent', color: GOLD, fontWeight: 700, fontSize: 15, cursor: 'pointer' };

  const stepLabels = ['Select Service','Choose Date','Pick Time','Your Location','Requirements','Price Summary','Confirmation'];

  return (
    <div style={{ background: PARCH, minHeight: '100vh', fontFamily: 'system-ui,sans-serif' }}>
      {/* HEADER */}
      <div style={{ background: WHITE, padding: '52px 16px 12px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button onClick={back} style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'<'}</button>
          <div>
            <h1 style={{ color: NAVY, fontWeight: 700, fontSize: 16, margin: 0 }}>{stepLabels[step - 1]}</h1>
            <p style={{ color: GREY, fontSize: 12, margin: 0 }}>Step {step} of 7</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} style={{ width: i + 1 === step ? 20 : 8, height: 8, borderRadius: 4, background: i + 1 <= step ? GOLD : '#ddd', transition: 'all 0.2s' }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 14px 80px' }}>

        {/* 422 / idempotency error banner */}
        {error && (
          <div style={{ background: '#FFF3E0', border: '1.5px solid #FFB74D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>&#9888;&#xFE0F;</span>
            <div>
              <p style={{ color: '#E65100', fontWeight: 700, fontSize: 13, margin: 0 }}>Request Already Processed</p>
              <p style={{ color: '#BF360C', fontSize: 12, margin: '3px 0 0' }}>{error}</p>
            </div>
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#E65100', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>&#x2715;</button>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <p style={{ color: GREY, fontSize: 13, marginBottom: 12 }}>Choose the service you need</p>
            {services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: GREY, fontSize: 13 }}>Loading services...</div>
            ) : services.map((s: any) => (
              <button key={s.id} onClick={() => setSelSvc(s.id)} style={{ width: '100%', textAlign: 'left', background: WHITE, border: '2px solid ' + (selSvc === s.id ? GOLD : '#eee'), borderRadius: 14, padding: 14, marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: NAVY, fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                  <div style={{ color: GREY, fontSize: 12, marginTop: 3 }}>{s.duration}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{formatINR(s.price * 100)}</div>
                  {selSvc === s.id && <div style={{ color: GOLD, fontSize: 18 }}>✓</div>}
                </div>
              </button>
            ))}
            <button disabled={!selSvc} onClick={next} style={{ ...btnG, opacity: selSvc ? 1 : 0.5, marginTop: 8 }}>Continue</button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button onClick={() => { if (mo === 0) { setMo(11); setYr((y: any) => y - 1); } else setMo((m: any) => m - 1); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: NAVY }}>{'<'}</button>
                <span style={{ color: NAVY, fontWeight: 700, fontSize: 15 }}>{MONTHS[mo]} {yr}</span>
                <button onClick={() => { if (mo === 11) { setMo(0); setYr((y: any) => y + 1); } else setMo((m: any) => m + 1); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: NAVY }}>{'>'}</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', gap: 4, marginBottom: 6 }}>
                {DAYS.map(d => <span key={d} style={{ color: GREY, fontSize: 11, fontWeight: 600 }}>{d}</span>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {Array.from({ length: firstDay(yr, mo) }, (_, i) => <div key={'e' + i} />)}
                {Array.from({ length: daysInMonth(yr, mo) }, (_, i) => {
                  const d = i + 1, av = avail(d), sel = day === d;
                  return (
                    <button key={d} disabled={!av} onClick={() => setDay(d)} style={{ aspectRatio: '1', borderRadius: '50%', border: 'none', background: sel ? GOLD : av ? WHITE : 'transparent', color: sel ? WHITE : av ? NAVY : GREY, fontWeight: sel ? 700 : 400, fontSize: 13, cursor: av ? 'pointer' : 'default', textDecoration: av ? 'none' : 'line-through', opacity: av ? 1 : 0.4, boxShadow: av && !sel ? '0 0 0 1.5px #eee' : 'none' }}>{d}</button>
                  );
                })}
              </div>
              {nextAvail() && (
                <div style={{ marginTop: 12 }}>
                  <span style={{ background: '#F0FFF4', color: '#2E7D32', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20 }}>
                    Next available: {MONTHS[mo].slice(0, 3)} {nextAvail()}
                  </span>
                </div>
              )}
            </div>
            <button disabled={!day} onClick={next} style={{ ...btnG, opacity: day ? 1 : 0.5 }}>Continue</button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            {loadingSlots ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: GREY, fontSize: 13 }}>Loading available times...</div>
            ) : (() => {
              // Merge API slots with static fallback if API returned nothing
              const allTimes: string[] = availableSlots.length > 0
                ? availableSlots.flatMap(s => s.times)
                : [...MORNING, ...AFTERNOON];
              if (allTimes.length === 0) {
                return <div style={{ textAlign: 'center', padding: '32px 0', color: GREY, fontSize: 13 }}>No slots available for this date.</div>;
              }
              return (
                <div style={card}>
                  <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Available Times</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {allTimes.map(s => {
                      const sel = slot === s;
                      return (
                        <button key={s} onClick={() => setSlot(s)} style={{ border: '2px solid ' + (sel ? GOLD : '#eee'), background: sel ? GOLD : WHITE, color: sel ? WHITE : NAVY, borderRadius: 10, padding: '10px 4px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                          <div>{s}</div>
                          <div style={{ fontSize: 9, marginTop: 3, color: sel ? 'rgba(255,255,255,0.8)' : '#2E7D32', fontWeight: 500 }}>Instant ✓</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <button disabled={!slot} onClick={next} style={{ ...btnG, opacity: slot ? 1 : 0.5 }}>Continue</button>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <div style={card}>
              <label style={{ color: NAVY, fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Address</label>
              <input style={{ ...inp, marginBottom: 12 }} value={addr} onChange={e => setAddr(e.target.value)} placeholder="Enter booking address..." required />
              <label style={{ color: NAVY, fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Floor / Additional notes</label>
              <input style={{ ...inp, marginBottom: 12 }} value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. Floor 2, Ring the bell" />
              <label style={{ color: NAVY, fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>City</label>
              <input style={{ ...inp, marginBottom: 12 }} placeholder="Your city" value={addr ? addr.split(',').pop()?.trim() ?? '' : ''} readOnly />
              <div style={{ background: NAVY, borderRadius: 12, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <span style={{ color: GOLD, fontSize: 15, fontWeight: 600 }}>&#128205; Location pinned</span>
              </div>
              <div style={{ background: '#F0FFF4', borderRadius: 8, padding: '8px 12px', color: '#2E7D32', fontSize: 13 }}>
                Travel fee estimate: <strong>&#8377;0 (within 20km)</strong>
              </div>
            </div>
            <button onClick={next} style={btnG}>Continue</button>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div>
            <div style={card}>
              <h2 style={{ color: NAVY, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Special Requirements</h2>
              {[
                { label: 'Samagri/materials included (adds \u20b9500)', v: samagri,  fn: setSamagri },
                { label: 'Language: Hindi preferred',                   v: hindi,    fn: setHindi },
                { label: 'Outdoor ceremony',                            v: outdoor,  fn: setOutdoor },
                { label: 'Large gathering (15+ people)',                v: large,    fn: setLarge },
              ].map(item => (
                <label key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={item.v} onChange={e => item.fn(e.target.checked)} style={{ width: 18, height: 18, accentColor: GOLD }} />
                  <span style={{ color: NAVY, fontSize: 13 }}>{item.label}</span>
                </label>
              ))}
              <label style={{ color: NAVY, fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Any additional requests</label>
              <textarea rows={4} maxLength={250} value={extra} onChange={e => setExtra(e.target.value)} placeholder="Any additional requests... (250 chars)" style={{ ...inp, resize: 'none' } as React.CSSProperties} />
              <p style={{ color: GREY, fontSize: 11, textAlign: 'right', marginTop: 4 }}>{extra.length}/250</p>
            </div>
            <button onClick={next} style={btnG}>Continue</button>
          </div>
        )}

        {/* STEP 6 */}
        {step === 6 && (
          <div>
            <div style={card}>
              <h2 style={{ color: NAVY, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Price Summary</h2>
              {[
                { label: 'Base service fee',             amt: base },
                ...(samagri ? [{ label: 'Samagri kit', amt: samAmt }] : []),
                { label: 'Travel fee',                   amt: 0 },
                { label: 'Platform service charge (3%)', amt: platFee },
                { label: 'GST (on platform fee)',        amt: gst },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f0e8' }}>
                  <span style={{ color: '#555', fontSize: 13 }}>{row.label}</span>
                  <span style={{ color: NAVY, fontSize: 13 }}>{row.amt === 0 ? 'Free' : formatINR(row.amt * 100)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', borderTop: '2px solid ' + GOLD, marginTop: 8 }}>
                <span style={{ color: NAVY, fontWeight: 700, fontSize: 15 }}>TOTAL</span>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 20 }}>{formatINR(total * 100)}</span>
              </div>
            </div>
            <div style={card}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inp, flex: 1 }} value={promo} onChange={e => setPromo(e.target.value)} placeholder="Promo code" />
                <button style={{ background: NAVY, color: WHITE, border: 'none', borderRadius: 10, padding: '0 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Apply</button>
              </div>
              <p style={{ color: '#2E7D32', fontSize: 11, marginTop: 6 }}>✓ No hidden charges</p>
            </div>
            <div style={card}>
              <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Payment Method</h3>
              {[
                { id: 'wallet', label: `Wallet (${formatINR(walBal * 100)} balance)`, badge: walOk ? '✓ Sufficient' : '✗ Insufficient', ok: walOk },
                { id: 'upi',   label: 'Pay via UPI / Card', badge: '', ok: true },
              ].map(opt => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                  <input type="radio" name="pay" checked={pay === opt.id} onChange={() => setPay(opt.id as 'wallet'|'upi')} style={{ accentColor: GOLD, width: 16, height: 16 }} />
                  <span style={{ color: NAVY, fontSize: 13, flex: 1 }}>{opt.label}</span>
                  {opt.badge && <span style={{ fontSize: 11, fontWeight: 600, color: opt.ok ? '#2E7D32' : '#C62828' }}>{opt.badge}</span>}
                </label>
              ))}
            </div>
            <RefundTierExplainer />
            <button onClick={next} style={btnG}>Confirm Booking</button>
          </div>
        )}

        {/* STEP 7 */}
        {step === 7 && (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            {confirming ? (
              <div>
                <div style={{ width: 60, height: 60, borderRadius: '50%', border: '4px solid ' + GOLD, borderTopColor: 'transparent', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <p style={{ color: NAVY, fontSize: 15 }}>Processing...</p>
              </div>
            ) : (
              <div>
                <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}`}</style>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F5E9', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 1.5s ease-in-out' }}>
                  <span style={{ color: '#2E7D32', fontSize: 36 }}>✓</span>
                </div>
                <h1 style={{ color: NAVY, fontWeight: 700, fontSize: 22, margin: '0 0 8px' }}>Booking Confirmed!</h1>
                <div style={{ background: '#F5F0E8', borderRadius: 10, display: 'inline-block', padding: '6px 16px', marginBottom: 12 }}>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{confirmedBookingId || bookingId || 'Booking Confirmed'}</span>
                </div>

                {/* Partial-refund status chip — shown when booking has been partially refunded */}
                {(bookingStatus === 'PARTIALLY_REFUNDED' || bookingStatus === 'partial_refund') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#FFF8E1', border: '1.5px solid #FFD54F', borderRadius: 20, padding: '6px 14px', marginBottom: 16, width: 'fit-content', margin: '0 auto 16px' }}>
                    <span style={{ fontSize: 16 }}>&#x21A9;&#xFE0F;</span>
                    <span style={{ color: '#7B5800', fontWeight: 700, fontSize: 13 }}>Partial Refund Issued</span>
                    <span style={{ color: '#A07000', fontSize: 12 }}>{formatINR(Math.round(total * 0.5) * 100)} credited to wallet</span>
                  </div>
                )}
                <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
                  {[
                    { label: 'Provider', value: providerName ?? 'Service Provider' },
                    { label: 'Date',     value: day ? day + ' ' + MONTHS[mo] + ', ' + yr : 'TBD' },
                    { label: 'Time',     value: slot || 'TBD' },
                  ].map((r, i, a) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < a.length - 1 ? '1px solid #f5f0e8' : 'none' }}>
                      <span style={{ color: '#666', fontSize: 13 }}>{r.label}</span>
                      <span style={{ color: NAVY, fontWeight: 600, fontSize: 13 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                <button style={{ ...btnO, marginBottom: 12 }}>+ Add to Calendar</button>
                <button onClick={() => onComplete(bookingId ?? 'confirmed')} style={{ ...btnG, marginBottom: 12 }}>View Booking Details</button>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: GREY, fontSize: 13, cursor: 'pointer' }}>Back to Home</button>
                {/* F5: Post-booking review prompt for completed bookings */}
                {bookingStatus === 'completed' && !hasReviewed && (
                  <div style={{ marginTop: 24, padding: 16, background: '#faf7f0', borderRadius: 12, textAlign: 'left' }}>
                    <p style={{ fontWeight: 600, marginBottom: 12, color: NAVY }}>How was your experience?</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[1,2,3,4,5].map(star => (
                        <button key={star} onClick={() => setRating(star)}
                          style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer',
                                   color: rating >= star ? '#D4AF37' : '#ccc' }}>&#9733;</button>
                      ))}
                    </div>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
                      placeholder='Tell others about your experience (optional)'
                      style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' as const, resize: 'none' as const }} />
                    <button onClick={submitReview} style={{ marginTop: 12, width: '100%', padding: '12px 0',
                      background: NAVY, color: WHITE, borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Submit Review
                    </button>
                  </div>
                )}
                {hasReviewed && (
                  <div style={{ marginTop: 16, padding: 12, background: '#E8F5E9', borderRadius: 10, color: '#2E7D32', fontWeight: 600, fontSize: 13 }}>
                    Thanks for your review!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
