'use client';

/**
 * WalletBadge — compact wallet pill for use inside sticky headers.
 *
 * Displays the user's available balance as ₹NN with a subtle "+" icon
 * hinting at tap-to-topup. Auto-refreshes every 60 seconds and listens
 * for a `wallet:refresh` window event so other screens (e.g. after a
 * successful topup or a session end) can force an immediate reload.
 *
 * Fetch failures are swallowed silently to a "—" placeholder so a
 * transient network hiccup can never crash the astrology header.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { walletApi } from '@/lib/wallet-api';

const NAVY = '#0F2452';
const GOLD = '#C8932A';
const GOLD_L = '#E0A92F';

interface Props {
  /** Auto-refresh interval in ms. Defaults to 60s. */
  refreshMs?: number;
}

export default function WalletBadge({ refreshMs = 60_000 }: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await walletApi.balance();
      setBalance((b.availablePaise ?? 0) + (b.promoCreditsPaise ?? 0));
      setErrored(false);
    } catch {
      // Silent — badge shows "—" instead of blocking the header.
      setErrored(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = () => { if (mounted) void load(); };
    run();
    const t = setInterval(run, refreshMs);
    const onRefresh = () => run();
    if (typeof window !== 'undefined') {
      window.addEventListener('wallet:refresh', onRefresh);
    }
    return () => {
      mounted = false;
      clearInterval(t);
      if (typeof window !== 'undefined') {
        window.removeEventListener('wallet:refresh', onRefresh);
      }
    };
  }, [load, refreshMs]);

  const display = errored || balance === null
    ? '—'
    : `₹${Math.round(balance / 100)}`;

  return (
    <button
      type="button"
      onClick={() => router.push('/wallet')}
      aria-label="Wallet balance — tap to add money"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 8px',
        background: `linear-gradient(135deg, ${GOLD_L}15, ${GOLD}20)`,
        border: `1.5px solid ${GOLD}`,
        borderRadius: 999,
        color: NAVY,
        fontSize: 12.5,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        lineHeight: 1,
      }}
    >
      {/* Wallet glyph */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2h-3a3 3 0 0 0 0 6h3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
          stroke={NAVY}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="17.5" cy="12" r="1" fill={NAVY} />
      </svg>
      <span>{display}</span>
      <span
        aria-hidden
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 999,
          background: GOLD,
          color: '#fff',
          fontWeight: 800, fontSize: 12, lineHeight: 1,
        }}
      >
        +
      </span>
    </button>
  );
}
