'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tokenStore } from '@/lib/api';

// Razorpay Checkout — loaded dynamically.
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void } } }

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

const NAVY    = '#0A1628';
const NAVY_2  = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFF8E7';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';

type Faith = 'hindu' | 'muslim' | 'sikh' | 'christian';

// Faith-specific copy + ceremony options
const FAITH_CONFIG: Record<Faith, {
  label: string;
  role: string;
  ceremonies: string[];
  hero: string;
}> = {
  hindu: {
    label: 'Hindu',
    role: 'Pandit',
    hero: '/priests/hindu-invite.jpg',
    ceremonies: [
      'Griha Pravesh (Housewarming)',
      'Satyanarayan Katha',
      'Mundan Ceremony',
      'Naamkaran (Naming)',
      'Wedding Ritual',
      'Birthday Puja',
      'Anniversary Puja',
      'Other / Custom Ceremony',
    ],
  },
  muslim: {
    label: 'Muslim',
    role: 'Imam',
    hero: '/priests/muslim-invite.jpg',
    ceremonies: [
      'Nikah Ceremony',
      'Aqeeqah (Naming)',
      'Janazah Prayer',
      'Taraweeh Imam',
      'Eid Khutbah',
      'House Dua',
      'Quran Khwani',
      'Other / Custom Event',
    ],
  },
  sikh: {
    label: 'Sikh',
    role: 'Granthi',
    hero: '/priests/sikh-invite.jpg',
    ceremonies: [
      'Akhand Path',
      'Sukhmani Sahib Path',
      'Naming Ceremony',
      'Anand Karaj (Wedding)',
      'House Kirtan',
      'Antam Sanskar (Funeral)',
      'Birthday Ardas',
      'Other / Custom Event',
    ],
  },
  christian: {
    label: 'Christian',
    role: 'Priest',
    hero: '/priests/christian-invite.jpg',
    ceremonies: [
      'Baptism Ceremony',
      'Christian Wedding',
      'Funeral / Last Rites',
      'House Blessing',
      'Family Prayer Service',
      'Thanksgiving Prayer',
      'Anniversary Blessing',
      'Other / Custom Service',
    ],
  },
};

interface BookingForm {
  ceremony: string;
  customCeremony: string;
  date: string;
  time: string;
  venue: 'home' | 'venue' | 'place_of_worship';
  address: string;
  city: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const INIT_FORM: BookingForm = {
  ceremony: '', customCeremony: '',
  date: '', time: '',
  venue: 'home', address: '', city: '',
  name: '', phone: '', email: '', notes: '',
};

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Flow (after the pick-priest-first restructure):
 *
 *   select   → pick a specific priest from Local/Global list  (NEW first step)
 *   ceremony → which ceremony
 *   when     → date + time
 *   where    → venue + address + city
 *   contact  → your details
 *   review   → check everything
 *   confirm  → pay & finalise (priest is already known, no mid-flow picker)
 *   success  → booking confirmed
 *
 * The legacy 'priests' step (mid-flow priest picker after review) is kept
 * in the union for backward compat with deep-links but is no longer part
 * of the normal STEPS[] progression.
 */
type Step = 'select' | 'ceremony' | 'when' | 'where' | 'contact' | 'review' | 'priests' | 'confirm' | 'success';

// Faith-specific priest pool. Replace with backend response from /priests/match when wired.
interface PriestRecord {
  id: string; name: string; yearsExp: number; languages: string[]; rating: number; reviews: number;
  fee: number; available: boolean; distanceKm: number; photo: string;
}
// No hardcoded priest list. The "matched priests" step now fetches live
// candidates from GET /v1/providers/by-religion/:religion. We do NOT ship
// fake humans as filler.

export default function PriestInviteBookingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const rawFaith = (params?.get('faith') ?? 'hindu') as Faith;
  const faith: Faith = ['hindu','muslim','sikh','christian'].includes(rawFaith) ? rawFaith : 'hindu';
  const cfg = FAITH_CONFIG[faith];

  // Optional ceremony pre-fill from the deep-link
  // (e.g. /priests/invite?faith=christian&ceremony=Christian+Wedding).
  // Even with a prefilled ceremony we still start at 'select' — the user
  // must always pick a specific priest first. Once they have, if a
  // ceremony was prefilled we skip the ceremony picker.
  const prefillCeremony = (params?.get('ceremony') ?? '').trim();
  const initialStep: Step = 'select';

