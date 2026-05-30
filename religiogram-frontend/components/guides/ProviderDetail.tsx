'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatRupees } from '@/lib/format-currency';
import type { SpiritualGuide } from './SpiritualGuides';

const REVIEWS = [
  { id: 'r1', name: 'Priya M.', rating: 5, text: 'Absolutely wonderful experience. The puja was conducted with great devotion and precision.', date: '12 Apr 2026' },
  { id: 'r2', name: 'Rahul K.', rating: 5, text: 'Very professional and knowledgeable. Our Griha Pravesh was memorable, highly recommended!', date: '8 Apr 2026' },
  { id: 'r3', name: 'Sunita D.', rating: 4, text: 'Great experience overall. Punctual and thorough in the rituals. Will book again.', date: '1 Apr 2026' },
];

const TIME_SLOTS = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];

export default function ProviderDetail({ guide }: { guide: SpiritualGuide }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'about' | 'services' | 'reviews' | 'book'>('about');
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  // Generate next 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { index: i, day: d.toLocaleDateString('en', { weekday: 'short' }), date: d.getDate() };
  });

  const TABS = [
    { id: 'about', label: 'About' },
    { id: 'services', label: 'Services' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'book', label: 'Book' },
  ] as const;

  return (
    <div className="min-h-svh flex flex-col" style={{ background: '#F5E9D8' }}>

      {/* ── Hero ── */}
      <div className="relative flex-shrink-0" style={{ height: 200 }}>
        <div className="absolute inset-0"
          style={{ background: `linear-gradient(160deg, ${guide.avatarGradient[0]} 0%, ${guide.avatarGradient[1]} 60%, #0F2452 100%)` }}>
          {/* Decorative rings */}
          {[220, 160, 100].map((s, i) => (
            <div key={i} className="absolute rounded-full border opacity-10"
              style={{ width: s, height: s, top: '50%', right: -(s * 0.25), transform: 'translateY(-50%)', borderColor: 'white' }} />
          ))}
        </div>

        {/* Back + actions */}
        <button onClick={() => router.back()}
          className="absolute top-14 left-4 w-9 h-9 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(8px)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="absolute top-14 right-4 flex gap-2 z-10">
          {['share', 'heart'].map((icon) => (
            <button key={icon} className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(8px)' }}>
              {icon === 'share'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            </button>
          ))}
        </div>

        {/* Avatar + name overlay */}
        <div className="absolute bottom-0 inset-x-0 px-5 pb-4"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,.55), transparent)' }}>
          <div className="flex items-end gap-3">
            <div className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center text-[17px] font-bold border-2 border-white/30"
              style={{ background: `linear-gradient(145deg,${guide.avatarGradient[0]},${guide.avatarGradient[1]})`, color: '#ffffff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              {guide.initials}
            </div>
            <div>
              <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: 'white', lineHeight: 1.2, marginBottom: 3 }}>
                {guide.name}
              </h1>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.role}</span>
                <span className="w-1 h-1 rounded-full bg-white/50 inline-block" />
                <span className="flex items-center gap-1" style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: guide.isOnline ? '#27AE60' : '#94A3B8' }} />
                  {guide.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick stats card ── */}
      <div className="mx-5 -mt-0 mb-4 rounded-3xl overflow-hidden"
        style={{ background: 'rgba(255,252,245,.95)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 4px 18px rgba(107,63,29,.1)' }}>
        <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'rgba(197,138,75,.15)' }}>
          {[
            { label: 'Rating', value: `${guide.rating}★`, sub: `${guide.reviewCount} reviews` },
            { label: 'Experience', value: `${guide.experience}y`, sub: 'years' },
            { label: 'Sessions', value: guide.completedSessions.toLocaleString(), sub: 'completed' },
            { label: 'From', value: formatRupees(guide.priceFrom), sub: 'per session' },
          ].map((s, i) => (
            <div key={s.label} className="flex flex-col items-center py-3 px-1"
              style={{ borderRight: i < 3 ? '1px solid rgba(197,138,75,.15)' : 'none' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s.value}</span>
              <span style={{ fontSize: 9, color: 'rgba(107,63,29,.55)', fontFamily: "'Plus Jakarta Sans',sans-serif", textAlign: 'center', lineHeight: 1.3 }}>{s.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b mx-5 mb-4 overflow-x-auto" style={{ borderColor: 'rgba(169,113,66,.18)', scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex-shrink-0 px-4 py-2.5 text-[12.5px] font-semibold transition-all"
            style={{
              fontFamily: "'Plus Jakarta Sans',sans-serif",
              color: activeTab === t.id ? '#C8932A' : 'rgba(107,63,29,.5)',
              borderBottom: activeTab === t.id ? '2.5px solid #C8932A' : '2.5px solid transparent',
              marginBottom: '-1px',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 px-5 pb-28 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

        {/* ABOUT */}
        {activeTab === 'about' && (
          <div>
            <p className="text-[13px] leading-relaxed mb-4"
              style={{ color: 'rgba(107,63,29,.75)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.bio}</p>

            <div className="rounded-2xl p-4 mb-4"
              style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 10 }}>Details</h3>
              {[
                { label: 'Faith', value: guide.faith },
                { label: 'Languages', value: guide.languages.join(', ') },
                { label: 'Availability', value: guide.isOnline ? '● Available online now' : 'Currently offline' },
                { label: 'Location', value: guide.distance ? `${guide.distance} away` : 'Remote only' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2"
                  style={{ borderBottom: '1px solid rgba(197,138,75,.1)' }}>
                  <span style={{ fontSize: 12, color: 'rgba(107,63,29,.6)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SERVICES */}
        {activeTab === 'services' && (
          <div className="flex flex-col gap-3">
            {guide.services.map((s, i) => (
              <div key={s} className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: 'rgba(169,113,66,.1)', border: '1px solid rgba(169,113,66,.2)' }}>
                    {['🙏', '🔥', '🏠', '📖', '🌸', '⭐'][i % 6]}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s}</p>
                    <p style={{ fontSize: 10.5, color: 'rgba(107,63,29,.55)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Duration: 1–2 hrs</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#C8932A', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                    {formatRupees(guide.priceFrom + i * 500)}
                  </p>
                  <p style={{ fontSize: 9.5, color: 'rgba(107,63,29,.45)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>onwards</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* REVIEWS */}
        {activeTab === 'reviews' && (
          <div>
            {/* Rating summary */}
            <div className="flex items-center gap-4 p-4 rounded-2xl mb-4"
              style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)' }}>
              <div className="text-center">
                <p style={{ fontFamily: "'Playfair Display',serif", fontSize: 36, fontWeight: 700, color: '#0F2452', lineHeight: 1 }}>{guide.rating}</p>
                <div className="flex gap-0.5 justify-center mt-1 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} width="10" height="10" viewBox="0 0 24 24"
                      fill={s <= Math.round(guide.rating) ? '#C8932A' : 'rgba(169,113,66,.25)'}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'rgba(107,63,29,.5)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.reviewCount} reviews</p>
              </div>
              <div className="flex-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const pct = star === 5 ? 72 : star === 4 ? 18 : star === 3 ? 7 : star === 2 ? 2 : 1;
                  return (
                    <div key={star} className="flex items-center gap-1.5 mb-1">
                      <span style={{ fontSize: 9.5, color: 'rgba(107,63,29,.6)', fontFamily: "'Plus Jakarta Sans',sans-serif", width: 8 }}>{star}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(169,113,66,.15)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(to right, #C8932A, #C8932A)' }} />
                      </div>
                      <span style={{ fontSize: 9.5, color: 'rgba(107,63,29,.5)', width: 20, textAlign: 'right', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {REVIEWS.map((r) => (
              <div key={r.id} className="p-4 rounded-2xl mb-3"
                style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 8px rgba(107,63,29,.05)' }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'linear-gradient(135deg,#C8932A,#C8932A)', color: '#ffffff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{r.name}</p>
                      <p style={{ fontSize: 10, color: 'rgba(107,63,29,.5)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{r.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg key={s} width="9" height="9" viewBox="0 0 24 24" fill={s <= r.rating ? '#C8932A' : 'rgba(169,113,66,.25)'}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: 12.5, color: 'rgba(107,63,29,.75)', lineHeight: 1.55, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* BOOK */}
        {activeTab === 'book' && !booked && (
          <div>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452', marginBottom: 12 }}>
              Select a Date
            </h3>
            <div className="flex gap-2.5 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
              {days.map((d) => (
                <button key={d.index}
                  onClick={() => setSelectedDate(d.index)}
                  className="flex-shrink-0 flex flex-col items-center py-2.5 px-3.5 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: selectedDate === d.index ? 'linear-gradient(135deg,#C8932A,#C8932A)' : 'rgba(255,252,245,.9)',
                    border: `1.5px solid ${selectedDate === d.index ? 'transparent' : 'rgba(197,138,75,.22)'}`,
                    boxShadow: selectedDate === d.index ? '0 3px 12px rgba(169,113,66,.38)' : 'none',
                  }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: selectedDate === d.index ? 'rgba(253,245,232,.8)' : 'rgba(107,63,29,.55)', fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: 0.3 }}>{d.day}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: selectedDate === d.index ? '#ffffff' : '#0F2452', fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>{d.date}</span>
                </button>
              ))}
            </div>

            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452', marginBottom: 12 }}>
              Select a Time
            </h3>
            <div className="grid grid-cols-3 gap-2.5 mb-6">
              {TIME_SLOTS.map((slot) => (
                <button key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className="py-3 rounded-2xl text-[12.5px] font-semibold transition-all active:scale-95"
                  style={{
                    fontFamily: "'Plus Jakarta Sans',sans-serif",
                    background: selectedSlot === slot ? 'linear-gradient(135deg,#C8932A,#C8932A)' : 'rgba(255,252,245,.9)',
                    color: selectedSlot === slot ? '#ffffff' : '#0F2452',
                    border: `1.5px solid ${selectedSlot === slot ? 'transparent' : 'rgba(197,138,75,.22)'}`,
                    boxShadow: selectedSlot === slot ? '0 3px 12px rgba(169,113,66,.38)' : 'none',
                  }}>
                  {slot}
                </button>
              ))}
            </div>

            <button
              disabled={!selectedDate && selectedDate !== 0 || !selectedSlot}
              onClick={() => selectedDate !== null && selectedSlot && setBooked(true)}
              className="w-full h-[52px] rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2.5 transition-all active:scale-[.97]"
              style={{
                fontFamily: "'Plus Jakarta Sans',sans-serif",
                background: (selectedDate !== null && selectedSlot) ? 'linear-gradient(140deg,#C8932A,#C8932A)' : 'rgba(169,113,66,.3)',
                color: '#ffffff',
                boxShadow: (selectedDate !== null && selectedSlot) ? '0 5px 20px rgba(169,113,66,.42)' : 'none',
                cursor: (selectedDate !== null && selectedSlot) ? 'pointer' : 'not-allowed',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {(selectedDate !== null && selectedSlot) ? `Confirm Booking · ${selectedSlot}` : 'Select Date & Time'}
            </button>
          </div>
        )}

        {/* BOOKING SUCCESS */}
        {activeTab === 'book' && booked && (
          <div className="text-center py-8 px-4 rounded-3xl"
            style={{ background: 'rgba(39,174,96,.07)', border: '1px solid rgba(39,174,96,.2)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg,#27AE60,#1E7E45)', boxShadow: '0 6px 20px rgba(39,174,96,.35)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#1E7E45', marginBottom: 8 }}>
              Booking Confirmed! 🙏
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(30,126,69,.8)', fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1.6, marginBottom: 6 }}>
              Your session with <strong>{guide.name}</strong> has been scheduled.
            </p>
            <p style={{ fontSize: 12, color: 'rgba(30,126,69,.7)', fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 20 }}>
              {days[selectedDate ?? 0]?.day}, {days[selectedDate ?? 0]?.date} at {selectedSlot}
            </p>
            <button onClick={() => { setBooked(false); setSelectedDate(null); setSelectedSlot(null); }}
              style={{ padding: '8px 20px', borderRadius: 14, border: 'none', background: 'rgba(39,174,96,.15)', color: '#1E7E45', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Book Another Session
            </button>
          </div>
        )}
      </div>

      {/* ── Sticky bottom CTA ── */}
      {activeTab !== 'book' && (
        <div className="fixed bottom-0 inset-x-0 px-5 py-4 z-30"
          style={{ background: 'rgba(245,233,216,.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid rgba(197,138,75,.16)' }}>
          <div className="flex gap-3 max-w-sm mx-auto">
            <button
              className="flex-1 h-[50px] rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(140deg,#C8932A,#C8932A)', color: '#ffffff', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 5px 18px rgba(169,113,66,.42)' }}
              onClick={() => setActiveTab('book')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Book · {formatRupees(guide.priceFrom)}+
            </button>
            <button className="w-[50px] h-[50px] rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(169,113,66,.1)', border: '1.5px solid rgba(169,113,66,.25)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
