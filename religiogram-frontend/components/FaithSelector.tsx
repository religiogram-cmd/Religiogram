'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { FAITH_THEMES, FaithSlug } from '@/lib/faith-themes';

/**
 * Horizontal scrollable faith pill selector.
 * Drops into any screen header. Persists choice across sessions.
 */
export function FaithSelector() {
  const { faithSlug, setFaith, theme } = useTheme();

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
      {(Object.values(FAITH_THEMES) as typeof FAITH_THEMES[FaithSlug][]).map((t) => {
        const active = t.slug === faithSlug;
        return (
          <button
            key={t.slug}
            onClick={() => setFaith(t.slug)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: 20,
              border: `1.5px solid ${active ? t.primary : 'rgba(0,0,0,0.12)'}`,
              background: active ? t.primary : 'transparent',
              color: active ? '#fff' : '#555',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.18s',
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
