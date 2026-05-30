/**
 * Tests for lib/wallet-api.ts
 * Uses globalThis.fetch mock (jsdom env).
 * BASE resolves to '/api/v1' (no NEXT_PUBLIC_API_BASE set, jsdom window.location.hostname = 'localhost').
 */

import {
  getWalletBalance,
  getWalletTransactions,
  createTopUpOrder,
  rechargeWallet,
} from './wallet-api';

function mockOk(json: unknown) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
  });
}

function mockError(status: number) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ message: 'error' }),
  });
}

beforeEach(() => {
  globalThis.fetch = jest.fn();
});

// ── getWalletBalance ──────────────────────────────────────────────────────────

describe('getWalletBalance', () => {
  it('fetches /wallet/balance', async () => {
    mockOk({ availablePaise: 5000, promoCreditsPaise: 0, heldPaise: 0 });
    await getWalletBalance('tok');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/wallet\/balance$/);
  });

  it('sends Authorization header', async () => {
    mockOk({ availablePaise: 0, promoCreditsPaise: 0, heldPaise: 0 });
    await getWalletBalance('my-token');
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer my-token');
  });

  it('returns the parsed balance', async () => {
    mockOk({ availablePaise: 12345, promoCreditsPaise: 100, heldPaise: 50 });
    const result = await getWalletBalance('tok');
    expect(result.availablePaise).toBe(12345);
    expect(result.promoCreditsPaise).toBe(100);
  });

  it('throws on non-ok response', async () => {
    mockError(401);
    await expect(getWalletBalance('bad')).rejects.toThrow('getWalletBalance failed');
  });
});

// ── getWalletTransactions ─────────────────────────────────────────────────────

describe('getWalletTransactions', () => {
  it('fetches /wallet/transactions', async () => {
    mockOk({ transactions: [], nextCursor: null });
    await getWalletTransactions('tok');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/wallet\/transactions/);
  });

  it('includes limit=20 by default', async () => {
    mockOk({ transactions: [], nextCursor: null });
    await getWalletTransactions('tok');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('limit=20');
  });

  it('includes cursor when provided', async () => {
    mockOk({ transactions: [], nextCursor: null });
    await getWalletTransactions('tok', 'cursor-xyz');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('cursor=cursor-xyz');
  });

  it('returns transactions array', async () => {
    mockOk({ transactions: [{ id: 't1' }], nextCursor: 'c2' });
    const result = await getWalletTransactions('tok');
    expect(result.transactions).toHaveLength(1);
    expect(result.nextCursor).toBe('c2');
  });
});

// ── createTopUpOrder ──────────────────────────────────────────────────────────

describe('createTopUpOrder', () => {
  it('POSTs to /wallet/topup/order', async () => {
    mockOk({ razorpayOrderId: 'order_1', amountPaise: 10000, currency: 'INR', keyId: 'rzp_test_x' });
    await createTopUpOrder('tok', 10000);
    const [url, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/wallet\/topup\/order$/);
    expect(opts.method).toBe('POST');
  });

  it('sends amountPaise in request body', async () => {
    mockOk({ razorpayOrderId: 'order_2', amountPaise: 50000, currency: 'INR', keyId: 'k' });
    await createTopUpOrder('tok', 50000);
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(opts.body).amountPaise).toBe(50000);
  });

  it('returns TopUpOrder shape', async () => {
    mockOk({ razorpayOrderId: 'order_3', amountPaise: 1000, currency: 'INR', keyId: 'k' });
    const order = await createTopUpOrder('tok', 1000);
    expect(order.razorpayOrderId).toBe('order_3');
    expect(order.currency).toBe('INR');
  });

  it('throws with message on error', async () => {
    mockError(400);
    await expect(createTopUpOrder('tok', 500)).rejects.toThrow();
  });
});

// ── rechargeWallet ────────────────────────────────────────────────────────────

describe('rechargeWallet', () => {
  it('POSTs to /wallet/recharge', async () => {
    mockOk({});
    await rechargeWallet('tok', 'pay_abc', 500);
    const [url, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/wallet\/recharge$/);
    expect(opts.method).toBe('POST');
  });

  it('sends paymentId and amountRupees in body', async () => {
    mockOk({});
    await rechargeWallet('tok', 'pay_xyz', 250);
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.paymentId).toBe('pay_xyz');
    expect(body.amountRupees).toBe(250);
  });

  it('throws on non-ok response', async () => {
    mockError(500);
    await expect(rechargeWallet('tok', 'pay_bad', 100)).rejects.toThrow('rechargeWallet failed');
  });
});
