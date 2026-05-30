'use client';

import { useState } from 'react';

const NAVY = '#0F2452';
const GOLD = '#C8932A';

const SIGNS = [
  { name: 'Aries',       symbol: '♈', dates: 'Mar 21 – Apr 19', element: 'Fire',  color: '#EF4444', lucky: '9', planet: 'Mars',    gemstone: 'Red Coral',  reading: 'A surge of energy propels you forward today. Financially, an unexpected opportunity may arise — act swiftly but wisely. In love, be direct about your feelings; your partner appreciates honesty. Health-wise, watch your temper and avoid rash decisions. Lucky colour: Red.' },
  { name: 'Taurus',      symbol: '♉', dates: 'Apr 20 – May 20', element: 'Earth', color: '#22C55E', lucky: '6', planet: 'Venus',   gemstone: 'Diamond',    reading: 'Stability is your strength today. Focus on practical matters — a financial deal delayed earlier may finally close. Relationships deepen with meaningful conversations. Avoid overindulgence in food and rest. Lucky colour: Green.' },
  { name: 'Gemini',      symbol: '♊', dates: 'May 21 – Jun 20', element: 'Air',   color: '#EAB308', lucky: '5', planet: 'Mercury', gemstone: 'Emerald',    reading: 'Your communication skills shine. A new professional contact could open exciting doors. Socially vibrant, you\'ll thrive in group settings today. Keep your mind focused; dual thinking may lead to indecision. Lucky colour: Yellow.' },
  { name: 'Cancer',      symbol: '♋', dates: 'Jun 21 – Jul 22', element: 'Water', color: '#3B82F6', lucky: '2', planet: 'Moon',    gemstone: 'Pearl',      reading: 'Emotions run deep today. Home and family matters take priority. Nurture your close relationships — a heartfelt conversation heals old wounds. Career-wise, trust your intuition over logic. Lucky colour: Silver.' },
  { name: 'Leo',         symbol: '♌', dates: 'Jul 23 – Aug 22', element: 'Fire',  color: '#F97316', lucky: '1', planet: 'Sun',     gemstone: 'Ruby',       reading: 'Your natural charisma draws others to you. Leadership opportunities beckon — step up with confidence. Financially, a bonus or recognition at work is likely. In love, express your affection boldly. Lucky colour: Gold.' },
  { name: 'Virgo',       symbol: '♍', dates: 'Aug 23 – Sep 22', element: 'Earth', color: '#6B7280', lucky: '3', planet: 'Mercury', gemstone: 'Emerald',    reading: 'Precision pays off today. Complete pending tasks methodically — your attention to detail earns appreciation. Avoid over-analysis in relationships. A health routine you start today will yield lasting benefits. Lucky colour: Earthy Brown.' },
  { name: 'Libra',       symbol: '♎', dates: 'Sep 23 – Oct 22', element: 'Air',   color: '#8B5CF6', lucky: '6', planet: 'Venus',   gemstone: 'Diamond',    reading: 'Harmony and balance are your themes today. A long-standing conflict may find peaceful resolution. Professionally, collaborations are favoured over solo efforts. In romance, small gestures make a big impact. Lucky colour: Pink.' },
  { name: 'Scorpio',     symbol: '♏', dates: 'Oct 23 – Nov 21', element: 'Water', color: '#DC2626', lucky: '8', planet: 'Mars',    gemstone: 'Red Coral',  reading: 'Your intuition is razor-sharp today. Trust your gut in financial matters — hidden information may surface. In love, deep emotional intimacy is possible if you open up. Avoid power struggles. Lucky colour: Maroon.' },
  { name: 'Sagittarius', symbol: '♐', dates: 'Nov 22 – Dec 21', element: 'Fire',  color: '#7C3AED', lucky: '3', planet: 'Jupiter', gemstone: 'Yellow Sapphire', reading: 'Expansion and adventure are calling. A travel opportunity or higher education prospect may arise. Your optimism inspires those around you. Be cautious with overspending. Lucky colour: Purple.' },
  { name: 'Capricorn',   symbol: '♑', dates: 'Dec 22 – Jan 19', element: 'Earth', color: '#1D4ED8', lucky: '8', planet: 'Saturn',  gemstone: 'Blue Sapphire', reading: 'Discipline and ambition lead you to success today. A career milestone is within reach — stay focused. Financially conservative decisions prove wise. Take time to rest and recharge. Lucky colour: Dark Blue.' },
  { name: 'Aquarius',    symbol: '♒', dates: 'Jan 20 – Feb 18', element: 'Air',   color: '#0EA5E9', lucky: '4', planet: 'Saturn',  gemstone: 'Blue Sapphire', reading: 'Innovation is your superpower today. A creative idea at work gets positive reception. Social causes you care about gain momentum. Relationships benefit from intellectual exchanges. Lucky colour: Electric Blue.' },
  { name: 'Pisces',      symbol: '♓', dates: 'Feb 19 – Mar 20', element: 'Water', color: '#10B981', lucky: '7', planet: 'Jupiter', gemstone: 'Yellow Sapphire', reading: 'Your spiritual sensitivity is heightened. Creative and artistic endeavours flow effortlessly. Financial matters require attention — avoid lending money today. Love is tender and magical. Lucky colour: Sea Green.' },
];

