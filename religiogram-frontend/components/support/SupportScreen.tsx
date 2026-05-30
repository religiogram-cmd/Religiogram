'use client';

import { useState } from 'react';

const GOLD  = '#C8920A';
const NAVY  = '#1B2A5C';
const BG    = '#FFFBF0';
const TEXT  = '#1A0800';
const TEXT2 = '#4A3010';
const TEXT3 = '#8B6B35';
const GREY  = '#9CA3AF';
const BORDER = 'rgba(200,146,10,0.28)';
const CARD  = '#FFFAED';

interface Props {
  onBack: () => void;
}

const FAQS = [
  {
    q: 'How do I cancel a booking?',
    a: 'You can cancel from Bookings > tap booking > Cancel. Free if 48hrs before, 50% fee within 24-48hrs, no refund within 24hrs.',
  },
  {
    q: 'When will my refund be processed?',
    a: 'Refunds are processed within 3-5 business days to your original payment method, or instantly to your ReligioGram wallet.',
  },
  {
    q: 'How does per-minute billing work?',
    a: 'Online consultations are billed per minute. Each 60-second interval is charged. Partial last minute charged only if >30 seconds.',
  },
  {
    q: 'How do I report a provider?',
    a: 'Go to provider profile > scroll down > Report Provider. Our trust team reviews within 24 hours.',
  },
  {
    q: 'Why was my payment declined?',
    a: 'Check your bank for pending holds. Ensure your UPI ID is active. Try a different payment method.',
  },
];

const TICKETS = [
  { id: 'RG-T-001', subject: 'Refund for cancelled booking',          status: 'IN REVIEW', date: '2 days ago',  statusColor: '#D97706' },
  { id: 'RG-T-002', subject: 'Wrong billing amount for consultation', status: 'RESOLVED',  date: '5 days ago', statusColor: '#16A34A' },
];

const CATEGORIES = ['Refund Request', 'Provider Misconduct', 'Technical Issue', 'Wrong Charges', 'General Query'];

function statusBg(color: string) {
  return `${color}18`;
}

