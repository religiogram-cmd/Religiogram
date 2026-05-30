'use client';
import { useState } from 'react';
import { UserReligion } from '@/lib/useReligion';

const GOLD  = '#C8920A';
const GOLD2 = '#E8C050';
const NAVY  = '#0A1628';
const PARCH = '#FFFBF0';

/* ── Faith SVG Icons ─────────────────────────────────────────────── */
function FaithSymbol({ k, active }: { k: string; active: boolean }) {
  const col = active ? NAVY : GOLD2;
  if (k === 'hindu') return (
    <span style={{ fontSize:32, fontWeight:900, color:col, fontFamily:"Georgia,'Times New Roman',serif", lineHeight:1 }}>ॐ</span>
  );
  if (k === 'muslim') return (
    <svg width="30" height="28" viewBox="0 0 24 22" fill="none">
      <path d="M20 11a8 8 0 1 1-8-8 6 6 0 0 0 8 8z" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="16,3 17,6.2 20.4,6.2 17.7,8.1 18.7,11.3 16,9.4 13.3,11.3 14.3,8.1 11.6,6.2 15,6.2" fill={col}/>
    </svg>
  );
  if (k === 'sikh') return (
    <svg width="28" height="30" viewBox="0 0 22 24" fill={col}>
      <line x1="11" y1="0" x2="11" y2="24" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="11" cy="12" r="5.5" stroke={col} strokeWidth="2" fill="none"/>
      <path d="M11 1 L5 7 L11 6 L17 7 Z" fill={col}/>
      <path d="M11 23 L5 17 L11 18 L17 17 Z" fill={col}/>
    </svg>
  );
  if (k === 'christian') return (
    <svg width="22" height="30" viewBox="0 0 18 24" fill={col}>
      <rect x="7.5" y="0" width="3" height="24" rx="1.5"/>
      <rect x="0" y="7" width="18" height="3" rx="1.5"/>
    </svg>
  );
  /* All Faiths */
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill={col}>
      <path d="M12 2l2.09 6.26L20.18 6l-3.45 5.5 6.27 2.09-6.27 2.09 3.45 5.5-6.09-2.26L12 22l-2.09-6.26L3.82 18l3.45-5.5L1 10.41l6.27-2.09L4.18 3l6.09 2.26z"/>
    </svg>
  );
}

const OPTIONS: { key: UserReligion; label: string; sub: string }[] = [
  { key: 'all',       label: 'All Faiths', sub: 'Explore every place of worship' },
  { key: 'hindu',     label: 'Hindu',      sub: 'Temples & Hindu sacred sites'    },
  { key: 'muslim',    label: 'Muslim',     sub: 'Mosques & Islamic sacred sites'  },
  { key: 'sikh',      label: 'Sikh',       sub: 'Gurudwaras & Sikh sacred sites'  },
  { key: 'christian', label: 'Christian',  sub: 'Churches & Christian sacred sites' },
];

interface Props { onConfirm: (r: UserReligion) => void; }

