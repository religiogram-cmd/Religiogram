'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs } from '@/components/places/Tabs';

interface Event { id: string; date: string; day: string; title: string; time: string; type: string; }
interface Service { id: string; name: string; description: string; duration: string; price: number; icon: string; }

const EVENTS: Event[] = [
  { id: 'e1', date: '18', day: 'Apr', title: 'Evening Aarti Ceremony', time: '6:30 PM – 7:30 PM', type: 'Daily' },
  { id: 'e2', date: '20', day: 'Apr', title: 'Hanuman Jayanti Special Puja', time: '5:00 AM – 12:00 PM', type: 'Special' },
  { id: 'e3', date: '22', day: 'Apr', title: 'Community Prayer & Langar', time: '9:00 AM – 1:00 PM', type: 'Community' },
  { id: 'e4', date: '28', day: 'Apr', title: 'Akshaya Tritiya Celebrations', time: '6:00 AM – 8:00 PM', type: 'Festival' },
];

const SERVICES: Service[] = [
  { id: 's1', name: 'Daily Puja & Aarti', description: 'Morning and evening rituals conducted by resident priests', duration: '45 min', price: 0, icon: '🪔' },
  { id: 's2', name: 'Special Sankalp Puja', description: 'Personalised rituals with dedicated priest for your intentions', duration: '2 hrs', price: 2100, icon: '🌸' },
  { id: 's3', name: 'Griha Pravesh', description: 'Home blessing ceremony with full vedic rituals', duration: '3 hrs', price: 5100, icon: '🏠' },
  { id: 's4', name: 'Havan / Homa', description: 'Sacred fire ceremony for prosperity and purification', duration: '2-4 hrs', price: 3500, icon: '🔥' },
  { id: 's5', name: 'Prasad Booking', description: 'Pre-order blessed prasad for pickup or delivery', duration: 'Pickup', price: 151, icon: '🍯' },
];

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Daily:     { bg: 'rgba(169,113,66,.12)',  text: '#C8932A' },
  Special:   { bg: 'rgba(197,138,75,.15)',  text: '#9A7B1E' },
  Community: { bg: 'rgba(39,174,96,.12)',   text: '#1E7E45' },
  Festival:  { bg: 'rgba(139,90,140,.12)',  text: '#6B3A8C' },
};

