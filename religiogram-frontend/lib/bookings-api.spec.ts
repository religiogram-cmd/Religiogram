/**
 * Tests for lib/bookings-api.ts
 *
 * axios is fully mocked; only URL shape, HTTP method, auth header,
 * request body and response mapping are verified.
 */

import axios from 'axios';

jest.mock('axios', () => ({
  get:   jest.fn(),
  post:  jest.fn(),
  patch: jest.fn(),
}));

import {
  createBooking,
  getMyBookings,
  cancelBooking,
  updateBookingStatus,
  getProviderBookings,
} from './bookings-api';

const axiosGet   = axios.get   as jest.Mock;
const axiosPost  = axios.post  as jest.Mock;
const axiosPatch = axios.patch as jest.Mock;

const TOKEN = 'bearer-tok';

const BOOKING_PAYLOAD = {
  providerId: 'prov-1',
  serviceName: 'Aarti',
  type: 'offline' as const,
  scheduledAt: '2026-01-01T08:00:00.000Z',
  durationMinutes: 60,
  amountPaise: 50000,
};

const BOOKING = { id: 'bk-1', ...BOOKING_PAYLOAD, status: 'pending' as const, createdAt: '' };

describe('bookings-api', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── createBooking ─────────────────────────────────────────────────────────

  it('POSTs to /api/v1/bookings with auth header', async () => {
    axiosPost.mockResolvedValue({ data: { data: BOOKING } });
    await createBooking(TOKEN, BOOKING_PAYLOAD);
    expect(axiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/bookings'),
      BOOKING_PAYLOAD,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('returns data.data from POST response', async () => {
    axiosPost.mockResolvedValue({ data: { data: BOOKING } });
    const result = await createBooking(TOKEN, BOOKING_PAYLOAD);
    expect(result).toEqual(BOOKING);
  });

  // ── getMyBookings ─────────────────────────────────────────────────────────

  it('GETs /api/v1/bookings/my with auth header', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getMyBookings(TOKEN);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/my'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('always includes limit=20 in the query', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getMyBookings(TOKEN);
    expect(axiosGet.mock.calls[0][0]).toContain('limit=20');
  });

  it('includes status param when provided', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getMyBookings(TOKEN, undefined, 'confirmed');
    expect(axiosGet.mock.calls[0][0]).toContain('status=confirmed');
  });

  it('includes cursor param when provided', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getMyBookings(TOKEN, undefined, undefined, 'cur_abc');
    expect(axiosGet.mock.calls[0][0]).toContain('cursor=cur_abc');
  });

  it('returns mapped bookings and nextCursor', async () => {
    axiosGet.mockResolvedValue({ data: { data: { data: [BOOKING], nextCursor: 'c2' } } });
    const result = await getMyBookings(TOKEN);
    expect(result.bookings).toEqual([BOOKING]);
    expect(result.nextCursor).toBe('c2');
  });

  it('returns empty bookings and null nextCursor on empty response', async () => {
    axiosGet.mockResolvedValue({ data: {} });
    const result = await getMyBookings(TOKEN);
    expect(result.bookings).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  // ── cancelBooking ─────────────────────────────────────────────────────────

  it('POSTs to /api/v1/bookings/:id/cancel with reason', async () => {
    axiosPost.mockResolvedValue({});
    await cancelBooking(TOKEN, 'bk-5', 'change of plans');
    expect(axiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/bk-5/cancel'),
      { reason: 'change of plans' },
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('POSTs cancel with undefined reason when none given', async () => {
    axiosPost.mockResolvedValue({});
    await cancelBooking(TOKEN, 'bk-6');
    expect(axiosPost.mock.calls[0][1]).toEqual({ reason: undefined });
  });

  // ── updateBookingStatus ───────────────────────────────────────────────────

  it('PATCHes /api/v1/bookings/:id with new status', async () => {
    axiosPatch.mockResolvedValue({});
    await updateBookingStatus(TOKEN, 'bk-7', 'confirmed');
    expect(axiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/bk-7'),
      { status: 'confirmed' },
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  // ── getProviderBookings ───────────────────────────────────────────────────

  it('GETs /api/v1/bookings/provider with auth header', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getProviderBookings(TOKEN);
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/provider'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('includes status and cursor params when provided', async () => {
    axiosGet.mockResolvedValue({ data: { data: { bookings: [], nextCursor: null } } });
    await getProviderBookings(TOKEN, 'cur_p', 'pending');
    const url: string = axiosGet.mock.calls[0][0];
    expect(url).toContain('status=pending');
    expect(url).toContain('cursor=cur_p');
  });
});
