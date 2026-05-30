'use client';

import { useReligion, type UserReligion } from '@/lib/useReligion';

const FAITHS: { key: UserReligion; label: string; symbol: string }[] = [
  { key: 'all',       label: 'All',       symbol: '◯' },
  { key: 'hindu',     label: 'Hindu',     symbol: 'ॐ' },
  { key: 'muslim',    label: 'Muslim',    symbol: '☪' },
  { key: 'sikh',      label: 'Sikh',      symbol: '☬' },
  { key: 'christian', label: 'Christian', symbol: '✝' },
];

const NAVY = '#0F2452';
const GOLD = '#C8932A';

/**
 * Horizontal pill row that lets the user switch their faith filter.
 * Reads + writes via the canonical useReligion() hook so the choice
 * persists to localStorage AND syncs to the backend (PATCH /users/me).
 */
export function FaithSelector() {
  const { religion, confirmReligion } = useReligion();

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
      {FAITHS.map((f) => {
        const active = religion === f.key;
        return (
          <button
            key={f.key}
            onClick={() => confirmReligion(f.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 999,
              border: `1.5px solid ${active ? GOLD : 'rgba(15,36,82,0.18)'}`,
              background: active ? NAVY : '#fff',
              color: active ? GOLD : NAVY,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>{f.symbol}</span>
            <span>{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default FaithSelector;