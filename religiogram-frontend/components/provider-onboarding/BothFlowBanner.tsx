'use client';

/**
 * Banner displayed between step 6 (last priest step) and step 7 (first
 * astrologer step) of the "Both" flow so the user has an obvious visual
 * cue that we're transitioning from the ceremony side of their profile to
 * the astrology side. Without it, the sudden change in question style
 * looks like a bug or a wrong screen.
 *
 * We render it as a slim strip below the WizardShell header via the
 * shell's `banner` prop — it inherits the shell's background so it feels
 * of a piece, not tacked on.
 */

export default function BothFlowBanner({
  side,
}: {
  side: 'astrology' | 'priest';
}) {
  const isAstro = side === 'astrology';
  return (
    <div
      className="px-5 py-3 border-b border-[#0F2452]/10"
      style={{
        background: isAstro
          ? 'linear-gradient(90deg, rgba(106,90,205,0.08), rgba(200,147,42,0.06))'
          : 'linear-gradient(90deg, rgba(220,20,60,0.06), rgba(200,147,42,0.06))',
      }}
    >
      <div className="max-w-xl mx-auto flex items-start gap-3">
        <span
          aria-hidden
          className="inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          style={{
            background: isAstro ? 'rgba(106,90,205,0.15)' : 'rgba(220,20,60,0.12)',
            color: isAstro ? '#4B3B9B' : '#8B0F30',
          }}
        >
          {isAstro ? 'Astrology side' : 'Priest side'}
        </span>
        <p
          className="text-xs text-[#0F2452]/80 leading-relaxed"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          {isAstro
            ? 'Now the astrology side of your profile — a few quick questions about consultations.'
            : 'Now the priest side of your profile — pooja services, ceremonies, in-person visits.'}
        </p>
      </div>
    </div>
  );
}
