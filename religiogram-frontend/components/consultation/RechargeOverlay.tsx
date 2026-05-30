'use client';

import React, { useState } from 'react';
import { walletApi } from '@/lib/wallet-api';
import { formatRupees } from '@/lib/format-currency';

interface Props {
  /** 'warning' shows a yellow banner; 'critical' shows a blocking modal */
  variant: 'warning' | 'critical';
  remainingMinutes: number;
  /** Suggested top-up amounts in rupees */
  topUpOptions?: number[];
  onRecharged: (addedPaise: number) => void;
  onDismiss?: () => void;
  onEndSession: () => void;
}

const GOLD = '#C8920A';
const CRITICAL_RED = '#DC2626';

/**
 * Recharge overlay — shown when wallet balance is running low during
 * a live consultation session.
 *
 * Blueprint §9.3 / §9.4:
 *   - balance_warning  (< 2 min) → yellow banner with "Add funds" CTA
 *   - balance_critical (< 1 min) → blocking modal with amount picker
 */
export function RechargeOverlay({
  variant,
  remainingMinutes,
  topUpOptions = [99, 199, 499],
  onRecharged,
  onDismiss,
  onEndSession,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const secondsLeft = Math.max(0, Math.floor(remainingMinutes * 60));

  const handleTopUp = async (amountRupees: number) => {
    setLoading(true);
    setError(null);
    try {
      // Initiate wallet top-up; real apps redirect to Razorpay
      await walletApi.initiateTopUp({ amountPaise: amountRupees * 100 });
      onRecharged(amountRupees * 100);
    } catch (e: any) {
      setError(e.message ?? 'Recharge failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Warning banner (non-blocking) ────────────────────────────────────
  if (variant === 'warning') {
    return (
      <div style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: 400,
        background: '#FEF3C7', border: '1.5px solid #F59E0B',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#92400E' }}>
            Low Balance — ~{secondsLeft}s remaining
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#B45309' }}>
            Add funds to continue your session
          </p>
        </div>
        <button
          onClick={() => handleTopUp(199)}
          disabled={loading}
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: GOLD, color: '#fff',
            border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          +{formatRupees(199)}
        </button>
        {onDismiss && (
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#92400E' }}>
            ×
          </button>
        )}
      </div>
    );
  }

  // ── Critical modal (blocking) ─────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20,
        padding: '28px 20px', width: '100%', maxWidth: 360,
        textAlign: 'center',
      }}>
        {/* Countdown ring */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: CRITICAL_RED, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 22, fontWeight: 800,
        }}>
          {secondsLeft}s
        </div>

        <h3 style={{ color: CRITICAL_RED, fontWeight: 800, fontSize: 20, margin: '0 0 8px' }}>
          Session Ending Soon!
        </h3>
        <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 22px', lineHeight: 1.5 }}>
          Your wallet balance is almost empty. Add funds now to keep the session going.
        </p>

        {error && (
          <p style={{ color: CRITICAL_RED, fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        {/* Top-up options */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {topUpOptions.map((amt) => (
            <button
              key={amt}
              onClick={() => handleTopUp(amt)}
              disabled={loading}
              style={{
                flex: 1, padding: '12px 0',
                background: `linear-gradient(135deg, ${GOLD}, #9A7B1E)`,
                color: '#fff', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              +{formatRupees(amt)}
            </button>
          ))}
        </div>

        <button
          onClick={onEndSession}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 0',
            background: '#fff', color: CRITICAL_RED,
            border: `2px solid ${CRITICAL_RED}`, borderRadius: 10,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          End Session
        </button>
      </div>
    </div>
  );
}
