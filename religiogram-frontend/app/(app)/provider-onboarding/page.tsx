'use client';

/**
 * /provider-onboarding — landing + category chooser + resume.
 *
 * Behaviour:
 *   • If the draft is already submitted / decided → redirect to /provider-status
 *   • If the user has picked a category AND is past Step 1 → resume at Step N
 *   • Otherwise → show the inline category chooser (Priest / Astrologer)
 *
 * Category persists to the draft so the wizard steps downstream can branch
 * on `data.providerCategory`. Only one entry point per profile — no separate
 * /become-provider or /become-priest split.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

type Category = 'priest' | 'astrologer' | 'both';

export default function ProviderOnboardingEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { step, data, saveStatus, update } = useProviderOnboarding();
  const [checked, setChecked] = useState(false);

  // If ?category= is present on the URL (legacy links from /become-provider or
  // the old chooser), adopt it silently and clean the URL.
  useEffect(() => {
    const q = searchParams?.get('category');
    if ((q === 'priest' || q === 'astrologer' || q === 'both') && data.providerCategory !== q) {
      update({ providerCategory: q as Category });
    }
  }, [searchParams, data.providerCategory, update]);

  // Block re-fill if application is already submitted/decided.
  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi
      .getDraft()
      .then((d) => {
        if (cancelled) return;
        const st = d.providerStatus;
        if (st === 'pending_review' || st === 'approved' || st === 'rejected') {
          router.replace('/provider-status');
        }
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (saveStatus !== 'idle') { setChecked(true); return; }
    const t = setTimeout(() => setChecked(true), 1500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  if (!checked) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#F7EFE1]">
        <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  const category = data.providerCategory as Category | undefined;
  const isReturning = step > 1 && !!category;

  const startWizard = (cat: Category) => {
    if (cat !== data.providerCategory) update({ providerCategory: cat });
    router.push(`/provider-onboarding/step-${Math.max(1, step)}`);
  };

  return (
    <div className="min-h-svh bg-[#F7EFE1] text-[#0F2452]">
      <main className="px-6 py-8 max-w-xl mx-auto">

        <p className="text-[11px] tracking-[0.16em] uppercase text-amber-700 font-bold">
          Join ReligioGram
        </p>
        <h1 className="text-3xl font-bold mt-2 leading-tight">
          Share your gift.<br/>Serve devotees.
        </h1>
        <p className="mt-3 text-sm text-gray-700/85 leading-relaxed">
          Priest or astrologer — pick the role that fits how you serve, and
          we&apos;ll walk you through the same 9-step onboarding. Same KYC,
          same trusted process.
        </p>

        {/* Category chooser (Step 0) */}
        <div className="mt-6">
          <p className="text-[13px] font-semibold text-[#0F2452] mb-3">
            What describes you best?
          </p>

          <RoleCard
            active={category === 'priest'}
            title="Priest / Pandit"
            subtitle="Pandit · Imam · Granthi · Priest · Purohit"
            bullets={[
              'Perform poojas, namaz, kirtan, mass, ceremonies',
              'Accept in-person bookings at home or your venue',
              'Offer online video consultations too',
            ]}
            badge="OFFLINE & ONLINE"
            icon="🕉️"
            gradientFrom="#DC143C"
            gradientTo="#8B0000"
            onClick={() => startWizard('priest')}
          />

          <div className="h-3" />

          <RoleCard
            active={category === 'astrologer'}
            title="Astrologer"
            subtitle="Vedic · KP · Nadi · Tarot · Numerology · Palmistry"
            bullets={[
              'Consult over chat, voice or video — billed per minute',
              'Get followers, live sessions, premium visibility',
              'Astrology-first tools, same KYC everyone trusts',
            ]}
            badge="CHAT · VOICE · VIDEO"
            icon="✨"
            gradientFrom="#6A5ACD"
            gradientTo="#483D8B"
            onClick={() => startWizard('astrologer')}
          />

          <div className="h-3" />

          <RoleCard
            active={category === 'both'}
            title="Both — Priest & Astrologer"
            subtitle="One profile · Both revenue streams · Same KYC"
            bullets={[
              'Ceremonies + astrology consultations — one dashboard',
              'Accept in-person bookings AND per-minute chat/voice/video',
              'Everything both flows offer, no duplicate onboarding',
            ]}
            badge="RECOMMENDED IF YOU DO BOTH"
            icon="🕉️✨"
            gradientFrom="#B8860B"
            gradientTo="#0F2452"
            ctaLabel="Continue as Both"
            onClick={() => startWizard('both')}
          />
        </div>

        {/* Resume banner (only if user has real progress on either flow) */}
        {isReturning && (
          <div className="mt-5 p-4 rounded-xl border border-amber-700/30 bg-white/60">
            <p className="text-[12px] tracking-wide uppercase text-amber-700 font-bold">
              Continue where you left off
            </p>
            <p className="mt-1 text-sm text-[#0F2452]">
              You&apos;re on Step {step} of 9 —{' '}
              {category === 'astrologer'
                ? 'Astrologer'
                : category === 'both'
                  ? 'Priest & Astrologer'
                  : 'Priest'}{' '}
              application.
            </p>
            <button
              onClick={() => router.push(`/provider-onboarding/step-${step}`)}
              className="mt-3 px-5 py-3 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452]
                         hover:bg-[#0F2452] active:scale-[0.98] transition"
            >
              Resume — Step {step}
            </button>
          </div>
        )}

        <p className="mt-6 text-[11px] text-gray-700/60 text-center">
          Takes about 10 minutes · Saves automatically · Free to apply
        </p>
      </main>
    </div>
  );
}

/* ─────────────────────────  Sub-components  ───────────────────────── */

function RoleCard({
  active, title, subtitle, bullets, badge, icon, gradientFrom, gradientTo, ctaLabel, onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  bullets: string[];
  badge: string;
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  ctaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        color: '#FFFFFF',
        borderRadius: 18,
        padding: 18,
        border: active ? '2.5px solid #FFD54F' : '2.5px solid transparent',
        boxShadow: active
          ? '0 14px 32px -14px rgba(15,36,82,0.45), 0 0 0 3px rgba(255,213,79,0.28)'
          : '0 8px 22px -14px rgba(15,36,82,0.35)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 48, opacity: 0.28 }}>{icon}</div>

      <div style={{
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.28)',
        borderRadius: 999,
        fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
        fontWeight: 700, marginBottom: 10,
      }}>
        {badge}
      </div>

      <h3 style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: 22, fontWeight: 800, lineHeight: 1.1,
        margin: '0 0 4px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h3>
      <p style={{ fontSize: 12.5, margin: '0 0 12px', opacity: 0.85 }}>
        {subtitle}
      </p>

      <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {bullets.map((b) => (
          <li key={b} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5 }}>
            <span style={{ opacity: 0.85, flexShrink: 0 }}>›</span>
            <span style={{ opacity: 0.94 }}>{b}</span>
          </li>
        ))}
      </ul>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '9px 16px',
        background: 'rgba(255,255,255,0.20)',
        border: '1px solid rgba(255,255,255,0.32)',
        borderRadius: 999,
        fontSize: 13, fontWeight: 700,
      }}>
        {active ? '✓ Selected — Continue' : (ctaLabel ?? `Continue as ${title.split(' ')[0]}`)}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </button>
  );
}
