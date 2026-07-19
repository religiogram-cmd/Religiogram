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

  // Block re-fill if the application is already submitted/decided AND
  // seed the local store's `progressByCategory` + `step` from the server
  // so a user resuming on a new browser (empty localStorage) still sees
  // a Continue banner.
  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi
      .getDraft()
      .then((d) => {
        if (cancelled) return;
        const st = d.providerStatus;
        if (st === 'pending_review' || st === 'approved' || st === 'rejected' || st === 'suspended') {
          router.replace('/provider-status');
          return;
        }
        // If the backend has a further step or a progressByCategory the
        // local store hasn't seen, merge it in so the resume banner renders.
        const remoteProgress = ((d.data as any)?.progressByCategory ?? {}) as
          Partial<Record<Category, number>>;
        const localProgress = (data.progressByCategory ?? {}) as
          Partial<Record<Category, number>>;
        const merged: Partial<Record<Category, number>> = { ...localProgress };
        (['priest', 'astrologer', 'both'] as Category[]).forEach((c) => {
          const remote = remoteProgress[c] ?? 0;
          const local = localProgress[c] ?? 0;
          if (remote > local) merged[c] = remote;
        });
        // If we have no per-category record at all but the backend knows we're
        // past step 1, fall back to whichever category is on the draft.
        const cat = ((d.data as any)?.providerCategory ?? data.providerCategory) as Category | undefined;
        if (cat && d.step > 1 && !(merged[cat] ?? 0)) {
          merged[cat] = d.step;
        }
        if (Object.keys(merged).length > 0) {
          update({ progressByCategory: merged });
        }
      })
      .catch(() => { /* non-fatal — user can still start fresh */ });
    return () => { cancelled = true; };
  }, [router, data.progressByCategory, data.providerCategory, update]);

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

  /* Per-category progress. A user may have started multiple applications
   * (e.g. Astrologer up to Step 7, then Priest up to Step 3). We surface
   * a separate resume banner for each, so tapping a specific one lands
   * on that flow's exact last step. */
  const progressByCategory = (data.progressByCategory ?? {}) as
    Partial<Record<Category, number>>;
  const totalSteps = (c: Category) => (c === 'both' ? 12 : 9);
  const catLabel = (c: Category) =>
    c === 'astrologer' ? 'Astrologer'
  : c === 'both'       ? 'Priest & Astrologer'
  :                      'Priest';
  const resumeEntries = (['priest', 'astrologer', 'both'] as Category[])
    .map((c) => ({ cat: c, step: progressByCategory[c] ?? 0 }))
    .filter((e) => e.step > 1);

  const startWizard = (cat: Category) => {
    if (cat !== data.providerCategory) update({ providerCategory: cat });
    /* Resume at the furthest step recorded for THIS specific category.
     * Switching category doesn't reset the other category's progress. */
    const resumeStep = Math.max(1, progressByCategory[cat] ?? 1);
    router.push(`/provider-onboarding/${cat}/step-${resumeStep}`);
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
          we&apos;ll walk you through a short onboarding (9 steps for one
          role, 12 if you serve as both). Same KYC, same trusted process.
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
            gradientFrom="#B8860B"
            gradientTo="#0F2452"
            ctaLabel="Continue as Both"
            onClick={() => startWizard('both')}
          />
        </div>

        {/* Resume banners — one PER category with in-progress work. Multiple
         * applications can be in flight at once (e.g. Astrologer Step 7 +
         * Priest Step 3). Tapping a specific banner jumps directly to that
         * flow at its recorded step. */}
        {resumeEntries.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-[12px] tracking-wide uppercase text-amber-700 font-bold">
              Continue where you left off
            </p>
            {resumeEntries.map(({ cat, step: catStep }) => (
              <div
                key={cat}
                className="p-4 rounded-xl border border-amber-700/30 bg-white/60"
              >
                <p className="text-sm text-[#0F2452]">
                  <b>{catLabel(cat)}</b> application — Step {catStep} of {totalSteps(cat)}
                </p>
                <button
                  onClick={() => {
                    if (cat !== data.providerCategory) update({ providerCategory: cat });
                    router.push(`/provider-onboarding/${cat}/step-${catStep}`);
                  }}
                  className="mt-3 px-5 py-3 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452]
                             hover:bg-[#0F2452] active:scale-[0.98] transition"
                >
                  Resume — Step {catStep}
                </button>
              </div>
            ))}
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
  active, title, subtitle, bullets, badge, gradientFrom, gradientTo, ctaLabel, onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  bullets: string[];
  badge: string;
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
