import { ImageResponse } from 'next/og';

/**
 * Dynamic OpenGraph image for religiogram.com.
 *
 * Vercel generates this at build/edge time and serves it at
 * `/opengraph-image` — same file that the root layout metadata
 * `openGraph.images` and `twitter.images` implicitly point to.
 *
 * Why dynamic instead of a static JPG in /public?
 *   - Edits ship with a git push (no image editor round-trip)
 *   - Fonts + gradients stay pixel-perfect with the brand
 *   - Sizes right for every social platform (WhatsApp / X / LinkedIn /
 *     Facebook all pull the same 1200×630)
 */

export const runtime = 'edge';
export const alt = 'ReligioGram — Book Verified Pandits, Priests & Astrologers Online in India';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F2452 0%, #1A3168 45%, #0F2452 100%)',
          color: '#FFFAEC',
          padding: '80px 100px',
          fontFamily: '"Playfair Display", Georgia, serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative gold accent — top-left */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -80,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(200,147,42,0.35) 0%, rgba(200,147,42,0) 70%)',
            display: 'flex',
          }}
        />
        {/* Decorative gold accent — bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            right: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(200,147,42,0.28) 0%, rgba(200,147,42,0) 70%)',
            display: 'flex',
          }}
        />

        {/* Brand mark row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 42,
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #E0A92F 0%, #C8932A 50%, #9A6F15 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 52,
              fontWeight: 900,
              color: '#0F2452',
              boxShadow: '0 8px 24px rgba(200,147,42,0.35)',
              fontFamily: '"Playfair Display", Georgia, serif',
            }}
          >
            R
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#C8932A',
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
            }}
          >
            ReligioGram
            <span style={{ fontSize: 46, color: '#E0A92F' }}>✦</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 54,
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.15,
            marginBottom: 24,
            maxWidth: 960,
            letterSpacing: '-0.015em',
            display: 'flex',
          }}
        >
          Book Verified Pandits, Priests &amp; Astrologers Online
        </div>

        {/* Sub headline */}
        <div
          style={{
            fontSize: 30,
            fontWeight: 500,
            color: 'rgba(255,250,236,0.78)',
            textAlign: 'center',
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
            display: 'flex',
          }}
        >
          Multi-faith · Live consultations · Holy places · India
        </div>

        {/* Faith pills row */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 40,
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
          }}
        >
          {['Hindu', 'Muslim', 'Sikh', 'Christian'].map((f) => (
            <div
              key={f}
              style={{
                padding: '10px 22px',
                borderRadius: 999,
                border: '1.5px solid rgba(200,147,42,0.55)',
                background: 'rgba(200,147,42,0.12)',
                color: '#E0A92F',
                fontSize: 22,
                fontWeight: 700,
                display: 'flex',
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* Footer URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 42,
            fontSize: 22,
            color: 'rgba(255,250,236,0.55)',
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
            fontWeight: 600,
            letterSpacing: '0.06em',
            display: 'flex',
          }}
        >
          religiogram.com
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
