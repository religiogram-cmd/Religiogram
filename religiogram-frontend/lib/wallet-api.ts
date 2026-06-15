const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1';

export interface WalletBalance {
  availablePaise: number;
  promoCreditsPaise: number;
  heldPaise: number;
}

export interface WalletTransaction {
  id: string;
  type: string;
  description: string;
  amountPaise: number;
  direction: 1 | -1;
  createdAt: string;
  balanceAfterPaise: number;
}

export interface TopUpOrder {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

/* v9.1: cookie-mode CSRF helper for bespoke fetch calls. The central
 * request() helper in lib/api.ts already does this, but this module makes
 * raw fetch() calls to /wallet endpoints and must mirror the contract. */
function _csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const m = document.cookie.match(/(?:^|; )rg_csrf=([^;]*)/);
  return m ? { 'X-CSRF-Token': decodeURIComponent(m[1]) } : {};
}

export async function getWalletBalance(token: string): Promise<WalletBalance> {
  const res = await fetch(`${BASE}/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getWalletBalance failed: ${res.status}`);
  return res.json() as Promise<WalletBalance>;
}

export async function getWalletTransactions(
  token: string,
  cursor?: string,
  limit = 20,
): Promise<{ transactions: WalletTransaction[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${BASE}/wallet/transactions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getWalletTransactions failed: ${res.status}`);
  return res.json() as Promise<{ transactions: WalletTransaction[]; nextCursor: string | null }>;
}

/**
 * Step 1 — Create a Razorpay order for a wallet top-up.
 * Min ₹10 (1000 paise), max ₹50,000 (5,000,000 paise).
 */
export async function createTopUpOrder(
  token: string,
  amountPaise: number,
): Promise<TopUpOrder> {
  const res = await fetch(`${BASE}/wallet/topup/order`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ..._csrfHeader() },
    body: JSON.stringify({ amountPaise }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `createTopUpOrder failed: ${res.status}`);
  }
  return res.json() as Promise<TopUpOrder>;
}

/**
 * Step 3 — Credit the wallet after Razorpay confirms the capture.
 * paymentId = razorpay_payment_id from the checkout success handler.
 * amountRupees = amount in full rupees (e.g. 500 for ₹500).
 */
export async function rechargeWallet(
  token: string,
  paymentId: string,
  amountRupees: number,
): Promise<void> {
  const res = await fetch(`${BASE}/wallet/recharge`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ..._csrfHeader() },
    body: JSON.stringify({ paymentId, amountRupees }),
  });
  if (!res.ok) throw new Error(`rechargeWallet failed: ${res.status}`);
}

/**
 * v9 (P1-15 fix): the no-token variants previously read 'rg_access_token'
 * from localStorage, which is NOT where the canonical tokenStore writes —
 * tokenStore keeps the access token in-memory and (in body mode only) the
 * refresh token in 'rg_refresh'. The wallet-api was therefore sending an
 * empty Authorization header to every wallet endpoint, producing silent
 * empty-wallet UIs. Routed through the canonical tokenStore.
 */
import { tokenStore } from './api';

function _tok(): string {
  return (tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null)) ?? '';
}

export const walletApi = {
  getBalance: getWalletBalance,
  getTransactions: getWalletTransactions,
  createTopUpOrder,
  rechargeWallet,
  /** No-token alias used by HomeScreen + WalletScreen */
  balance: () => getWalletBalance(_tok()),
  /** No-token alias used by WalletScreen */
  transactions: (cursor?: string, limit?: number) =>
    getWalletTransactions(_tok(), cursor, limit),
  /** Alias used by RechargeOverlay — starts a top-up order */
  initiateTopUp: (opts: { amountPaise: number }) =>
    createTopUpOrder(_tok(), opts.amountPaise),
  /** Alias used by WalletScreen — confirms a Razorpay payment */
  confirmTopUp: (paymentId: string, amountPaise: number) =>
    rechargeWallet(_tok(), paymentId, amountPaise / 100),
};