export default function HoroscopeTab() {
  const [selected, setSelected] = useState<(typeof SIGNS)[0] | null>(null);

  if (selected) {
    return (
      <div style={{ background: '#F6F7FA', minHeight: '100%', paddingBottom: 100 }}>
        {/* Back header */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
          padding: '16px 16px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{ border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Daily Horoscope</p>
            <p style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}>{selected.symbol} {selected.name}</p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 16 }}>
          {/* Sign card */}
          <div style={{
            background: '#fff', borderRadius: 16,
            padding: 20, marginBottom: 14,
            boxShadow: '0 2px 12px rgba(15,36,82,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: selected.color + '20', border: `2px solid ${selected.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32,
              }}>{selected.symbol}</div>
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: NAVY }}>{selected.name}</p>
                <p style={{ margin: '2px 0', fontSize: 12, color: '#64748b' }}>{selected.dates}</p>
                <span style={{
                  background: selected.color + '20', color: selected.color,
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                }}>{selected.element}</span>
              </div>
            </div>

            {/* Daily reading */}
            <div style={{ background: '#F8F9FF', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's Reading</p>
              <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.65 }}>{selected.reading}</p>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Ruling Planet', value: selected.planet, icon: '🪐' },
                { label: 'Lucky Number', value: selected.lucky, icon: '🔢' },
                { label: 'Gemstone', value: selected.gemstone, icon: '💎' },
                { label: 'Element', value: selected.element, icon: '✨' },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{
                  background: '#F6F7FA', borderRadius: 10, padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8' }}>{icon} {label}</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: NAVY }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Consult CTA */}
          <div style={{
            background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
            borderRadius: 14, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>Want a detailed reading?</p>
              <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Consult an expert astrologer now</p>
            </div>
            <button
              style={{
                background: GOLD, color: '#fff', border: 'none',
                borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Consult
            </button>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ background: '#F6F7FA', minHeight: '100%', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
        padding: '16px 16px 20px',
      }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Daily Horoscope</p>
        <p style={{ margin: '2px 0 0', color: '#fff', fontSize: 17, fontWeight: 700 }}>{today}</p>
      </div>

      {/* Signs grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, padding: '14px 14px 14px',
      }}>
        {SIGNS.map(s => (
          <button
            key={s.name}
            onClick={() => setSelected(s)}
            style={{
              background: '#fff', borderRadius: 14, padding: '14px 8px',
              border: '1px solid rgba(15,36,82,0.08)',
              boxShadow: '0 2px 8px rgba(15,36,82,0.06)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              textAlign: 'center',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: s.color + '15', border: `1.5px solid ${s.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>{s.symbol}</div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: NAVY }}>{s.name}</p>
            <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', lineHeight: 1.3 }}>{s.dates}</p>
            <span style={{
              background: s.color + '15', color: s.color,
              borderRadius: 5, padding: '1px 6px', fontSize: 9, fontWeight: 600,
            }}>{s.element}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
