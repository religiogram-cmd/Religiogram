'use client';

/**
 * Step_ServiceMode — choose how you deliver services.
 *
 * Three stacked cards, gold border on selected.
 * On select: update store serviceMode + PATCH draft.
 */

import { useState } from 'react';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi, type ServiceMode } from '@/lib/provider-onboarding-api';

const MODES: Array<{
  id: ServiceMode;
  label: string;
  desc: string;
  icon: string;
  example: string;
}> = [
  {
    id: 'offline',
    label: 'Offline Service',
    desc: 'I visit homes, temples, churches',
    icon: '🏠',
    example: 'e.g. Satyanarayan Katha',
  },
  {
    id: 'online',
    label: 'Online Service',
    desc: 'I do chat / call / video consultations',
    icon: '💻',
    example: 'e.g. Astrology, Spiritual Guidance',
  },
  {
    id: 'both',
    label: 'Both',
    desc: 'I offer both in-person and online',
    icon: '⭐',
    example: 'Most common for senior providers',
  },
];

const GOLD = '#C8932A';
const NAVY = '#0F2452';

export default function Step_ServiceMode() {
  const { data, update } = useProviderOnboarding();
  const [selected, setSelected] = useState<ServiceMode>(
    (data as any).serviceMode ?? 'both',
  );
  const [patching, setPatching] = useState(false);

  const handleSelect = async (id: ServiceMode) => {
    if (patching) return;
    setSelected(id);
    update({ serviceMode: id } as any);

    setPatching(true);
    try {
      // PATCH using step2 endpoint which accepts serviceMode in the body
      await providerOnboardingApi.step2({
        experienceYears: (data.experienceYears as number) ?? 0,
        languages: data.languages ?? [],
        bio: data.bio,
        serviceMode: id,
      } as any);
    } catch {
      // Ignore — store + localStorage keep the value; flush() retries on Next.
    } finally {
      setPatching(false);
    }
  };

  return (
    <div>
      <h2 style={{
        fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        How do you deliver services?
      </h2>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 28, lineHeight: 1.6 }}>
        Choose the mode that best fits how you work. You can update this later.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {MODES.map((m) => {
          const isActive = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => handleSelect(m.id)}
              aria-pressed={isActive}
              style={{
                background: isActive ? '#FFFBEF' : '#fff',
                border: `2px solid ${isActive ? GOLD : '#E5E7EB'}`,
                borderRadius: 16,
                padding: '18px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                textAlign: 'left',
                boxShadow: isActive
                  ? '0 4px 16px rgba(200,147,42,0.18)'
                  : '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'all 0.18s ease',
                outline: 'none',
              }}
            >
              {/* Icon bubble */}
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: isActive ? `${GOLD}22` : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                {m.icon}
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 16, fontWeight: 700,
                  color: isActive ? NAVY : '#1F2937',
                  marginBottom: 3,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                  {m.desc}
                </div>
                <div style={{
                  fontSize: 12, color: isActive ? '#92680A' : '#9CA3AF',
                  marginTop: 4, fontStyle: 'italic',
                }}>
                  {m.example}
                </div>
              </div>

              {/* Check */}
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: isActive ? GOLD : '#E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
