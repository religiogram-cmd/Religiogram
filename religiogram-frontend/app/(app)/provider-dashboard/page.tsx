'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useAuthStore } from '@/lib/store';
import {
  getProviderBookings,
  updateBookingStatus,
  type Booking,
} from '@/lib/bookings-api';

interface Stats {
  todayBookings: number;
  totalEarningsPaise: number;
  avgRating: number;
  pendingReviews: number;
}

// Simple CSS bar chart component
function EarningsBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[9px] text-gray-400 font-medium">
        ₹{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </span>
      <div className="w-full bg-gray-100 rounded-full relative" style={{ height: 60 }}>
        <div
          className="absolute bottom-0 left-0 right-0 bg-saffron-500 rounded-full transition-all duration-500"
          style={{ height: `${pct}%`, minHeight: pct > 0 ? 4 : 0 }}
        />
      </div>
      <span className="text-[9px] text-gray-400">{label}</span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-600',
  completed: 'bg-blue-100 text-blue-700',
};

export default function ProviderDashboardPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Redirect if not a provider
  useEffect(() => {
    if (user && user.role !== 'provider' && user.role !== 'admin') {
      router.replace('/home');
    }
  }, [user, router]);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    getProviderBookings(accessToken)
      .then((r) => setBookings(r.bookings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  const handleStatusChange = async (
    bookingId: string,
    status: 'confirmed' | 'completed' | 'cancelled'
  ) => {
    if (!accessToken || actionLoading) return;
    setActionLoading(bookingId + status);
    try {
      await updateBookingStatus(accessToken, bookingId, status);
      setBookings((prev: any) =>
        prev.map((b: any) => (b.id === bookingId ? { ...b, status } : b))
      );
    } catch {
      alert('Failed to update status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Derived stats
  const today = new Date().toDateString();
  const todayBookings = bookings.filter((b: any) => new Date(b.scheduledAt).toDateString() === today).length;

  const totalEarningsPaise = bookings
    .filter((b: any) => b.status === 'completed')
    .reduce((sum: any, b: any) => sum + b.amountPaise, 0);

  const stats: Stats = {
    todayBookings,
    totalEarningsPaise,
    avgRating: 4.7, // would come from provider profile API
    pendingReviews: bookings.filter((b: any) => b.status === 'completed').length,
  };

  // Mock weekly earnings for bar chart (Mon–Sun)
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekEarnings = [1200, 3400, 800, 5600, 2100, 7800, 4500];
  const maxEarning = Math.max(...weekEarnings);

  const pendingBookings = bookings.filter((b: any) => b.status === 'pending');
  const confirmedBookings = bookings.filter((b: any) => b.status === 'confirmed');
  const activeBookings = [...pendingBookings, ...confirmedBookings];

  if (user && user.role !== 'provider' && user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-cinzel font-semibold text-sacred-700 text-xl">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {format(new Date(), 'EEEE, dd MMMM yyyy')}
            </p>
          </div>
          <button
            onClick={() => router.push('/profile')}
            className="w-10 h-10 rounded-full bg-saffron-50 flex items-center justify-center"
          >
            <span className="text-lg">👤</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-4 pb-24 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Today's bookings", value: stats.todayBookings.toString(), sub: "Today's bookings", icon: '📅', color: 'bg-blue-50' },
            { label: 'Total earnings', value: `₹${(stats.totalEarningsPaise / 100).toLocaleString('en-IN')}`, sub: 'Total earnings', icon: '💰', color: 'bg-green-50' },
            { label: 'Average rating', value: stats.avgRating.toFixed(1), sub: 'Average rating', icon: '⭐', color: 'bg-yellow-50' },
            { label: 'Completed sessions', value: stats.pendingReviews.toString(), sub: 'Completed sessions', icon: '✅', color: 'bg-purple-50' },
          ].map((stat, i) => (
            <div key={i} className={`${stat.color} rounded-2xl p-3.5`}>
              <div className="text-2xl mb-1">{stat.icon}</div>
              <p className="font-bold text-gray-900 text-xl leading-tight">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Weekly earnings chart */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">Weekly Earnings</h2>
            <span className="text-xs text-gray-400">This week</span>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 80 }}>
            {weekDays.map((day, i) => (
              <EarningsBar key={day} label={day} value={weekEarnings[i]} max={maxEarning} />
            ))}
          </div>
        </div>

        {/* Active bookings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">
              Active Bookings
              {activeBookings.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold bg-saffron-50 text-saffron-500 px-1.5 py-0.5 rounded-full">
                  {activeBookings.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => router.push('/bookings')}
              className="text-xs text-saffron-500 font-semibold"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="flex gap-2">
                    <div className="h-8 bg-gray-200 rounded-xl flex-1" />
                    <div className="h-8 bg-gray-200 rounded-xl flex-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeBookings.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-gray-500">No active bookings</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeBookings.map((b) => (
                <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-1">
                        {b.serviceName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(b.scheduledAt), 'dd MMM, h:mm a')}
                        {' · '}{b.durationMinutes} min
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_COLORS[b.status] ?? ''}`}>
                      {b.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-saffron-500">
                      ₹{(b.amountPaise / 100).toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{b.type}</span>
                  </div>

                  <div className="flex gap-2">
                    {b.status === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(b.id, 'confirmed')}
                        disabled={actionLoading === b.id + 'confirmed'}
                        className="flex-1 py-2 text-xs font-semibold text-white bg-green-500 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {actionLoading === b.id + 'confirmed' ? '...' : 'Confirm'}
                      </button>
                    )}
                    {b.status === 'confirmed' && (
                      <button
                        onClick={() => handleStatusChange(b.id, 'completed')}
                        disabled={actionLoading === b.id + 'completed'}
                        className="flex-1 py-2 text-xs font-semibold text-white bg-blue-500 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {actionLoading === b.id + 'completed' ? '...' : 'Mark Complete'}
                      </button>
                    )}
                    <button
                      onClick={() => handleStatusChange(b.id, 'cancelled')}
                      disabled={!!actionLoading}
                      className="flex-1 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🕐', label: 'Update Availability', href: '/profile' },
              { icon: '💬', label: 'My Consultations', href: '/bookings' },
              { icon: '⭐', label: 'My Reviews', href: '/profile' },
              { icon: '📊', label: 'Earnings Report', href: '/profile' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="bg-white rounded-2xl p-4 text-left shadow-sm border border-gray-100 active:scale-[0.97] transition-transform"
              >
                <span className="text-2xl block mb-1">{action.icon}</span>
                <p className="text-xs font-semibold text-gray-700 leading-tight">{action.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