export default function SupportScreen({ onBack }: Props) {
  const [openFaq, setOpenFaq]           = useState<number | null>(null);
  const [showSheet, setShowSheet]       = useState(false);
  const [category, setCategory]         = useState(CATEGORIES[0]);
  const [subject, setSubject]           = useState('');
  const [description, setDescription]  = useState('');
  const [toast, setToast]               = useState('');

  const submitTicket = () => {
    const id = `RG-T-${String(Math.floor(Math.random() * 900) + 100)}`;
    setToast(`Ticket ${id} created. We'll respond within 24 hours.`);
    setShowSheet(false);
    setSubject('');
    setDescription('');
    setTimeout(() => setToast(''), 4000);
  };

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '12px 14px',
    borderRadius: 10,
    border:       `1.5px solid ${NAVY}`,
    fontSize:     14,
    background:   '#fff',
    color:        TEXT,
    fontFamily:   '"Plus Jakarta Sans",sans-serif',
    outline:      'none',
    boxSizing:    'border-box',
  };

  return (
    <div style={{ minHeight: '100svh', background: BG, paddingBottom: 180, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ background: NAVY, padding: '54px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#fff', fontSize: 20, lineHeight: 1 }}>
          ←
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: '"Playfair Display",Georgia,serif' }}>Help &amp; Support</span>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────── */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Quick Actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: '📋', label: 'Raise a Ticket',   onClick: () => setShowSheet(true), disabled: false },
            { icon: '🔄', label: 'Request Refund',   onClick: () => setShowSheet(true), disabled: false },
            { icon: '🚨', label: 'Report Provider',  onClick: () => setShowSheet(true), disabled: false },
            { icon: '💬', label: 'Live Chat',         onClick: () => {},                disabled: true  },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              style={{
                background:   CARD,
                border:       `1.5px solid ${BORDER}`,
                borderRadius: 14,
                padding:      '16px 12px',
                display:      'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor:       a.disabled ? 'not-allowed' : 'pointer',
                opacity:      a.disabled ? 0.5 : 1,
                boxShadow:    '0 2px 10px rgba(200,146,10,0.07)',
              }}
            >
              <span style={{ fontSize: 28 }}>{a.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{a.label}</span>
              {a.disabled && <span style={{ fontSize: 10, color: GREY }}>Coming soon</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Common Issues ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Common Issues
        </div>
        <div style={{ background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: TEXT }}>{faq.q}</span>
                <span style={{ fontSize: 18, color: GOLD, fontWeight: 700 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: '0 16px 14px', fontSize: 13, color: TEXT2, lineHeight: 1.65, borderTop: `1px solid ${BORDER}` }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── My Tickets ────────────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          My Tickets
        </div>
        {TICKETS.length === 0 ? (
          <div style={{ background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '32px 16px', textAlign: 'center', color: GREY, fontSize: 14 }}>
            No support tickets yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TICKETS.map(t => (
              <div key={t.id} style={{ background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif' }}>{t.id}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color:        t.statusColor,
                    background:   statusBg(t.statusColor),
                    padding:      '3px 10px',
                    borderRadius: 20,
                    border:       `1px solid ${t.statusColor}40`,
                  }}>
                    {t.status}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: TEXT, marginBottom: 4 }}>{t.subject}</div>
                <div style={{ fontSize: 11.5, color: GREY }}>{t.date}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky bottom button (lifted above the global BottomNav) ── */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        left: 0, right: 0,
        padding: '12px 16px',
        background: BG,
        borderTop: `1px solid ${BORDER}`,
        zIndex: 150,
      }}>
        <button
          onClick={() => setShowSheet(true)}
          style={{ display: 'block', width: '100%', padding: '15px 0', background: GOLD, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif' }}
        >
          + Raise New Ticket
        </button>
      </div>

      {/* ── Bottom Sheet ─────────────────────────────────────────── */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {/* Backdrop */}
          <div
            onClick={() => setShowSheet(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
          />
          <div style={{ position: 'relative', background: BG, borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', zIndex: 1 }}>
            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D1D5DB', margin: '0 auto 20px' }} />

            <h3 style={{ fontSize: 18, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginBottom: 20 }}>
              Raise a Ticket
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: TEXT2, display: 'block', marginBottom: 6 }}>Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' as const }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: TEXT2, display: 'block', marginBottom: 6 }}>Subject</label>
              <input
                placeholder="Brief subject of your issue"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: TEXT2, display: 'block', marginBottom: 6 }}>
                Description <span style={{ color: GREY, fontWeight: 400 }}>({description.length}/300)</span>
              </label>
              <textarea
                placeholder="Describe your issue in detail..."
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 300))}
                rows={4}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            <button
              onClick={submitTicket}
              disabled={!subject.trim() || !description.trim()}
              style={{
                display:      'block',
                width:        '100%',
                padding:      '15px 0',
                background:   !subject.trim() || !description.trim() ? '#E5E7EB' : GOLD,
                color:        !subject.trim() || !description.trim() ? GREY : '#fff',
                fontWeight:   700,
                fontSize:     15,
                border:       'none',
                borderRadius: 14,
                cursor:       !subject.trim() || !description.trim() ? 'not-allowed' : 'pointer',
                fontFamily:   '"Plus Jakarta Sans",sans-serif',
              }}
            >
              Submit Ticket
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:     'fixed',
          bottom:       90,
          left:         16,
          right:        16,
          background:   NAVY,
          color:        '#fff',
          padding:      '14px 18px',
          borderRadius: 12,
          fontSize:     13.5,
          fontWeight:   600,
          zIndex:       10000,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
          fontFamily:   '"Plus Jakarta Sans",sans-serif',
        }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}