export default function PlaceDetail() {
  const router = useRouter();
  const [tab, setTab] = useState('events');
  const [donationAmount, setDonationAmount] = useState<number | null>(null);
  const [donated, setDonated] = useState(false);

  const QUICK_AMOUNTS = [51, 101, 251, 501, 1001];

  return (
    <div className="min-h-svh" style={{ background: '#F5E9D8' }}>

      {/* ── Hero Section ── */}
      <div className="relative h-[260px] overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, #D4956A 0%, #C8932A 40%, #0F2452 80%, #4A2E18 100%)' }}>
          {/* Decorative rings */}
          {[280, 220, 160].map((size, i) => (
            <div key={i} className="absolute rounded-full border opacity-10"
              style={{ width: size, height: size, top: '50%', right: -size/3, transform: 'translateY(-50%)', borderColor: 'white' }} />
          ))}
          {/* Icon */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: 40 }}>
            <span style={{ fontSize: 72, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,.2))' }}>🪔</span>
          </div>
        </div>

        {/* Gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-32"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,.65), transparent)' }} />

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-14 left-5 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(8px)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Share / Bookmark */}
        <div className="absolute top-14 right-5 flex gap-2">
          {[
            <svg key="share" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
            <svg key="bookmark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
          ].map((icon, i) => (
            <button key={i} className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(8px)' }}>
              {icon}
            </button>
          ))}
        </div>

        {/* Place info overlay */}
        <div className="absolute bottom-0 inset-x-0 px-5 pb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,.22)', color: 'rgba(255,255,255,.9)' }}>Temple</span>
            <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(39,174,96,.75)', color: 'white' }}>● Open</span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: 'white', lineHeight: 1.2, marginBottom: 6 }}>
            Govind Dev Ji Temple
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFD700">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white', fontFamily: "'Inter',sans-serif" }}>4.9</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontFamily: "'Inter',sans-serif" }}>(2.8k reviews)</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(39,174,96,.25)' }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#27AE60"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01" stroke="white" strokeWidth="2.5" fill="none"/></svg>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.9)', fontFamily: "'Inter',sans-serif" }}>Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick stats row ── */}
      <div className="grid grid-cols-3 gap-0 mx-5 mt-4 mb-4 rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,252,245,.92)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 3px 12px rgba(107,63,29,.07)' }}>
        {[
          { label: 'Followers', value: '24.5k', icon: '👥' },
          { label: 'Est. Year', value: '1590', icon: '🏛️' },
          { label: 'Distance', value: '1.2 km', icon: '📍' },
        ].map((stat, i) => (
          <div key={stat.label} className="flex flex-col items-center py-3 px-2"
            style={{ borderRight: i < 2 ? '1px solid rgba(197,138,75,.15)' : 'none' }}>
            <span style={{ fontSize: 18, marginBottom: 2 }}>{stat.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F2452', fontFamily: "'Inter',sans-serif" }}>{stat.value}</span>
            <span style={{ fontSize: 10, color: 'rgba(107,63,29,.55)', fontFamily: "'Inter',sans-serif" }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* ── Primary Donate CTA ── */}
      <div className="px-5 mb-4">
        <button
          className="w-full h-[50px] rounded-2xl flex items-center justify-center gap-2.5 font-semibold text-[15px] transition-all active:scale-[.97]"
          style={{
            background: 'linear-gradient(140deg, #C8932A 0%, #C8932A 48%, #9A7B1E 100%)',
            color: '#ffffff',
            fontFamily: "'Inter',sans-serif",
            boxShadow: '0 5px 20px rgba(169,113,66,.42), inset 0 1px 0 rgba(255,255,255,.18)',
          }}
          onClick={() => setTab('donation')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          Donate Now
        </button>
      </div>

      {/* ── Action Tabs ── */}
      <div className="px-5 mb-4">
        <Tabs
          variant="underline"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'events', label: 'Events', icon: '📅' },
            { id: 'services', label: 'Services', icon: '🙏' },
            { id: 'donation', label: 'Donation', icon: '💛' },
            { id: 'location', label: 'Location', icon: '📍' },
          ]}
        />
      </div>

      {/* ── Tab content ── */}
      <div className="px-5 pb-24">

        {/* EVENTS TAB */}
        {tab === 'events' && (
          <div>
            <h2 className="mb-3" style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452' }}>
              Upcoming Events
            </h2>
            <div className="flex flex-col gap-3">
              {EVENTS.map((event) => {
                const typeStyle = EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.Daily;
                return (
                  <div key={event.id} className="flex gap-3.5 rounded-2xl p-4 transition-all active:scale-[.98]"
                    style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
                    {/* Date badge */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                      style={{ background: 'linear-gradient(145deg,#C8932A,#9A7B1E)', boxShadow: '0 3px 10px rgba(169,113,66,.35)' }}>
                      <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>{event.date}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(253,245,232,.8)', fontFamily: "'Inter',sans-serif", letterSpacing: 0.5 }}>{event.day}</span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-[13.5px] font-semibold text-[#0F2452] leading-tight line-clamp-2"
                          style={{ fontFamily: "'Inter',sans-serif" }}>{event.title}</h3>
                        <span className="flex-shrink-0 text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: typeStyle.bg, color: typeStyle.text }}>
                          {event.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round" opacity="0.7">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style={{ fontSize: 11, color: 'rgba(107,63,29,.65)', fontFamily: "'Inter',sans-serif" }}>{event.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SERVICES TAB */}
        {tab === 'services' && (
          <div>
            <h2 className="mb-3" style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452' }}>
              Available Services
            </h2>
            <div className="flex flex-col gap-3">
              {SERVICES.map((service) => (
                <div key={service.id} className="flex items-start gap-3.5 rounded-2xl p-4"
                  style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,rgba(197,138,75,.18),rgba(169,113,66,.1))', border: '1px solid rgba(169,113,66,.25)' }}>
                    <span style={{ fontSize: 22 }}>{service.icon}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-[13.5px] font-semibold text-[#0F2452]"
                        style={{ fontFamily: "'Inter',sans-serif" }}>{service.name}</h3>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#C8932A', fontFamily: "'Inter',sans-serif", flexShrink: 0 }}>
                        {service.price === 0 ? 'Free' : `₹${service.price.toLocaleString()}`}
                      </span>
                    </div>
                    <p className="text-[11.5px] leading-relaxed mb-2"
                      style={{ color: 'rgba(107,63,29,.65)', fontFamily: "'Inter',sans-serif" }}>{service.description}</p>
                    <div className="flex items-center gap-1.5">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span style={{ fontSize: 10.5, color: '#C8932A', fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>{service.duration}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DONATION TAB */}
        {tab === 'donation' && (
          <div>
            <h2 className="mb-1" style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452' }}>
              Make a Donation
            </h2>
            <p className="text-[12px] mb-5" style={{ color: 'rgba(107,63,29,.6)', fontFamily: "'Inter',sans-serif", lineHeight: 1.55 }}>
              Your donation supports the maintenance and activities of this sacred place.
            </p>

            {donated ? (
              <div className="text-center py-8 rounded-2xl"
                style={{ background: 'rgba(39,174,96,.08)', border: '1px solid rgba(39,174,96,.2)' }}>
                <span className="text-4xl block mb-3">🙏</span>
                <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1E7E45', marginBottom: 6 }}>Thank you!</h3>
                <p style={{ fontSize: 13, color: 'rgba(30,126,69,.8)', fontFamily: "'Inter',sans-serif" }}>
                  Your donation of ₹{donationAmount?.toLocaleString()} has been received.
                </p>
                <button className="mt-4 px-4 py-2 rounded-xl text-[12px] font-semibold"
                  style={{ background: 'rgba(39,174,96,.15)', color: '#1E7E45', fontFamily: "'Inter',sans-serif" }}
                  onClick={() => { setDonated(false); setDonationAmount(null); }}>
                  Donate Again
                </button>
              </div>
            ) : (
              <>
                {/* Quick amounts */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button key={amt}
                      onClick={() => setDonationAmount(amt)}
                      className="py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-95"
                      style={{
                        fontFamily: "'Inter',sans-serif",
                        background: donationAmount === amt ? 'linear-gradient(135deg,#C8932A,#C8932A)' : 'rgba(255,252,245,.9)',
                        color: donationAmount === amt ? '#ffffff' : '#9A7B1E',
                        border: `1.5px solid ${donationAmount === amt ? 'transparent' : 'rgba(169,113,66,.25)'}`,
                        boxShadow: donationAmount === amt ? '0 3px 10px rgba(169,113,66,.35)' : 'none',
                      }}>
                      ₹{amt}
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="flex items-center gap-2 h-12 px-4 rounded-2xl mb-4"
                  style={{ background: 'rgba(255,252,245,.9)', border: '1.5px solid rgba(169,113,66,.28)', boxShadow: '0 1px 6px rgba(107,63,29,.06)' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#C8932A', fontFamily: "'Inter',sans-serif" }}>₹</span>
                  <input
                    type="number"
                    placeholder="Enter custom amount"
                    className="flex-1 bg-transparent outline-none text-[14px]"
                    style={{ color: '#0F2452', fontFamily: "'Inter',sans-serif" }}
                    onChange={(e) => setDonationAmount(Number(e.target.value) || null)}
                  />
                </div>

                {/* Payment methods */}
                <div className="flex gap-2 mb-5">
                  {['UPI', 'Card', 'Net Banking'].map((method) => (
                    <button key={method}
                      className="flex-1 py-2 rounded-xl text-[11px] font-medium transition-all"
                      style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(169,113,66,.2)', color: 'rgba(107,63,29,.7)', fontFamily: "'Inter',sans-serif" }}>
                      {method}
                    </button>
                  ))}
                </div>

                <button
                  disabled={!donationAmount}
                  onClick={() => donationAmount && setDonated(true)}
                  className="w-full h-[50px] rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[.97]"
                  style={{
                    background: donationAmount ? 'linear-gradient(140deg,#C8932A,#C8932A)' : 'rgba(169,113,66,.3)',
                    color: '#ffffff',
                    fontFamily: "'Inter',sans-serif",
                    boxShadow: donationAmount ? '0 5px 20px rgba(169,113,66,.4)' : 'none',
                    cursor: donationAmount ? 'pointer' : 'not-allowed',
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {donationAmount ? `Donate ₹${donationAmount.toLocaleString()}` : 'Select an Amount'}
                </button>
              </>
            )}
          </div>
        )}

        {/* LOCATION TAB */}
        {tab === 'location' && (
          <div>
            <h2 className="mb-3" style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452' }}>
              Location & Directions
            </h2>

            {/* Map placeholder */}
            <div className="rounded-2xl overflow-hidden mb-4 relative"
              style={{ height: 180, background: 'linear-gradient(135deg,#D4B896,#C4A880)', border: '1px solid rgba(197,138,75,.25)' }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span style={{ fontSize: 36, marginBottom: 8 }}>🗺️</span>
                <span style={{ fontSize: 12, color: '#9A7B1E', fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>Tap to open in Maps</span>
              </div>
              <div className="absolute bottom-3 right-3">
                <button className="px-3 py-1.5 rounded-xl text-[11.5px] font-semibold flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg,#C8932A,#C8932A)', color: '#ffffff', fontFamily: "'Inter',sans-serif" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Directions
                </button>
              </div>
            </div>

            {/* Address & timings */}
            <div className="rounded-2xl p-4 mb-3"
              style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
              <h3 className="text-[13px] font-semibold text-[#0F2452] mb-2" style={{ fontFamily: "'Inter',sans-serif" }}>Address</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(107,63,29,.7)', fontFamily: "'Inter',sans-serif" }}>
                City Palace Complex, Near Jantar Mantar,<br />
                Jaipur, Rajasthan 302002
              </p>
            </div>

            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(255,252,245,.9)', border: '1px solid rgba(197,138,75,.18)', boxShadow: '0 2px 10px rgba(107,63,29,.06)' }}>
              <h3 className="text-[13px] font-semibold text-[#0F2452] mb-3" style={{ fontFamily: "'Inter',sans-serif" }}>Timings</h3>
              <div className="flex flex-col gap-2">
                {[
                  { period: 'Morning', time: '4:30 AM – 12:00 PM' },
                  { period: 'Evening', time: '5:30 PM – 9:30 PM' },
                  { period: 'Special Puja', time: 'By Appointment' },
                ].map((t) => (
                  <div key={t.period} className="flex items-center justify-between">
                    <span className="text-[12px] font-medium" style={{ color: 'rgba(107,63,29,.75)', fontFamily: "'Inter',sans-serif" }}>{t.period}</span>
                    <span className="text-[12px] font-semibold" style={{ color: '#C8932A', fontFamily: "'Inter',sans-serif" }}>{t.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
