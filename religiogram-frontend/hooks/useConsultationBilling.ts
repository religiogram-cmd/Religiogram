'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';

export type BalanceState =
  | 'ok'
  | 'warning'    // < 2 min remaining — show yellow banner
  | 'critical'   // < 1 min remaining — show recharge overlay
  | 'no_funds';  // ≤ 0 — auto-terminate

export interface BillingState {
  elapsedSeconds: number;
  chargedPaise: number;
  remainingPaise: number;
  remainingMinutes: number;
  balanceState: BalanceState;
}

interface Options {
  walletBalancePaise: number;
  ratePerMinPaise: number;
  /** Socket.IO socket — if provided, listens for server-side billing events */
  socket?: Socket | null;
  onNoFunds?: () => void;
}

/**
 * Manages per-minute consultation billing state on the client.
 *
 * Blueprint §9 — every second deducts from the local balance mirror.
 * Server-side events (balance_warning, balance_critical, no_funds) are
 * authoritative; this hook also computes client-side thresholds as a UX
 * fallback.
 */
export function useConsultationBilling({
  walletBalancePaise,
  ratePerMinPaise,
  socket,
  onNoFunds,
}: Options): BillingState {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [serverBalance, setServerBalance] = useState<number | null>(null);
  const onNoFundsRef = useRef(onNoFunds);
  onNoFundsRef.current = onNoFunds;

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setElapsedSeconds((s: any) => s + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // Listen to server billing events for authoritative balance updates
  useEffect(() => {
    if (!socket) return;
    const handleWarning = (data: { remainingPaise: number }) => {
      setServerBalance(data.remainingPaise);
    };
    const handleCritical = (data: { remainingPaise: number }) => {
      setServerBalance(data.remainingPaise);
    };
    const handleNoFunds = () => {
      setServerBalance(0);
      onNoFundsRef.current?.();
    };
    socket.on('balance_warning', handleWarning);
    socket.on('balance_critical', handleCritical);
    socket.on('no_funds', handleNoFunds);
    return () => {
      socket.off('balance_warning', handleWarning);
      socket.off('balance_critical', handleCritical);
      socket.off('no_funds', handleNoFunds);
    };
  }, [socket]);

  const ratePerSec = ratePerMinPaise / 60;
  const chargedPaise = Math.floor(elapsedSeconds * ratePerSec);

  // Use server balance if received, otherwise derive from wallet - elapsed
  const remainingPaise = serverBalance !== null
    ? serverBalance
    : Math.max(0, walletBalancePaise - chargedPaise);

  const remainingMinutes = remainingPaise / ratePerMinPaise;

  let balanceState: BalanceState = 'ok';
  if (remainingPaise <= 0) {
    balanceState = 'no_funds';
  } else if (remainingMinutes < 1) {
    balanceState = 'critical';
  } else if (remainingMinutes < 2) {
    balanceState = 'warning';
  }

  return {
    elapsedSeconds,
    chargedPaise,
    remainingPaise,
    remainingMinutes,
    balanceState,
  };
}
