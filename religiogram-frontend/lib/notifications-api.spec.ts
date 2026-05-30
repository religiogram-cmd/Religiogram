/**
 * Tests for lib/notifications-api.ts
 *
 * All axios calls are mocked so no network is involved.
 */

import axios from 'axios';

jest.mock('axios', () => ({
  get:   jest.fn(),
  patch: jest.fn(),
}));

import {
  getNotifications,
  getUnreadCount,
  markOneRead,
} from './notifications-api';

const axiosGet   = axios.get   as jest.Mock;
const axiosPatch = axios.patch as jest.Mock;

const TOKEN = 'test-token-abc';

describe('notifications-api', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getNotifications ─────────────────────────────────────────────────────

  it('calls GET /api/v1/notifications without cursor', async () => {
    axiosGet.mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });
    await getNotifications(TOKEN);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/notifications?limit=20'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    expect(axiosGet.mock.calls[0][0]).not.toContain('cursor=');
  });

  it('includes cursor param when provided', async () => {
    axiosGet.mockResolvedValue({ data: { data: { items: [], nextCursor: null } } });
    await getNotifications(TOKEN, 'cur_xyz');
    expect(axiosGet.mock.calls[0][0]).toContain('cursor=cur_xyz');
  });

  it('returns the data.data payload from the response', async () => {
    const payload = { items: [{ id: 'n1', type: 'booking', title: 'Confirmed', body: '', isRead: false, createdAt: '' }], nextCursor: 'c2' };
    axiosGet.mockResolvedValue({ data: { data: payload } });
    const result = await getNotifications(TOKEN);
    expect(result).toEqual(payload);
  });

  // ── getUnreadCount ────────────────────────────────────────────────────────

  it('calls GET /api/v1/notifications/unread-count with auth header', async () => {
    axiosGet.mockResolvedValue({ data: { count: 5 } });
    await getUnreadCount(TOKEN);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/unread-count'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('returns the count from the response', async () => {
    axiosGet.mockResolvedValue({ data: { count: 7 } });
    expect(await getUnreadCount(TOKEN)).toBe(7);
  });

  it('returns 0 when count is missing', async () => {
    axiosGet.mockResolvedValue({ data: {} });
    expect(await getUnreadCount(TOKEN)).toBe(0);
  });

  it('returns 0 on network error (silent catch)', async () => {
    axiosGet.mockRejectedValue(new Error('network down'));
    expect(await getUnreadCount(TOKEN)).toBe(0);
  });

  // ── markOneRead ───────────────────────────────────────────────────────────

  it('calls PATCH /api/v1/notifications/:id/read with auth header', async () => {
    axiosPatch.mockResolvedValue({});
    await markOneRead(TOKEN, 'notif-99');
    expect(axiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/notif-99/read'),
      {},
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('resolves to void on success', async () => {
    axiosPatch.mockResolvedValue({ data: {} });
    await expect(markOneRead(TOKEN, 'n1')).resolves.toBeUndefined();
  });
});
