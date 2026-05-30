'use client';

/**
 * Step_Religion — choose which faith tradition you serve.
 *
 * Four large 2×2 grid cards, gold border on selected.
 * On select: update store religion field + PATCH draft.
 */

import { useState } from 'react';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi, type Religion } from '@/lib/provider-onboarding-api';

const FAITHS: Array<{
  id: Religion;
  label: string;
  emoji: string;
  color: string;
  bg: string;
}> = [
  { id: 'hindu',     label: 'Hindu Rituals',     emoji: '🕉️',  color: '#C8920A', bg: '#FEF3C7' },
  { id: 'islam',     label: 'Muslim Rituals',    emoji: '☪️',  color: '#1A7A40', bg: '#D1FAE5' },
  { id: 'sikh',      label: 'Sikh Rituals',      emoji: '⚔️',  color: '#D97706', bg: '#FEF3C7' },
  { id: 'christian', label: 'Christian Rituals', emoji: '✝️',  color: '#6D28D9', bg: '#EDE9FE' },
];

interface Props {
  /** Pass a draft id if you want the PATCH call; omit to skip the API call. */
  draftId?: string;
}

export default function Step_Religion({ draftId }: Props) {
  const { data, update } = useProviderOnboarding();
  const [selected, setSelected] = useState<Religion | ''>(data.religion ?? '');
  const [patching, setPatching] = useState(false);

  const handleSelect = async (id: Religion) => {
    if (patching) return;
    setSelected(id);
    update({ religion: id });

    if (draftId) {
      setPatching(true);
      try {
        await providerOnboardingApi.step3({ religion: id });
      } catch {
        // Silently ignore — store + local-storage still hold the value;
        // the shell's flush() will retry on Next press.
      } finally {
        setPatching(false);
      }
    }
  };

  return (
    <div>
      {/* Title */}
      <h2 style={{
        fontSize: 22, fontWeight: 800, color: '#0F2452', marginBottom: 6,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        Which faith do you serve?
      </h2>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 28, lineHeight: 1.6 }}>
        We will only show you to seekers of that faith.
      </p>

      {/* 2×2 grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
      }}>
        {FAITHS.map((f) => {
          const isActive = selected === f.id;
          return (
            <button
              key={f.id}
              onClick={() => handleSelect(f.id)}
              style={{
                background: isActive ? f.bg : '#fff',
                border: `2px solid ${isActive ? f.color : '#E5E7EB'}`,
                borderRadius: 18,
                padding: '24px 16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                boxShadow: isActive
                  ? `0 4px 18px ${f.color}30`
                  : '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'all 0.18s ease',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                outline: 'none',
              }}
              aria-pressed={isActive}
            >
              <span style={{ fontSize: 38, lineHeight: 1 }}>{f.emoji}</span>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: isActive ? f.color : '#1F2937',
                textAlign: 'center',
                lineHeight: 1.3,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                {f.label}
              </span>
              {isActive && (
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected === '' && (
        <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginTop: 24 }}>
          Tap a card above to continue.
        </p>
      )}
    </div>
  );
}
