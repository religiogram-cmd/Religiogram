'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown'; // v9 (P1-1)

const NAVY = '#0F2452';
const GOLD  = '#C8932A';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

/* ── Types ─────────────────────────────────────────────────────── */
interface Message {
  role: 'user' | 'ai';
  text: string;
  ts: number;
}

/* ── Suggested prompts ─────────────────────────────────────────── */
const SUGGESTIONS = [
  'What does my sun sign say about me?',
  'Explain Rahu and Ketu in my chart',
  'What is a Kundli and how is it made?',
  'Which gemstone suits Scorpio?',
  'What is Shani Sade Sati?',
  'Best career for Capricorn rising?',
];

/* ── API call ──────────────────────────────────────────────────── */
async function askAstroAI(message: string, history: Message[]): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/astrology/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: history.slice(-10).map(m => ({ role: m.role, text: m.text })),
      }),
    });
    if (!res.ok) throw new Error('server error');
    const data = await res.json();
    return data.reply ?? 'I could not fetch a response. Please try again.';
  } catch {
    return localAstroReply(message);
  }
}

/* ── Offline fallback with deep astrology knowledge ───────────── */
function localAstroReply(q: string): string {
  const lq = q.toLowerCase();

  if (/kundli|birth.?chart|natal/.test(lq))
    return `A Kundli (birth chart) is the cornerstone of Vedic astrology. It maps the exact positions of the 9 planets (Navagraha) across the 12 houses (Bhavas) at the moment of your birth.\n\n🪐 Key elements:\n• Lagna (Ascendant) — your outer personality\n• Moon sign (Rashi) — your mind & emotions\n• Sun sign — your soul & vitality\n• 9 planets in 12 houses\n• 27 Nakshatras\n\nTo get your Kundli, you need your exact date, time and place of birth. Ask me about any specific house or planet for deeper insight!`;

  if (/nakshatra/.test(lq))
    return `The 27 Nakshatras are lunar mansions in Vedic astrology, each spanning 13°20' of the zodiac. They reveal your deeper nature beyond just your Rashi.\n\n✨ Important Nakshatras:\n• Ashwini — healer, swift action (0°–13°20' Aries)\n• Rohini — beauty, fertility, Moon's favourite (10°–23°20' Taurus)\n• Ardra — storm, transformation (6°40'–20° Gemini)\n• Pushya — nourishment, most auspicious (3°20'–16°40' Cancer)\n• Magha — ancestral power, royalty (0°–13°20' Leo)\n• Chitra — creativity, architects (23°20' Virgo–6°40' Libra)\n• Jyeshtha — seniority, leadership (16°40'–30° Scorpio)\n• Mula — roots, liberation (0°–13°20' Sagittarius)\n• Shravana — learning, Vishnu (10°–23°20' Capricorn)\n• Revati — completion, journey (16°40'–30° Pisces)\n\nWhat is your birth Nakshatra? I can give a detailed reading!`;

  if (/rahu|ketu|shadow.?planet|north.?node|south.?node/.test(lq))
    return `Rahu and Ketu are the shadow planets (Chaya Graha) — they are the lunar nodes where the Moon's orbit intersects Earth's orbit.\n\n🌑 Rahu (North Node):\n• Represents worldly desires, ambition, illusion, foreign lands\n• Exalted in Taurus/Gemini, debilitated in Scorpio/Sagittarius\n• Gemstone: Hessonite (Gomed)\n• Rules: sudden events, technology, politics\n\n🌒 Ketu (South Node):\n• Represents spirituality, past-life karma, liberation (Moksha)\n• Exalted in Scorpio/Sagittarius, debilitated in Taurus/Gemini\n• Gemstone: Cat's Eye (Lehsunia)\n• Rules: mysticism, isolation, healing\n\nRahu-Ketu transit every 18 months and Rahu Mahadasha lasts 18 years in Vimshottari Dasha. Need more on their transits?`;

  if (/sade.?sati|shani|saturn.?return/.test(lq))
    return `Shani Sade Sati is a 7.5-year period when Saturn (Shani) transits through the 12th, 1st and 2nd houses from your natal Moon sign.\n\n⚖️ The three phases:\n1. Rising (12th from Moon) — mental stress, expenses increase\n2. Peak (1st/Moon sign) — health, career challenges\n3. Setting (2nd from Moon) — family, financial matters\n\n🕉 Remedies for Sade Sati:\n• Recite Hanuman Chalisa every Saturday\n• Donate black sesame seeds, mustard oil on Saturdays\n• Wear blue sapphire (only after consultation)\n• Feed crows on Saturdays\n• Visit Shani temple, light sesame oil lamp\n• Chant: "Om Sham Shanicharaya Namah" 108 times\n\nSade Sati is not always negative — it brings discipline, hard work and eventual growth. Which Rashi are you?`;

  if (/gemstone|ratna|ruby|emerald|diamond|sapphire|pearl/.test(lq))
    return `Gemstones (Ratna) are prescribed in Vedic astrology to strengthen weak or benefic planets:\n\n💎 Planetary Gemstones:\n• Sun → Ruby (Manikya)\n• Moon → Pearl (Moti)\n• Mars → Red Coral (Moonga)\n• Mercury → Emerald (Panna)\n• Jupiter → Yellow Sapphire (Pukhraj)\n• Venus → Diamond (Heera) or White Sapphire\n• Saturn → Blue Sapphire (Neelam)\n• Rahu → Hessonite (Gomed)\n• Ketu → Cat's Eye (Lehsunia)\n\n⚠️ Important: Always consult an experienced astrologer before wearing gemstones. The wrong stone can increase malefic effects. The stone must be worn on the correct finger, day, and metal.\n\nWould you like to know which gemstone suits your chart?`;

  if (/dasha|mahadasha|antardasha/.test(lq))
    return `The Vimshottari Dasha system is the primary timing tool in Vedic astrology. It divides life into planetary periods (Mahadasha) totalling 120 years:\n\n🕰 Dasha Cycle:\n• Sun — 6 years\n• Moon — 10 years\n• Mars — 7 years\n• Rahu — 18 years\n• Jupiter — 16 years\n• Saturn — 19 years\n• Mercury — 17 years\n• Ketu — 7 years\n• Venus — 20 years\n\nEach Mahadasha is further divided into Antardashas (sub-periods). The current dasha reveals the major theme of your life phase.\n\nThe dasha sequence starts from your birth Nakshatra's ruling planet. Want me to explain the effects of a specific Mahadasha?`;

  if (/house|bhava|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth/.test(lq))
    return `The 12 Bhavas (Houses) in a Kundli each govern specific life domains:\n\n🏠 The 12 Houses:\n1st — Self, appearance, health (Lagna)\n2nd — Wealth, family, speech\n3rd — Siblings, courage, short travel\n4th — Mother, home, vehicles, happiness\n5th — Children, education, romance, creativity\n6th — Enemies, disease, service, litigation\n7th — Marriage, partnerships, business\n8th — Longevity, inheritance, secrets, transformation\n9th — Luck, dharma, father, higher learning\n10th — Career, fame, authority (most powerful)\n11th — Gains, income, social networks\n12th — Expenses, spirituality, foreign, liberation\n\nKendras (1,4,7,10) are the most powerful. Trikonas (1,5,9) are the most auspicious. Which house would you like to explore?`;

  if (/compatibility|synastry|marriage|partner|match/.test(lq))
    return `In Vedic astrology, marriage compatibility is assessed through Kundli Milan (chart matching) using the Ashtakoota (8-point) system:\n\n💑 Ashtakoota Points (36 total):\n• Varna (1pt) — spiritual compatibility\n• Vasya (2pt) — attraction, control\n• Tara (3pt) — health, longevity\n• Yoni (4pt) — physical/intimate compatibility\n• Graha Maitri (5pt) — mental compatibility\n• Gana (6pt) — temperament match\n• Bhakut (7pt) — health, wealth, family\n• Nadi (8pt) — genetic compatibility (most important)\n\n✅ 18+ points: Acceptable\n✅ 24+ points: Good\n✅ 30+ points: Excellent\n\nBeyond points, astrologers also check Mangal Dosha, Nadi Dosha, 7th house lord compatibility, and Dasha periods.\n\nWhat are your and your partner's Rashis? I can give a quick compatibility overview!`;

  if (/aries|mesha/.test(lq))
    return `♈ Aries (Mesha Rashi)\n\nElement: Fire | Quality: Cardinal | Ruling Planet: Mars (Mangal)\n\n🌟 Personality: Bold, pioneering, energetic, impulsive, natural leader. First sign of the zodiac — you initiate action.\n\n💪 Strengths: Courage, enthusiasm, confidence, determination\n⚠️ Challenges: Impatience, aggression, selfishness\n\n🪐 Vedic perspective: Mars-ruled Mesha natives are warriors at heart. Ashwini Nakshatra (ruled by Ketu) gives healing ability. Bharani (Venus) brings creativity and sensuality.\n\n💎 Lucky Gemstone: Red Coral (Moonga)\n🎨 Lucky Color: Red, orange\n📅 Best days: Tuesday\n\nCompatible with: Leo, Sagittarius, Gemini\nChallenging with: Cancer, Capricorn\n\nAsk me about your rising sign or Moon sign for a fuller picture!`;

  if (/taurus|vrishabha/.test(lq))
    return `♉ Taurus (Vrishabha Rashi)\n\nElement: Earth | Quality: Fixed | Ruling Planet: Venus (Shukra)\n\n🌟 Personality: Patient, reliable, sensual, devoted, lover of beauty and comfort.\n\n💪 Strengths: Dependability, persistence, loyalty, practicality\n⚠️ Challenges: Stubbornness, possessiveness, resistance to change\n\n🪐 Vedic: Rohini Nakshatra (Moon exalted here) gives exceptional charisma and creative talent.\n\n💎 Lucky Gemstone: Diamond or White Sapphire\n🎨 Lucky Color: Green, white, pink\n📅 Best days: Friday\n\nMost compatible with: Virgo, Capricorn, Cancer`;

  if (/leo|simha/.test(lq))
    return `♌ Leo (Simha Rashi)\n\nElement: Fire | Quality: Fixed | Ruling Planet: Sun (Surya)\n\n🌟 Personality: Regal, generous, dramatic, loyal, creative, natural performer and leader.\n\n💪 Strengths: Confidence, generosity, warmth, leadership\n⚠️ Challenges: Pride, stubbornness, need for validation\n\n🪐 Vedic: Magha Nakshatra (Ketu-ruled) gives ancestral power and royal bearing. Purva Phalguni (Venus) brings luxury and love.\n\n💎 Lucky Gemstone: Ruby (Manikya)\n🎨 Lucky Color: Gold, orange, yellow\n📅 Best days: Sunday\n\nMost compatible with: Aries, Sagittarius, Gemini`;

  if (/scorpio|vrishchika/.test(lq))
    return `♏ Scorpio (Vrishchika Rashi)\n\nElement: Water | Quality: Fixed | Ruling Planet: Mars (Mangal)\n\n🌟 Personality: Intense, mysterious, passionate, transformative, deeply intuitive.\n\n💪 Strengths: Determination, resourcefulness, emotional depth, loyalty\n⚠️ Challenges: Jealousy, secretiveness, vengefulness\n\n🪐 Vedic: Jyeshtha Nakshatra (Mercury-ruled) brings leadership and authority. Anuradha (Saturn) gives discipline and devotion.\n\n💎 Lucky Gemstone: Red Coral (Moonga)\n🎨 Lucky Color: Dark red, maroon\n📅 Best days: Tuesday\n\nMost compatible with: Cancer, Pisces, Virgo`;

  if (/pisces|meena/.test(lq))
    return `♓ Pisces (Meena Rashi)\n\nElement: Water | Quality: Mutable | Ruling Planet: Jupiter (Guru)\n\n🌟 Personality: Compassionate, intuitive, artistic, spiritual, empathetic dreamer.\n\n💪 Strengths: Creativity, empathy, adaptability, spiritual insight\n⚠️ Challenges: Indecision, escapism, over-sensitivity\n\n🪐 Vedic: Revati Nakshatra (Mercury-ruled, last nakshatra) represents completion of the cosmic cycle — deeply spiritual.\n\n💎 Lucky Gemstone: Yellow Sapphire (Pukhraj)\n🎨 Lucky Color: Sea green, purple, white\n📅 Best days: Thursday\n\nMost compatible with: Cancer, Scorpio, Capricorn`;

  if (/remedy|upay|puja|mantra|worship/.test(lq))
    return `Astrological Remedies (Upay) are prescribed to strengthen benefic planets and pacify malefic ones:\n\n🕉 Types of Remedies:\n\n1. Mantra — Chanting planetary mantras 108 times\n   • Sun: "Om Hraam Hreem Hraum Sah Suryaya Namah"\n   • Moon: "Om Shraam Shreem Shraum Sah Chandraya Namah"\n   • Mars: "Om Kraam Kreem Kraum Sah Bhaumaya Namah"\n   • Saturn: "Om Praam Preem Praum Sah Shanaischaraya Namah"\n\n2. Dana (Charity) — Donating items on the planet's day\n3. Gemstones — Wearing appropriate Ratna\n4. Fasting — On the planet's ruling day\n5. Yantra — Sacred geometric diagrams\n6. Puja/Havan — Ritual worship at temples\n\nWhat specific planet or issue would you like remedies for?`;

  // Generic astrology response
  const greetings = [
    `Namaste! 🙏 I am ReligioGram AI, your guide to the cosmic wisdom of astrology.\n\nI can help you with:\n✨ Western zodiac signs & horoscopes\n🕉 Vedic Jyotish & Kundli readings\n🪐 Navagraha (9 planets) & their effects\n🌙 Nakshatra (27 lunar mansions)\n⭐ Dasha systems & timing\n💎 Gemstone & remedy recommendations\n💑 Compatibility & Kundli Milan\n\nAsk me anything about your birth chart, zodiac sign, planetary transits, or spiritual remedies. What would you like to explore?`,
    `The stars have a message for you! ✨\n\nI'm ReligioGram AI, combining ancient Vedic Jyotish wisdom with Western astrology.\n\nTry asking:\n• "What is my rising sign?"\n• "Explain Shani Sade Sati"\n• "Which gemstone suits Scorpio?"\n• "What does the 10th house represent?"\n• "How do I read a Kundli?"\n\nThe cosmos awaits your question. 🌌`,
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/* ── Component ─────────────────────────────────────────────────── */
export default function AstroAIChat() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    role: 'ai',
    text: `Namaste! 🙏 I am **ReligioGram AI**, your personal astrology guide.\n\nAsk me about your zodiac sign, Kundli, Nakshatra, planetary remedies, compatibility, and more. I combine the wisdom of Vedic Jyotish and Western astrology.\n\nWhat cosmic question can I answer for you today? ✨`,
    ts: Date.now(),
  }]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, messages]);

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', text: q, ts: Date.now() };
    setMessages((prev: any) => [...prev, userMsg]);
    setLoading(true);
    const reply = await askAstroAI(q, [...messages, userMsg]);
    setMessages((prev: any) => [...prev, { role: 'ai', text: reply, ts: Date.now() }]);
    setLoading(false);
  }, [input, loading, messages]);

  /* Format bold text */
  // P0-7 (v4): HTML-escape first, then re-introduce the two safe tokens.
  // Prevents stored XSS via prompt-injected Gemini output or RAG poisoning.
  const fmt = (t: string) => {
    const esc = (t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return esc
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        id="astro-ai-trigger"
        onClick={() => setOpen(true)}
        className="fixed z-30 flex items-center gap-2 shadow-2xl active:scale-95 transition-transform"
        style={{
          bottom: 'calc(78px + env(safe-area-inset-bottom))',
          right: 16,
          background: `linear-gradient(135deg, #0F2452 0%, #0F2452 100%)`,
          border: `1.5px solid ${GOLD}`,
          borderRadius: 999,
          padding: '10px 18px 10px 14px',
          boxShadow: `0 8px 28px rgba(15,36,82,.45), 0 2px 8px rgba(200,147,42,0.25)`,
        }}
        aria-label="Open ReligioGram AI"
      >
        <span style={{ fontSize: 20 }}>✨</span>
        <span className="text-[13px] font-bold text-white">ReligioGram AI</span>
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex flex-col"
          style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 flex flex-col"
            style={{
              height: '88vh',
              background: '#F6F7FA',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -8px 40px rgba(15,36,82,.2)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ background: `linear-gradient(160deg, #0F2452 0%, #0F2452 55%, #2C5282 100%)`, borderRadius: '24px 24px 0 0' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[18px]"
                  style={{ background: `${GOLD}25`, border: `1px solid ${GOLD}50` }}>✨</div>
                <div>
                  <p className="text-[15px] font-bold text-white leading-tight">ReligioGram AI</p>
                  <p className="text-[11px]" style={{ color: `${GOLD}cc` }}>Your Cosmic Astrology Guide</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 18 }}>
                ×
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ gap: 12, display: 'flex', flexDirection: 'column' }}>
              {messages.map((m: any, i: any) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'ai' && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0 mr-2 mt-0.5"
                      style={{ background: `${NAVY}15`, border: `1px solid ${NAVY}20` }}>✨</div>
                  )}
                  <div
                    className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed"
                    style={m.role === 'user'
                      ? { background: NAVY, color: '#fff', borderBottomRightRadius: 6 }
                      : { background: '#fff', color: '#1A1A2E', border: '1px solid rgba(15,36,82,.1)', borderBottomLeftRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
                  >
                    {/* v9 (P1-1 fix): no more dangerouslySetInnerHTML. SafeMarkdown
                        parses the supported tokens into React nodes directly so
                        prompt-injected Gemini output can never reach the DOM as HTML. */}
                    <SafeMarkdown text={m.text} />
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0 mr-2 mt-0.5"
                    style={{ background: `${NAVY}15`, border: `1px solid ${NAVY}20` }}>✨</div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1.5"
                    style={{ background: '#fff', border: '1px solid rgba(15,36,82,.1)' }}>
                    {[0,1,2].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: NAVY, opacity: 0.6, animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && !loading && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[11.5px] font-medium whitespace-nowrap"
                    style={{ background: `${NAVY}0D`, color: NAVY, border: `1px solid ${NAVY}20` }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(0,0,0,.07)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Ask about your zodiac, kundli, remedies..."
                  className="flex-1 h-11 px-4 rounded-2xl text-[14px] outline-none"
                  style={{ background: '#F6F7FA', border: '1.5px solid #E4E6EF', color: '#0F172A', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
                  style={{ background: `linear-gradient(135deg, #0F2452, #0F2452)`, border: `1px solid ${GOLD}40`, boxShadow: '0 2px 8px rgba(15,36,82,0.3)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
