'use client';

import { useEffect, useState, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { useAuthStore } from '@/lib/store';
import { getMyBookings, cancelBooking, type Booking, type BookingStatusFilter } from '@/lib/bookings-api';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatINR } from '@/lib/format-currency';

type Tab = 'upcoming' | 'past' | 'cancelled';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700 border border-green-200',
  pending: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  cancelled: 'bg-red-100 text-red-600 border border-red-200',
  completed: 'bg-blue-100 text-blue-700 border border-blue-200',
  refunded: 'bg-gray-100 text-gray-600 border border-gray-200',
};

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-5 bg-gray-200 rounded-full w-20" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="flex gap-2">
        <div className="h-8 bg-gray-200 rounded-xl flex-1" />
        <div className="h-8 bg-gray-200 rounded-xl flex-1" />
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  onCancel,
  onRate,
  confirmCancelId,
  onSetConfirmCancel,
}: {
  booking: Booking;
  onCancel: (id: string) => void;
  onRate: (id: string) => void;
  confirmCancelId: string | null;
  onSetConfirmCancel: (id: string | null) => void;
}) {
  const isUpcoming = booking.status === 'pending' || booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-1">
            {booking.serviceName}
          </h3>
          {booking.providerName && (
            <p className="text-xs text-gray-500 mt-0.5">{booking.providerName}</p>
          )}
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${
            STATUS_COLORS[booking.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {booking.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {format(new Date(booking.scheduledAt), 'dd MMM yyyy, h:mm a')}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {booking.durationMinutes} min
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-saffron-500">
          {formatINR(booking.amountPaise)}
        </span>
        <span className="text-xs text-gray-400 capitalize">{booking.type}</span>
      </div>

      {(isUpcoming || isCompleted) && (
        <div className="flex gap-2">
          {isUpcoming && (
            confirmCancelId === booking.id ? (
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => onCancel(booking.id)}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl active:scale-95 transition-transform"
                >
                  Confirm Cancel
                </button>
                <button
                  onClick={() => onSetConfirmCancel(null)}
                  className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-300 rounded-xl active:scale-95 transition-transform"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSetConfirmCancel(booking.id)}
                className="flex-1 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl active:scale-95 transition-transform"
              >
                Cancel
              </button>
            )
          )}
          {isUpcoming && booking.type === 'online' && booking.status === 'confirmed' && (
            <button
              onClick={() => {}}
              className="flex-1 py-2 text-xs font-semibold text-white bg-saffron-500 rounded-xl active:scale-95 transition-transform"
            >
              Join Session
            </button>
          )}
          {isCompleted && (
            <button
              onClick={() => onRate(booking.id)}
              className="flex-1 py-2 text-xs font-semibold text-saffron-500 border border-saffron-500 rounded-xl active:scale-95 transition-transform"
            >
              Rate & Review
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function BookingsInner() {
  const { accessToken } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('upcoming');
  // Per-tab caches — avoids refetching when switching back to an already-loaded tab
  const [cache, setCache] = useState<Partial<Record<Tab, Booking[]>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Map UI tabs → server-side status query params
  const TAB_STATUS: Record<Tab, string> = {
    upcoming:  'pending,confirmed',
    past:      'completed,refunded',
    cancelled: 'cancelled',
  };

  const fetchTab = async (t: Tab, showRefresh = false) => {
    if (!accessToken) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // Fetch each status separately and merge (API accepts one status at a time)
      const statuses = TAB_STATUS[t].split(',') as BookingStatusFilter[];
      const results = await Promise.all(
        statuses.map((s) => getMyBookings(accessToken, 1, s))
      );
      const merged = results.flatMap((r) => r.bookings)
        .sort((a, b) => new Date(b.scheduledAt ?? b.createdAt).getTime() - new Date(a.scheduledAt ?? a.createdAt).getTime());
      setCache((prev) => ({ ...prev, [t]: merged }));
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch on mount and whenever the tab changes (only if not already cached)
  useEffect(() => {
    if (!cache[tab]) fetchTab(tab);
    else setLoading(false);
  }, [accessToken, tab]);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessToast(true);
      setTimeout(() => setSuccessToast(false), 3000);
    }
  }, [searchParams]);

  const filtered = cache[tab] ?? [];

  const handleCancel = async (bookingId: string) => {
    if (!accessToken) return;
    if (confirmCancelId !== bookingId) { setConfirmCancelId(bookingId); return; }
    setConfirmCancelId(null);
    try {
      await cancelBooking(accessToken, bookingId, 'User cancelled');
      // Optimistically remove from upcoming cache and invalidate cancelled cache
      setCache((prev) => ({
        ...prev,
        upcoming: (prev.upcoming ?? []).filter((b) => b.id !== bookingId),
        // Invalidate cancelled tab so it refetches on next visit
        cancelled: undefined,
      }));
    } catch {
      alert('Failed to cancel. Please try again.');
    }
  };

  const handleRate = (bookingId: string) => {
    router.push(`/bookings/${bookingId}/review`);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-parchment-100/95 backdrop-blur-sm px-4 pt-12 pb-0 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="section-title text-xl">My Bookings</h1>
          <button
            onClick={() => { setCache((p) => ({ ...p, [tab]: undefined })); fetchTab(tab, true); }}
            disabled={refreshing}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition-transform"
          >
            <svg
              className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === t.key
                  ? 'bg-white text-saffron-500 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 bottom-safe">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">
              {tab === 'upcoming' ? '📅' : tab === 'past' ? '✅' : '❌'}
            </div>
            <p className="font-cinzel font-semibold text-sacred-700 text-base mb-1">
              No {tab} bookings
            </p>
            <p className="text-sm text-gray-500 max-w-[220px]">
              {tab === 'upcoming'
                ? 'Book a service to get started'
                : tab === 'past'
                ? 'Completed sessions will appear here'
                : 'Cancelled bookings will appear here'}
            </p>
            {tab === 'upcoming' && (
              <button
                onClick={() => router.push('/home')}
                className="mt-4 btn-saffron text-sm"
              >
                Explore Services
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="flex flex-col gap-3">
              {filtered.map((b: any) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  onCancel={handleCancel}
                  onRate={handleRate}
                  confirmCancelId={confirmCancelId}
                  onSetConfirmCancel={setConfirmCancelId}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg z-50"
          >
            Booking confirmed!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-parchment-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-saffron-500/30 border-t-saffron-500 rounded-full animate-spin" />
      </div>
    }>
      <BookingsInner />
    </Suspense>
  );
}