export default function ReligionPicker({ onConfirm }: Props) {
  const [selected, setSelected] = useState<UserReligion | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:NAVY, display:'flex', flexDirection:'column', overflowY:'auto' }}>

      {/* Top decorative band */}
      <div style={{ height:4, background:`linear-gradient(90deg,transparent,${GOLD},${GOLD2},${GOLD},transparent)` }} />

      {/* Hero area */}
      <div style={{ padding:'36px 24px 24px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <div style={{ height:1, width:28, background:GOLD2, opacity:.7 }} />
          <span style={{ fontSize:10, color:GOLD2, fontWeight:700, letterSpacing:3.5, textTransform:'uppercase' }}>Faith Preference</span>
          <div style={{ height:1, width:28, background:GOLD2, opacity:.7 }} />
        </div>
        <h1 style={{ fontSize:26, fontWeight:900, color:'#FFFDF5', fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.15, margin:'0 0 12px' }}>
          Welcome to ReligioGram
        </h1>
        <p style={{ fontSize:13, color:'rgba(255,253,245,.65)', lineHeight:1.65, margin:'0 auto', maxWidth:300, fontWeight:400 }}>
          To personalise your spiritual journey, please select your faith preference. We'll tailor your places of worship, guides, and content accordingly.
        </p>
      </div>

      {/* Divider */}
      <div style={{ margin:'0 24px 20px', height:'1px', background:`linear-gradient(90deg,transparent,rgba(200,146,10,.35),transparent)` }} />

      {/* Options */}
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10, flex:1 }}>
        {OPTIONS.map(opt => {
          const active = selected === opt.key;
          return (
            <button key={opt.key} onClick={() => setSelected(opt.key)}
              style={{
                display:'flex', alignItems:'center', gap:16,
                padding:'14px 18px',
                borderRadius:16,
                border:`1.8px solid ${active ? GOLD2 : 'rgba(200,146,10,.22)'}`,
                background: active
                  ? `linear-gradient(135deg,${GOLD2},${GOLD})`
                  : 'rgba(255,255,255,.04)',
                cursor:'pointer',
                textAlign:'left',
                boxShadow: active ? `0 4px 20px rgba(200,146,10,.40)` : '0 2px 8px rgba(0,0,0,.20)',
                transition:'all 0.18s ease',
              }}>
              <div style={{ width:48, height:48, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', background: active ? 'rgba(10,22,40,.15)' : 'rgba(200,146,10,.10)', flexShrink:0 }}>
                <FaithSymbol k={opt.key} active={active} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, color: active ? NAVY : '#FFFDF5', fontFamily:"'Playfair Display',Georgia,serif", marginBottom:2 }}>{opt.label}</div>
                <div style={{ fontSize:11.5, color: active ? 'rgba(10,22,40,.65)' : 'rgba(255,253,245,.50)', fontWeight:400 }}>{opt.sub}</div>
              </div>
              {/* Checkmark */}
              <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${active ? NAVY : 'rgba(200,146,10,.30)'}`, background: active ? NAVY : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {active && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={GOLD2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{ padding:'24px 20px 36px' }}>
        <button
          onClick={() => selected && setShowConfirm(true)}
          disabled={!selected}
          style={{
            width:'100%', padding:'16px', borderRadius:14, border:'none',
            background: selected ? `linear-gradient(135deg,${GOLD},${GOLD2})` : 'rgba(255,255,255,.10)',
            color: selected ? NAVY : 'rgba(255,255,255,.25)',
            fontSize:15, fontWeight:900, fontFamily:"'Playfair Display',serif",
            cursor: selected ? 'pointer' : 'not-allowed',
            boxShadow: selected ? `0 6px 24px rgba(200,146,10,.45)` : 'none',
            transition:'all 0.18s',
          }}>
          Continue with {selected ? OPTIONS.find(o => o.key === selected)?.label : 'your faith'} →
        </button>
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirm && selected && (
        <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 24px' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)' }} onClick={() => setShowConfirm(false)} />
          <div style={{ position:'relative', background:PARCH, borderRadius:20, padding:'28px 24px', width:'100%', maxWidth:360, boxShadow:'0 20px 60px rgba(0,0,0,.50)' }}>

            {/* Icon */}
            <div style={{ width:52, height:52, borderRadius:14, background:`linear-gradient(135deg,${GOLD},${GOLD2})`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l2.09 6.26L20.18 6l-3.45 5.5 6.27 2.09-6.27 2.09 3.45 5.5-6.09-2.26L12 22l-2.09-6.26L3.82 18l3.45-5.5L1 10.41l6.27-2.09L4.18 3l6.09 2.26z" fill={NAVY}/>
              </svg>
            </div>

            <h2 style={{ fontSize:19, fontWeight:900, color:NAVY, fontFamily:"'Playfair Display',Georgia,serif", textAlign:'center', margin:'0 0 10px' }}>
              Personalise Your Sacred Journey
            </h2>
            <p style={{ fontSize:12.5, color:'rgba(10,22,40,.65)', lineHeight:1.7, textAlign:'center', margin:'0 0 6px' }}>
              You are setting your faith preference to{' '}
              <strong style={{ color:GOLD }}>{OPTIONS.find(o => o.key === selected)?.label}</strong>.
            </p>
            <p style={{ fontSize:12.5, color:'rgba(10,22,40,.65)', lineHeight:1.7, textAlign:'center', margin:'0 0 22px' }}>
              This will personalise your entire experience — places of worship, spiritual guides, and curated content. You can update this preference anytime from <strong style={{ color:NAVY }}>Profile → Settings</strong>.
            </p>

            {/* Divider */}
            <div style={{ height:1, background:`rgba(200,146,10,.20)`, margin:'0 0 18px' }} />

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex:1, padding:'12px', borderRadius:10, border:`1.5px solid rgba(200,146,10,.35)`, background:'transparent', color:'rgba(10,22,40,.60)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Choose Again
              </button>
              <button onClick={() => { setShowConfirm(false); onConfirm(selected); }}
                style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:`linear-gradient(135deg,${GOLD},${GOLD2})`, color:NAVY, fontSize:13, fontWeight:900, fontFamily:"'Playfair Display',serif", cursor:'pointer', boxShadow:`0 4px 16px rgba(200,146,10,.40)` }}>
                Confirm Preference
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
