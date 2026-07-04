'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';
import { formatINR } from '@/lib/format-currency';

const GOLD = '#C8920A';
const GOLD2 = '#E8A020';
const NAVY = '#0A1628';

interface DashboardStats {
  totalBookings: number;
  pendingBookings: number;
  completedBookings: number;
  totalEarnings: number;
  pendingPayout: number;
  averageRating: number;
  reviewCount: number;
  isOnline: boolean;
}

export default function ProviderDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const token = tokenStore.access ?? '';
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const [statsRes, bookingsRes] = await Promise.all([
        fetch(`${base}/provider/dashboard/stats`, { headers }),
        fetch(`${base}/bookings?role=provider&limit=10`, { headers }),
      ]);
      if (statsRes.ok) { const d = await statsRes.json(); setStats(d); setIsOnline(d.isOnline ?? false); }
      if (bookingsRes.ok) { const d = await bookingsRes.json(); setBookings(d.items ?? d ?? []); }
    } catch { /* offline fallback */ }
    setLoading(false);
  }

  async function toggleOnline() {
    setTogglingOnline(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const token = tokenStore.access ?? '';
      // Backend route: PATCH /v1/provider/online (mounted at `provider`).
      await fetch(`${base}/provider/online`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline: !isOnline }),
      });
      setIsOnline((p: any) => !p);
    } catch { }
    setTogglingOnline(false);
  }

  const StatCard = ({ label, value, sub, color }: any) => (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px', fontFamily: '"Plus Jakarta Sans",sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: color ?? NAVY, margin: 0, fontFamily: '"Playfair Display",Georgia,serif' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#aaa', margin: '2px 0 0', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{sub}</p>}
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#F6F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${GOLD}30`, borderTopColor: GOLD, borderRadius: '50%' }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: '#F6F7FA', paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top,0px)', padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif' }}>Provider Dashboard</h1>
          <button onClick={toggleOnline} disabled={togglingOnline} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 100,
            background: isOnline ? '#16a34a' : '#6b7280', border: 'none', cursor: 'pointer', opacity: togglingOnline ? 0.6 : 1,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <StatCard label="Total Earnings" value={`${formatINR(stats?.totalEarnings ?? 0)}`} color={GOLD2} />
          <StatCard label="Pending Payout" value={`${formatINR(stats?.pendingPayout ?? 0)}`} color="#f59e0b" />
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Booking stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <StatCard label="Pending" value={stats?.pendingBookings ?? 0} color="#f59e0b" />
          <StatCard label="Completed" value={stats?.completedBookings ?? 0} color="#16a34a" />
          <StatCard label="Rating" value={`${(stats?.averageRating ?? 0).toFixed(1)}★`} color={GOLD} sub={`${stats?.reviewCount ?? 0} reviews`} />
        </div>

        {/* Quick actions */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 12px', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Quick Actions</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'My Bookings', icon: '📅', path: '/bookings' },
              { label: 'Earnings', icon: '💰', path: '/wallet' },
              { label: 'Reviews', icon: '⭐', path: '/profile' },
              { label: 'Availability', icon: '🗓', path: '/profile' },
            ].map(a => (
              <button key={a.label} onClick={() => router.push(a.path)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: '#F6F7FA', border: 'none', borderRadius: 12, padding: '12px 16px',
                cursor: 'pointer', flex: 1, minWidth: 70,
              }}>
                <span style={{ fontSize: 22 }}>{a.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: NAVY, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent bookings */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Recent Bookings</p>
            <button onClick={() => router.push('/bookings')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>View all</button>
          </div>
          {bookings.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>No bookings yet</p>
          ) : (
            bookings.slice(0, 5).map((b: any) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{b.serviceName ?? b.service ?? 'Service'}</p>
                  <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('en-IN') : ''}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                    background: b.status === 'completed' ? '#dcfce7' : b.status === 'pending' ? '#fef9c3' : '#f3f4f6',
                    color: b.status === 'completed' ? '#16a34a' : b.status === 'pending' ? '#92400e' : '#6b7280',
                    fontFamily: '"Plus Jakarta Sans",sans-serif',
                  }}>{b.status}</span>
                  <p style={{ fontSize: 12, fontWeight: 700, color: GOLD, margin: '4px 0 0', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{formatINR(b.totalAmount ?? 0)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
