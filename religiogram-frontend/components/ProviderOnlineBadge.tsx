'use client';

import React from 'react';

interface Props {
  isOnline: boolean;
  /** Show the label text alongside the dot */
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Green / grey dot badge indicating provider online status.
 * Used on ProviderCard, ProviderProfileScreen, and guide listings.
 */
export function ProviderOnlineBadge({ isOnline, showLabel = false, size = 'md' }: Props) {
  const dotSize = size === 'sm' ? 8 : 10;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
      aria-label={isOnline ? 'Online now' : 'Offline'}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: isOnline ? '#27AE60' : '#B0B0B0',
          boxShadow: isOnline ? '0 0 0 2px rgba(39,174,96,0.25)' : 'none',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: size === 'sm' ? 11 : 12,
            color: isOnline ? '#27AE60' : '#888',
            fontWeight: 500,
          }}
        >
          {isOnline ? 'Online' : 'Offline'}
        </span>
      )}
    </span>
  );
}
