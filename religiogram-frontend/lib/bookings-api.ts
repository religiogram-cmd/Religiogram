import { apiFetch } from './api';

export interface CreateBookingPayload {
  providerId: string;
  serviceName: string;
  serviceId?: string;
  type: 'online' | 'offline';
  scheduledAt: string;
  durationMinutes: number;
  amountPaise: number;
  notes?: string;
}

export interface Booking {
  id: string;
  providerId: string;
  providerName?: string;
  serviceName: string;
  type: 'online' | 'offline';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';
  scheduledAt: string;
  durationMinutes: number;
  amountPaise: number;
  notes?: string;
  createdAt: string;
}

export async function createBooking(
  _token: string,
  payload: CreateBookingPayload
): Promise<Booking> {
  return apiFetch<Booking>('/bookings', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export type BookingStatusFilter = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';

/**
 * Cursor-based paginated list of the user's own bookings.
 * Pass nextCursor from the previous response to get the next page.
 * Omit cursor to get the first page.
 */
export async function getMyBookings(
  _token: string,
  page?: number,   // kept for backwards-compat; ignored — use cursor instead
  status?: BookingStatusFilter,
  cursor?: string,
): Promise<{ bookings: Booking[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '20' });
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const res = await apiFetch<{ data?: { data?: Booking[]; bookings?: Booking[]; nextCursor?: string | null }; bookings?: Booking[]; nextCursor?: string | null } | { data?: Booking[]; bookings?: Booking[]; nextCursor?: string | null }>(
    `/bookings/my?${params.toString()}`,
    { auth: true },
  );
  // Handle both envelope shapes: { data: { bookings, nextCursor } } and flat { bookings, nextCursor }
  const inner = (res as { data?: { data?: Booking[]; bookings?: Booking[]; nextCursor?: string | null } }).data ?? res;
  const rawList: any[] = (inner as { data?: Booking[] }).data ?? (inner as { bookings?: Booking[] }).bookings ?? [];

  // Real backend may return the provider as a nested object — `provider.fullName`
  // — instead of the flat `providerName` the UI reads. Normalise here so the
  // bookings list renders consistently regardless of which shape comes back.
  const bookings: Booking[] = rawList.map((b) => {
    const name = b?.providerName
      ?? b?.provider?.fullName
      ?? b?.provider?.displayName
      ?? b?.provider?.name
      ?? undefined;
    return { ...b, providerName: name } as Booking;
  });
  const nextCursor: string | null = (inner as { nextCursor?: string | null }).nextCursor ?? null;
  return { bookings, nextCursor };
}

/**
 * Server-side price quote — pure read, no DB writes.
 * Returns the canonical paise total + fee split so the checkout screen can
 * show "you will pay ₹X" before the user commits.
 */
export async function previewBookingPrice(args: {
  serviceId: string;
  scheduledAt: string;
  durationMinutes?: number;
}): Promise<{
  serviceName: string;
  totalPaise: number;
  platformFeePaise: number;
  providerAmountPaise: number;
}> {
  const res = await apiFetch<{
    data?: { serviceName: string; totalPaise: number; platformFeePaise: number; providerAmountPaise: number };
    serviceName?: string; totalPaise?: number; platformFeePaise?: number; providerAmountPaise?: number;
  }>(`/bookings/preview`, { method: 'POST', body: args, auth: true });
  const inner = (res as any).data ?? res;
  return {
    serviceName:         String(inner.serviceName ?? ''),
    totalPaise:          Number(inner.totalPaise ?? 0),
    platformFeePaise:    Number(inner.platformFeePaise ?? 0),
    providerAmountPaise: Number(inner.providerAmountPaise ?? 0),
  };
}

export async function cancelBooking(
  _token: string,
  bookingId: string,
  reason?: string
): Promise<void> {
  // Use the dedicated cancel endpoint (POST /:id/cancel) for cleaner semantics
  // and independent throttle budget vs general PATCH.
  await apiFetch<void>(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: { reason },
    auth: true,
  });
}

export async function updateBookingStatus(
  _token: string,
  bookingId: string,
  status: 'confirmed' | 'completed' | 'cancelled'
): Promise<void> {
  await apiFetch<void>(`/bookings/${bookingId}`, {
    method: 'PATCH',
    body: { status },
    auth: true,
  });
}

export async function getProviderBookings(
  _token: string,
  cursor?: string,
  status?: BookingStatusFilter,
): Promise<{ bookings: Booking[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '20' });
  if (cursor) params.set('cursor', cursor);
  if (status) params.set('status', status);
  const res = await apiFetch<{ data?: { data?: Booking[]; bookings?: Booking[]; nextCursor?: string | null }; bookings?: Booking[]; nextCursor?: string | null }>(
    `/bookings/provider?${params.toString()}`,
    { auth: true },
  );
  const inner = (res as { data?: { data?: Booking[]; bookings?: Booking[]; nextCursor?: string | null } }).data ?? res;
  const bookings: Booking[] = (inner as { data?: Booking[] }).data ?? (inner as { bookings?: Booking[] }).bookings ?? [];
  const nextCursor: string | null = (inner as { nextCursor?: string | null }).nextCursor ?? null;
  return { bookings, nextCursor };
}