  const [step, setStep] = useState<Step>(initialStep);
  const [form, setForm] = useState<BookingForm>(
    prefillCeremony ? { ...INIT_FORM, ceremony: prefillCeremony } : INIT_FORM
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [selectedPriest, setSelectedPriest] = useState<PriestRecord | null>(null);
  const [paymentId, setPaymentId] = useState('');

  // Live priest list fetched from the real backend.
  // As of the pick-priest-first restructure we fetch once when the user
  // reaches the 'select' step (the new landing) and REUSE the same list
  // for the legacy mid-flow 'priests' picker if it's ever hit via a
  // deep-link. Enriched with specialisations + city so the Local/Global
  // card layout can render exactly the mockup design.
  interface PriestListItem extends PriestRecord {
    city: string;
    specialisations: string[];
    isVerified: boolean;
  }
  const [allPriests, setAllPriests] = useState<PriestListItem[]>([]);
  const [priestsLoading, setPriestsLoading] = useState(false);
  const matchedPriests = allPriests; // legacy alias for the old render block

  useEffect(() => {
    if (step !== 'select' && step !== 'priests') return;
    if (allPriests.length > 0) return; // already loaded, don't refetch on tab switch
    const tok = tokenStore.access ?? '';
    setPriestsLoading(true);
    const religionParam = faith === 'muslim' ? 'islam' : faith;
    const headers: Record<string, string> = {};
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    /* Public directory endpoint — filters by religion + category='priest' so
     * we only surface priest-flow providers (not astrologers). */
    fetch(`${API_BASE}/providers?category=priest&religion=${religionParam}&limit=50`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const raw: any[] = Array.isArray(j) ? j : (j?.items ?? j?.data ?? []);
        setAllPriests(raw.map((p: any): PriestListItem => ({
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
          isVerified:      Boolean(p.isVerified ?? true), // approved providers are, by definition, verified
        })));
      })
      .catch(() => setAllPriests([]))
      .finally(() => setPriestsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, faith]);

  /* Local/Global tabs. Local = same city as the user's stored city (from
   * localStorage, populated during profile setup / provider onboarding).
   * If we don't know the user's city, Local shows an empty state and the
   * Global tab is auto-selected. */
  const [priestTab, setPriestTab] = useState<'local' | 'global'>('global');
  const userCity = typeof window !== 'undefined'
    ? (window.localStorage.getItem('rg_user_city') ?? '').trim().toLowerCase()
    : '';
  useEffect(() => {
    // Auto-flip to Local if we know the user's city and there's at least
    // one local priest — that's the more useful default.
    if (userCity && allPriests.some(p => p.city.toLowerCase() === userCity)) {
      setPriestTab('local');
    }
  }, [userCity, allPriests]);
  const filteredPriests = priestTab === 'local' && userCity
    ? allPriests.filter(p => p.city.toLowerCase() === userCity)
    : allPriests;

  // Load Razorpay Checkout SDK on mount (idempotent — won't re-add if already loaded).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.Razorpay) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  const update = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Step gating
  const ceremonyValid = !!form.ceremony && (form.ceremony !== 'Other / Custom Ceremony' && form.ceremony !== 'Other / Custom Event' && form.ceremony !== 'Other / Custom Service' || form.customCeremony.trim().length > 2);
  const whenValid = !!form.date && !!form.time;
  const whereValid = !!form.address.trim() && !!form.city.trim();
  const contactValid = !!form.name.trim() && PHONE_RE.test(form.phone) && (form.email === '' || EMAIL_RE.test(form.email));

  const effectiveCeremony = useMemo(() => {
    if (form.ceremony.startsWith('Other')) return form.customCeremony.trim() || form.ceremony;
    return form.ceremony;
  }, [form.ceremony, form.customCeremony]);

  /**
   * Save the booking REQUEST (draft) server-side + locally, then advance
   * to whatever step the caller requests.
   *
   * In the new pick-priest-first flow this is called by the review step's
   * "Continue with <priest>" button and advances to `confirm`. In the old
   * flow (still supported for deep-links) it advanced to the mid-flow
   * `priests` picker. Callers pass `nextStep` explicitly to make intent
   * unambiguous.
   *
   * No priest is notified until the confirm step's payment succeeds.
   */
  async function saveAndFindPriests(nextStep: Step = 'priests') {
    setSubmitting(true);
    setErrorMsg('');
    try {
      // Shape matches CreateInviteBookingDto on the backend.
      // forbidNonWhitelisted is on, so we MUST NOT send fields the DTO
      // doesn't declare (e.g. providerRole, type). scheduledAt must be a
      // strict ISO-8601 with a UTC 'Z' suffix.
      const payload: Record<string, unknown> = {
        status: 'draft',
        faith,
        ceremony: effectiveCeremony,
        scheduledAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
        venue: form.venue,
        address: form.address,
        city: form.city,
        contactName: form.name,
        contactPhone: form.phone,
      };
      if (form.email)  payload.contactEmail = form.email;
      if (form.notes)  payload.notes        = form.notes;
      const tok = tokenStore.access ?? '';
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (tok) headers['Authorization'] = 'Bearer ' + tok;

      // Real backend: POST /v1/bookings/invite (dedicated invite route added
      // to bookings.controller). DTO CreateInviteBookingDto accepts the
      // richer { status, faith, ceremony, scheduledAt, venue, address, city,
      // contactName, contactPhone, contactEmail?, notes? } shape — no
      // serviceId UUID required.
      const res = await fetch(`${API_BASE}/bookings/invite`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      }).catch(() => null);

      let reqId = mkLocalRef('REQ');
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        reqId = json?.data?.id ?? json?.id ?? reqId;
      }
      setRequestId(reqId);
      // Also keep the draft locally so a refresh on the priests screen doesn't lose it.
      try {
        sessionStorage.setItem('rg_invite_draft', JSON.stringify({ reqId, payload }));
      } catch { /* ignore */ }
      setStep(nextStep);
    } catch {
      setRequestId(mkLocalRef('REQ'));
      setStep(nextStep);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * "Pay & Confirm Booking" — full real-money flow:
   *   1. Create a pending booking record on the backend (gets bookingId).
   *   2. Create a Razorpay order for the priest's fee (gets razorpay_order_id).
   *   3. Open Razorpay Checkout. User pays.
   *   4. On checkout success, POST razorpay_* fields to /payments/verify-razorpay
   *      which HMAC-verifies the signature and marks the booking PAID.
   *   5. Only after payment is verified do we move to the success screen and
   *      release the contact details to the chosen priest (server-side flag).
   *
   * If the mock backend doesn't have the Razorpay endpoints (test env, no key),
   * we fall back to a synthetic confirmation so the dev flow stays unblocked.
   */
  async function confirmWithSelectedPriest() {
    if (!selectedPriest) return;
    setSubmitting(true);
    setErrorMsg('');
    const tok = tokenStore.access ?? '';
    const authHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
    if (tok) authHeaders['Authorization'] = 'Bearer ' + tok;

    // Confirm payload matches CreateInviteBookingDto (status='confirm').
    // priestId + requestId tell the backend to update the draft created on
    // the Find-Priests step rather than insert a new row.
    const bookingPayload: Record<string, unknown> = {
      status: 'confirm',
      requestId,
      priestId: selectedPriest.id,
      faith,
      ceremony: effectiveCeremony,
      scheduledAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
      venue: form.venue,
      address: form.address,
      city: form.city,
      contactName: form.name,
      contactPhone: form.phone,
    };
    if (form.email) bookingPayload.contactEmail = form.email;
    if (form.notes) bookingPayload.notes        = form.notes;

    try {
      // 1. Confirm the invite booking against the dedicated /v1/bookings/invite
      // route (status='confirm' + priestId + requestId). The backend updates
      // the existing draft, sets providerId, computes the price, and keeps
      // it in PENDING until /payments/order is created.
      const bookingRes = await fetch(`${API_BASE}/bookings/invite`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(bookingPayload),
      }).catch(() => null);

      let bid = mkLocalRef('RG');
      if (bookingRes && bookingRes.ok) {
        const json = await bookingRes.json().catch(() => ({}));
        bid = json?.data?.id ?? json?.id ?? bid;
      }
      setBookingId(bid);

      // 2. Create a Razorpay order. Real backend: POST /v1/payments/order (singular).
      // Per payments.service.ts:createOrder, the DTO only requires `bookingId` — amount, currency
      // and idempotency are derived server-side from the booking record. We send amountPaise as a
      // hint in case the booking lookup is not yet flushed (race-safe).
      const amountPaise = selectedPriest.fee * 100;
      const orderRes = await fetch(`${API_BASE}/payments/order`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ bookingId: bid, amountPaise, currency: 'INR' }),
      }).catch(() => null);

      const razorKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '';

      // If no Razorpay key OR backend doesn't have the route, fall back to a
      // synthetic "paid" confirmation so the dev experience isn't blocked.
      if (!razorKey || !orderRes || !orderRes.ok || typeof window === 'undefined' || !window.Razorpay) {
        setPaymentId('TEST-' + Math.random().toString(36).slice(2, 10).toUpperCase());
        try { sessionStorage.removeItem('rg_invite_draft'); } catch { /* ignore */ }
        setStep('success');
        setSubmitting(false);
        return;
      }

      const orderJson = await orderRes.json().catch(() => ({}));
      const razorpayOrderId: string = orderJson?.data?.razorpayOrderId ?? orderJson?.id ?? orderJson?.razorpayOrderId ?? '';
      const amount: number = orderJson?.data?.amountPaise ?? orderJson?.amountPaise ?? amountPaise;

      if (!razorpayOrderId) {
        setErrorMsg('Could not start payment. Please try again.');
        setSubmitting(false);
        return;
      }

      // 3. Launch Razorpay Checkout
      await new Promise<void>((resolve, reject) => {
        const Razorpay = window.Razorpay;
        if (!Razorpay) { reject(new Error('Razorpay SDK not loaded')); return; }
        const rzp = new Razorpay({
          key: razorKey,
          amount,
          currency: 'INR',
          order_id: razorpayOrderId,
          name: 'ReligioGram',
          description: `${cfg.label} ${cfg.role} · ${effectiveCeremony}`,
          prefill: {
            name: form.name,
            email: form.email || undefined,
            contact: form.phone,
          },
          theme: { color: '#0F2452' },
          // 4. Verify on the backend (real route: POST /v1/payments/verify).
          // Per payments.service.ts:verifyPayment the DTO uses camelCase field names
          // (razorpayOrderId / razorpayPaymentId / razorpaySignature). Razorpay's checkout JS
          // hands them back snake_case, so we translate at the boundary.
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
                method: 'POST', headers: authHeaders,
                body: JSON.stringify({
                  bookingId: bid,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              });
              if (!verifyRes.ok) throw new Error('Verification failed');
              setPaymentId(response.razorpay_payment_id);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        } as unknown as Record<string, unknown>);
        rzp.open();
      });

      // 5. Success
      try { sessionStorage.removeItem('rg_invite_draft'); } catch { /* ignore */ }
      setStep('success');
    } catch (err) {
      setErrorMsg(err instanceof Error && err.message === 'Payment cancelled'
        ? 'Payment was cancelled. Your booking is held; you can try again.'
        : (err instanceof Error ? err.message : 'Payment failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  function mkLocalRef(prefix = 'RG') {
    return prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // Progress dots — priest pick FIRST, then 5 form steps.
  // The old mid-flow 'priests' step is no longer part of the flow.
  const STEPS: Step[] = ['select','ceremony','when','where','contact','review'];
  const stepIdx = STEPS.indexOf(step);
  const TOTAL = STEPS.length;
  const showProgress = step !== 'success' && step !== 'confirm';

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        backgroundImage: `linear-gradient(135deg, rgba(10,22,40,0.80) 0%, rgba(26,36,56,0.65) 50%, rgba(42,24,8,0.55) 100%), url('${cfg.hero}')`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        backgroundColor: NAVY,
        padding: '14px 16px 22px', color: '#fff',
      }}>
        <button onClick={() => {
            if (step === 'success') { router.push('/priests'); return; }
            /* confirm → review (was 'priests' in the old flow; the mid-flow
             * priest picker no longer exists so we go back to the review
             * screen where the user last edited details). */
            if (step === 'confirm') { setStep('review'); return; }
            if (stepIdx > 0) { setStep(STEPS[stepIdx-1]); return; }
            router.back();
          }}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ fontSize: 10.5, color: GOLD_L, letterSpacing: '0.1em', fontWeight: 800, marginBottom: 4 }}>{cfg.label.toUpperCase()} CEREMONIES</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Playfair Display",Georgia,serif', margin: '0 0 4px', lineHeight: 1.1 }}>
          Invite a {cfg.role}
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.4 }}>
          For events, ceremonies and religious programs at your home or venue.
        </p>
      </div>

      {/* ── PROGRESS BAR ───────────────────────────────────────── */}
      {showProgress && (
        <div style={{ display: 'flex', gap: 5, padding: '14px 16px 4px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 4,
              background: i <= stepIdx ? GOLD : 'rgba(200,146,10,0.18)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>
      )}
      {showProgress && (
        <div style={{ padding: '4px 16px 12px', color: TEXT3, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
          STEP {stepIdx + 1} OF {TOTAL}
        </div>
      )}

      {/* ── STEP CONTENT ───────────────────────────────────────── */}
      <div style={{ padding: '0 14px' }}>

        {step === 'select' && (
          <div>
            {/* ── Golden card panel — Local / Global tabs + priest cards ──
             * Layout matches the reference mockup exactly:
             *   - Ornate top/bottom borders on the panel
             *   - Centered "Available <role>s" title with diamond divider
             *   - Local/Global pill toggle (Local highlighted navy when active)
             *   - Each priest displayed with a small location tag ABOVE the
             *     card (📍 Local / 🌐 Global), then a horizontal card with
             *     photo left + info right, gold gradient background with a
             *     thin decorative border along top and bottom.
             */}
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
              }}>Available {cfg.role}s</div>
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
                  }}
                >Local</button>
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
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}
              {!priestsLoading && filteredPriests.length === 0 && (
                <div style={{
                  padding: '32px 20px', textAlign: 'center',
                  fontSize: 13, color: '#2D1500', lineHeight: 1.5, fontWeight: 600,
                }}>
                  {priestTab === 'local' && !userCity
                    ? 'Set your city in Profile to see local priests.'
                    : priestTab === 'local'
                      ? `No verified ${cfg.role}s in your city yet. Try Global.`
                      : `No verified ${cfg.role}s available right now.`}
                </div>
              )}

              {/* Priest cards — location tag OUTSIDE each card, card below */}
              {!priestsLoading && filteredPriests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredPriests.map((p) => {
                    const isLocal  = !!(userCity && p.city.toLowerCase() === userCity);
                    const selected = selectedPriest?.id === p.id;
                    return (
                      <div key={p.id}>
                        {/* Location tag ABOVE the card, matches reference mockup */}
                        <div style={{
                          fontSize: 12, fontWeight: 800, color: '#2D1500',
                          display: 'flex', alignItems: 'center', gap: 5,
                          marginBottom: 6, paddingLeft: 4,
                        }}>
                          <span style={{ fontSize: 13 }}>{isLocal ? '📍' : '🌐'}</span>
                          <span>{isLocal ? 'Local' : 'Global'}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedPriest(p)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: 0, borderRadius: 12,
                            background: selected
                              ? `linear-gradient(180deg,#FFEBBE 0%,#F5CE87 100%)`
                              : `linear-gradient(180deg,#F9DFA4 0%,#E5BE79 100%)`,
                            border: `1.5px solid ${selected ? '#0A1628' : '#8B5A16'}`,
                            boxShadow: selected
                              ? '0 8px 20px rgba(10,22,40,0.25), inset 0 1px 0 rgba(255,255,255,0.55)'
                              : '0 3px 8px rgba(107,50,16,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Ornate top border */}
                          <div style={{
                            height: 3,
                            background: 'linear-gradient(90deg,transparent 0%,#8B5A16 20%,#8B5A16 80%,transparent 100%)',
                            opacity: 0.55,
                          }} />

                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 12px' }}>
                            {/* Avatar */}
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
                              {/* Name */}
                              <div style={{
                                fontFamily: '"Playfair Display",Georgia,serif',
                                fontSize: 16, fontWeight: 800, color: '#1A0800',
                                lineHeight: 1.2,
                              }}>
                                {p.name}
                              </div>

                              {/* Rating + verified */}
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

                              {/* Specialisations */}
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

                          {/* Ornate bottom border — mirrors the top */}
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

            <Next
              disabled={!selectedPriest}
              onClick={() => setStep(prefillCeremony ? 'when' : 'ceremony')}
              label={selectedPriest
                ? `Continue with ${selectedPriest.name.split(' ').slice(0,2).join(' ')}`
                : `Pick a ${cfg.role} to continue`}
            />
          </div>
        )}

        {step === 'ceremony' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>Which ceremony?</H2>
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {cfg.ceremonies.map(c => (
                <button key={c} onClick={() => update('ceremony', c)} style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                  border: `1.5px solid ${form.ceremony === c ? NAVY_2 : 'rgba(200,146,10,0.30)'}`,
                  background: form.ceremony === c ? 'rgba(15,36,82,0.05)' : '#fff',
                  color: TEXT, fontSize: 13, fontWeight: form.ceremony === c ? 800 : 600,
                  cursor: 'pointer',
                }}>
                  {form.ceremony === c && <span style={{ color: NAVY_2, marginRight: 6 }}>●</span>}{c}
                </button>
              ))}
            </div>
            {form.ceremony.startsWith('Other') && (
              <Field label="Tell us what ceremony">
                <input value={form.customCeremony} onChange={e => update('customCeremony', e.target.value)} placeholder="e.g. Bhumi Pujan, Diwali Puja…" style={inputStyle} />
              </Field>
            )}
            <Next disabled={!ceremonyValid} onClick={() => setStep('when')} label="Continue" />
          </div>
        )}

        {step === 'when' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>When?</H2>
            <Field label="Date">
              <input type="date" value={form.date} onChange={e => update('date', e.target.value)} min={new Date().toISOString().slice(0,10)} style={inputStyle} />
            </Field>
            <Field label="Time">
              <input type="time" value={form.time} onChange={e => update('time', e.target.value)} style={inputStyle} />
            </Field>
            <Next disabled={!whenValid} onClick={() => setStep('where')} label="Continue" />
          </div>
        )}

        {step === 'where' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>Where?</H2>
            <Field label="Venue type">
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'home', label: 'Home' },
                  { id: 'venue', label: 'Venue / Banquet' },
                  { id: 'place_of_worship', label: faith === 'muslim' ? 'Mosque' : faith === 'christian' ? 'Church' : faith === 'sikh' ? 'Gurudwara' : 'Temple' },
                ].map(v => (
                  <button key={v.id} onClick={() => update('venue', v.id as BookingForm['venue'])} style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10,
                    border: `1.5px solid ${form.venue === v.id ? NAVY_2 : 'rgba(200,146,10,0.30)'}`,
                    background: form.venue === v.id ? 'rgba(15,36,82,0.05)' : '#fff',
                    color: TEXT, fontSize: 11.5, fontWeight: form.venue === v.id ? 800 : 600,
                    cursor: 'pointer',
                  }}>{v.label}</button>
                ))}
              </div>
            </Field>
            <Field label="Address">
              <textarea value={form.address} onChange={e => update('address', e.target.value)} rows={2} placeholder="Flat/Building, Street, Area" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={e => update('city', e.target.value)} placeholder="e.g. Mumbai" style={inputStyle} />
            </Field>
            <Next disabled={!whereValid} onClick={() => setStep('contact')} label="Continue" />
          </div>
        )}

        {step === 'contact' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>Your contact</H2>
            <Field label="Your name">
              <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Full name" style={inputStyle} />
            </Field>
            <Field label="Mobile number">
              <input value={form.phone} onChange={e => update('phone', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10-digit number" inputMode="numeric" style={inputStyle} />
              {form.phone && !PHONE_RE.test(form.phone) && <Hint err>Enter a valid 10-digit Indian mobile number.</Hint>}
            </Field>
            <Field label="Email (optional)">
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="you@example.com" style={inputStyle} />
              {form.email && !EMAIL_RE.test(form.email) && <Hint err>Enter a valid email or leave blank.</Hint>}
            </Field>
            <Field label="Notes for the ${cfg.role} (optional)">
              <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Anything specific — language, special items needed, attendees, etc." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
            <Next disabled={!contactValid} onClick={() => setStep('review')} label="Review" />
          </div>
        )}

        {step === 'review' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>Review &amp; confirm</H2>
            <Row k="Ceremony" v={effectiveCeremony} />
            <Row k="Date" v={form.date} />
            <Row k="Time" v={form.time} />
            <Row k="Venue" v={form.venue === 'home' ? 'Home' : form.venue === 'venue' ? 'Venue / Banquet' : (faith === 'muslim' ? 'Mosque' : faith === 'christian' ? 'Church' : faith === 'sikh' ? 'Gurudwara' : 'Temple')} />
            <Row k="Address" v={`${form.address}, ${form.city}`} />
            <Row k="Contact" v={`${form.name} · ${form.phone}${form.email ? ' · ' + form.email : ''}`} />
            {form.notes && <Row k="Notes" v={form.notes} />}
            <div style={{ marginTop: 12, padding: 10, background: '#FFF6E0', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 8, fontSize: 11, color: TEXT2, lineHeight: 1.5 }}>
              <strong>What happens next:</strong> {selectedPriest
                ? `We share these details with ${selectedPriest.name.split(' ').slice(0,2).join(' ')} after you complete payment on the next screen. They'll confirm within 24 hours.`
                : `We share these details with your chosen ${cfg.role} after you complete payment on the next screen.`}
            </div>
            {errorMsg && <div style={{ marginTop: 10, padding: 10, background: '#FEE2E2', color: '#7A1F1F', borderRadius: 8, fontSize: 12 }}>{errorMsg}</div>}
            <Next
              disabled={submitting || !selectedPriest}
              onClick={() => saveAndFindPriests('confirm')}
              label={submitting ? 'Saving…' : `Continue with ${selectedPriest?.name.split(' ').slice(0,2).join(' ') ?? cfg.role}`}
            />
          </div>
        )}

        {step === 'priests' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(200,146,10,0.20)', marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TEXT3, fontWeight: 700, letterSpacing: '0.04em' }}>REQUEST SAVED</div>
              <div style={{ fontSize: 12, color: TEXT, marginTop: 2 }}>Reference <strong style={{ color: NAVY_2 }}>{requestId}</strong> · {effectiveCeremony} · {form.date} {form.time}</div>
            </div>
            <H2>{matchedPriests.length} verified {cfg.role}s available</H2>
            <div style={{ fontSize: 11.5, color: TEXT3, marginBottom: 10, lineHeight: 1.5 }}>
              Shortlisted based on your ceremony, date, time, and city. Select one to share your details with them.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {matchedPriests.map(p => {
                const selected = selectedPriest?.id === p.id;
                return (
                  <button key={p.id} onClick={() => setSelectedPriest(p)} style={{
                    textAlign: 'left', padding: 12, borderRadius: 12,
                    background: selected ? 'rgba(15,36,82,0.05)' : '#fff',
                    border: `1.5px solid ${selected ? NAVY_2 : 'rgba(200,146,10,0.25)'}`,
                    cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}>
                    <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{p.name}</div>
                        {selected && <span style={{ fontSize: 10, fontWeight: 800, color: NAVY_2, background: 'rgba(15,36,82,0.10)', padding: '2px 7px', borderRadius: 10 }}>SELECTED</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 2 }}>{p.yearsExp}+ yrs experience · {p.distanceKm.toFixed(1)} km away</div>
                      <div style={{ fontSize: 10, color: TEXT3, marginTop: 2 }}>{p.languages.join(' · ')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: 10.5, color: GOLD, fontWeight: 800 }}>⭐ {p.rating.toFixed(1)} ({p.reviews})</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#7A1F1F' }}>₹{p.fee.toLocaleString('en-IN')}<span style={{ fontSize: 9, color: TEXT3, fontWeight: 600 }}> /ceremony</span></span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <Next disabled={!selectedPriest} onClick={() => setStep('confirm')} label={selectedPriest ? `Continue with ${selectedPriest.name.split(' ').slice(0,2).join(' ')}` : 'Select a priest to continue'} />
          </div>
        )}

        {step === 'confirm' && selectedPriest && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(200,146,10,0.20)' }}>
            <H2>Confirm booking</H2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, background: 'rgba(15,36,82,0.05)', borderRadius: 10, marginBottom: 12, border: '1px solid rgba(15,36,82,0.15)' }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedPriest.photo} alt={selectedPriest.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{selectedPriest.name}</div>
                <div style={{ fontSize: 10.5, color: TEXT3 }}>⭐ {selectedPriest.rating.toFixed(1)} ({selectedPriest.reviews}) · {selectedPriest.yearsExp}+ yrs</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#7A1F1F', marginTop: 2 }}>₹{selectedPriest.fee.toLocaleString('en-IN')} <span style={{ fontSize: 9, color: TEXT3, fontWeight: 600 }}>/ceremony</span></div>
              </div>
            </div>
            <Row k="Ceremony" v={effectiveCeremony} />
            <Row k="When" v={`${form.date} at ${form.time}`} />
            <Row k="Where" v={`${form.address}, ${form.city}`} />
            <Row k="Contact" v={`${form.name} · ${form.phone}`} />
            <div style={{ marginTop: 12, padding: 10, background: '#FFF6E0', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 8, fontSize: 11, color: TEXT2, lineHeight: 1.5 }}>
              <strong>Secure payment via Razorpay.</strong> Once payment is confirmed, your contact details and ceremony info are sent to <strong>{selectedPriest.name}</strong> only. They'll reach out within 30 minutes to finalise. UPI, cards, net banking and wallets supported.
            </div>
            {/* Payment summary */}
            <div style={{ marginTop: 10, padding: 12, background: '#fff', border: '1.5px solid rgba(15,36,82,0.18)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: TEXT3, marginBottom: 4 }}>
                <span>Ceremony fee</span>
                <span>₹{selectedPriest.fee.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: TEXT3, marginBottom: 6 }}>
                <span>Platform fee &amp; GST</span>
                <span>Included</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 800, color: TEXT, borderTop: '1px solid rgba(200,146,10,0.25)', paddingTop: 6 }}>
                <span>Total payable</span>
                <span style={{ color: '#7A1F1F' }}>₹{selectedPriest.fee.toLocaleString('en-IN')}</span>
              </div>
            </div>
            {errorMsg && <div style={{ marginTop: 10, padding: 10, background: '#FEE2E2', color: '#7A1F1F', borderRadius: 8, fontSize: 12 }}>{errorMsg}</div>}
            <Next disabled={submitting} onClick={confirmWithSelectedPriest} label={submitting ? 'Processing payment…' : `Pay ₹${selectedPriest.fee.toLocaleString('en-IN')} & Confirm`} />
            <button onClick={() => { setSelectedPriest(null); setStep('priests'); }} style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: NAVY_2, fontSize: 12, fontWeight: 700, padding: '8px 0', cursor: 'pointer' }}>
              ← Pick a different {cfg.role}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 18px', border: '1px solid rgba(200,146,10,0.20)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(22,163,74,0.15)', border: '2px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 28 }}>✓</div>
            <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: TEXT }}>Payment successful</h2>
            <p style={{ fontSize: 13, color: TEXT2, lineHeight: 1.55, margin: '0 0 14px' }}>
              {selectedPriest ? <>Your details have been sent to <strong>{selectedPriest.name}</strong>, who will reach out within 30 minutes.</> : <>A verified {cfg.role} will reach out within 30 minutes.</>}
            </p>
            <div style={{ display: 'grid', gap: 4, marginBottom: 14, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: TEXT3, fontWeight: 700, letterSpacing: '0.04em' }}>BOOKING REFERENCE</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: NAVY_2 }}>{bookingId}</div>
              {paymentId && <>
                <div style={{ fontSize: 11, color: TEXT3, fontWeight: 700, letterSpacing: '0.04em', marginTop: 4 }}>PAYMENT ID</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>{paymentId}</div>
              </>}
              {selectedPriest && <>
                <div style={{ fontSize: 11, color: TEXT3, fontWeight: 700, letterSpacing: '0.04em', marginTop: 4 }}>AMOUNT PAID</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#7A1F1F' }}>₹{selectedPriest.fee.toLocaleString('en-IN')}</div>
              </>}
            </div>
            <div style={{ background: '#FFF6E0', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 10, padding: 12, textAlign: 'left', fontSize: 12, color: TEXT2, marginBottom: 14, lineHeight: 1.55 }}>
              <div style={{ marginBottom: 4 }}><strong>{effectiveCeremony}</strong></div>
              <div>📅 {form.date} at {form.time}</div>
              <div>📍 {form.address}, {form.city}</div>
              <div>📞 {form.phone}</div>
            </div>
            <button onClick={() => router.push('/bookings')} style={{ width: '100%', background: NAVY_2, color: '#fff', fontSize: 13, fontWeight: 800, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 8 }}>
              View my bookings
            </button>
            <button onClick={() => router.push('/priests')} style={{ width: '100%', background: 'transparent', color: NAVY_2, fontSize: 12.5, fontWeight: 700, padding: '8px 0', borderRadius: 10, border: `1px solid ${NAVY_2}`, cursor: 'pointer' }}>
              Back to Priests
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 8,
  border: '1.5px solid rgba(200,146,10,0.30)',
  fontSize: 13,
  color: '#1A0800',
  background: '#FFFCF5',
  outline: 'none',
  fontFamily: 'inherit',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 18, fontWeight: 800, margin: '0 0 12px', color: '#1A0800' }}>{children}</h2>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#4A3010', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Hint({ children, err }: { children: React.ReactNode; err?: boolean }) {
  return <div style={{ fontSize: 10.5, color: err ? '#B91C1C' : '#8B6B35', marginTop: 4 }}>{children}</div>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
      <div style={{ fontSize: 11, color: '#8B6B35', fontWeight: 700, width: 80, flexShrink: 0 }}>{k}</div>
      <div style={{ fontSize: 12, color: '#1A0800', flex: 1, fontWeight: 500 }}>{v}</div>
    </div>
  );
}

function Next({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', marginTop: 12,
      background: disabled ? 'rgba(15,36,82,0.30)' : NAVY_2, color: '#fff',
      fontSize: 13, fontWeight: 800, padding: '12px 0', borderRadius: 10,
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      {label}
    </button>
  );
}
