'use client';
import { formatINR } from '@/lib/format-currency';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';

const GOLD = '#C8920A';
const GOLD2 = '#E8A020';
const NAVY = '#0A1628';
const RED = '#DC2626';
const GREEN = '#16a34a';

const API = () => process.env.NEXT_PUBLIC_API_BASE ?? '';
const H = () => ({ Authorization: `Bearer ${tokenStore.access ?? ''}`, 'Content-Type': 'application/json' });
const get = (path: string) => fetch(`${API()}${path}`, { headers: H() }).then(r => r.ok ? r.json() : null);
const patch = (path: string, body: any) => fetch(`${API()}${path}`, { method: 'PATCH', headers: H(), body: JSON.stringify(body) }).then(r => r.json());

type Console = 'overview' | 'providers' | 'bookings' | 'disputes' | 'kyc' | 'payouts' | 'fraud' | 'announcements' | 'analytics';

export default function AdminPanel() {
  const router = useRouter();
  const [active, setActive] = useState<Console>('overview');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => { get('/admin/analytics/overview').then(d => d && setStats(d)); }, []);

  const navItems: { id: Console; label: string; icon: string }[] = [
    { id: 'overview',      label: 'Overview',      icon: '📊' },
    { id: 'providers',     label: 'Providers',     icon: '👤' },
    { id: 'bookings',      label: 'Bookings',      icon: '📅' },
    { id: 'disputes',      label: 'Disputes',      icon: '⚖️' },
    { id: 'kyc',           label: 'KYC / Verify',  icon: '🪪' },
    { id: 'payouts',       label: 'Payouts',       icon: '💸' },
    { id: 'fraud',         label: 'Fraud',         icon: '🚨' },
    { id: 'announcements', label: 'Announce',      icon: '📣' },
    { id: 'analytics',     label: 'Analytics',     icon: '📈' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100svh', background: '#F1F5F9', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: NAVY, display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top,0px)', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid rgba(255,255,255,0.1)` }}>
          <p style={{ color: GOLD, fontSize: 16, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif' }}>ReligioGram</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0' }}>Admin Console</p>
        </div>
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setActive(n.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              background: active === n.id ? `${GOLD}20` : 'transparent',
              border: 'none', borderLeft: active === n.id ? `3px solid ${GOLD2}` : '3px solid transparent',
              cursor: 'pointer', color: active === n.id ? GOLD2 : 'rgba(255,255,255,0.6)',
              fontSize: 12, fontWeight: active === n.id ? 700 : 500, textAlign: 'left',
            }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <button onClick={() => router.push('/home')} style={{ margin: 12, padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>← Back to App</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {active === 'overview'      && <OverviewConsole stats={stats} />}
        {active === 'providers'     && <ProvidersConsole />}
        {active === 'bookings'      && <BookingsConsole />}
        {active === 'disputes'      && <DisputesConsole />}
        {active === 'kyc'           && <KycConsole />}
        {active === 'payouts'       && <PayoutsConsole />}
        {active === 'fraud'         && <FraudConsole />}
        {active === 'announcements' && <AnnouncementsConsole />}
        {active === 'analytics'     && <AnalyticsConsole />}
      </div>
    </div>
  );
}

/* ── Shared helpers ───────────────────────────────────────────── */
function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0, fontFamily: '"Playfair Display",Georgia,serif' }}>{title}</h1>
      {sub && <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style }}>{children}</div>;
}

function StatTile({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: color ?? NAVY, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{sub}</p>}
    </Card>
  );
}

type Status = 'pending'|'approved'|'rejected'|'completed'|'open'|'resolved';
const STATUS_COLOR: Record<Status, [string, string]> = {
  pending:   ['#fef9c3', '#92400e'],
  approved:  ['#dcfce7', '#166534'],
  rejected:  ['#fee2e2', '#991b1b'],
  completed: ['#dcfce7', '#166534'],
  open:      ['#fef9c3', '#92400e'],
  resolved:  ['#dcfce7', '#166534'],
};
function Badge({ status }: { status: string }) {
  const [bg, fg] = STATUS_COLOR[status as Status] ?? ['#f1f5f9', '#475569'];
  return <span style={{ background: bg, color: fg, borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

function DataTable({ cols, rows, onAction }: { cols: string[]; rows: any[][]; onAction?: (rowIdx: number, action: string) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #f1f5f9', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '12px', color: NAVY, verticalAlign: 'middle' }}>
                  {typeof cell === 'string' && ['pending','approved','rejected','completed','open','resolved'].includes(cell)
                    ? <Badge status={cell} />
                    : cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No data found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────── */
function OverviewConsole({ stats }: { stats: any }) {
  const [health, setHealth] = useState<{ status: string; checks: Record<string, any> } | null>(null);

  useEffect(() => {
    const fetchHealth = () => {
      get('/health/ready')
        .then((d) => d && setHealth(d))
        .catch(() => setHealth(null));
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <PageHeader title="Platform Overview" sub="Real-time snapshot of ReligioGram operations" />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatTile label="Total Users"        value={stats?.totalUsers?.toLocaleString('en-IN') ?? '—'} />
        <StatTile label="Active Providers"   value={stats?.activeProviders ?? '—'} color={GREEN} />
        <StatTile label="Bookings Today"     value={stats?.bookingsToday ?? '—'} color={GOLD} />
        <StatTile label="Revenue (Month)"    value={stats?.revenueMonth ? formatINR(stats.revenueMonth) : '—'} color={GREEN} />
        <StatTile label="Open Disputes"      value={stats?.openDisputes ?? '—'} color={stats?.openDisputes > 5 ? RED : NAVY} />
        <StatTile label="Pending KYC"        value={stats?.pendingKyc ?? '—'} color={stats?.pendingKyc > 10 ? '#f59e0b' : NAVY} />
      </div>
      <Card>
        <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>System Health</p>
        {health === null ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontSize: 13 }}>
            Loading health status…
          </p>
        ) : (
          Object.entries(health.checks ?? {}).map(([label, check]: [string, any]) => {
            const isUp = check?.status === 'up' || check === 'up';
            return (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: 13, color: '#475569', textTransform: 'capitalize' }}>{label.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? GREEN : RED }}>
                  ● {isUp ? 'Operational' : 'Degraded'}
                </span>
              </div>
            );
          })
        )}
        {health !== null && Object.keys(health.checks ?? {}).length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: '#475569' }}>Overall</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: health.status === 'ok' ? GREEN : RED }}>
              ● {health.status === 'ok' ? 'Operational' : 'Degraded'}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Providers ────────────────────────────────────────────────── */
function ProvidersConsole() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    get('/admin/providers?limit=50').then(d => { setProviders(d?.items ?? d ?? []); setLoading(false); });
  }, []);

  const filtered = providers.filter((p: any) =>
    !search || p.user?.name?.toLowerCase().includes(search.toLowerCase()) || p.religion?.includes(search.toLowerCase())
  );

  async function toggleVerify(id: string, current: boolean) {
    await patch(`/admin/providers/${id}/verify`, { isVerified: !current });
    setProviders((ps: any) => ps.map((p: any) => p.id === id ? { ...p, isVerified: !current } : p));
  }

  return (
    <div>
      <PageHeader title="Service Providers" sub="Manage priests, pandits, imams, granthis and pastors" />
      <Card>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or faith..."
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: NAVY, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p> : (
          <DataTable
            cols={['Name', 'Faith', 'City', 'Rating', 'Bookings', 'Status', 'Actions']}
            rows={filtered.map((p: any) => [
              p.user?.name ?? 'Unknown',
              <span style={{ textTransform: 'capitalize' }}>{p.religion ?? '—'}</span>,
              p.city ?? '—',
              `${(p.averageRating ?? 0).toFixed(1)} ★`,
              p.bookingCount ?? 0,
              p.isVerified ? 'approved' : 'pending',
              <button onClick={() => toggleVerify(p.id, p.isVerified)} style={{
                padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: p.isVerified ? '#fee2e2' : '#dcfce7', color: p.isVerified ? RED : GREEN,
              }}>{p.isVerified ? 'Revoke' : 'Approve'}</button>
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/* ── Bookings ─────────────────────────────────────────────────── */
function BookingsConsole() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    get(`/admin/bookings${q}`).then(d => { setBookings(d?.items ?? d ?? []); setLoading(false); });
  }, [statusFilter]);

  return (
    <div>
      <PageHeader title="Bookings" sub="Monitor and manage all service bookings" />
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['all','pending','confirmed','completed','cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 14px', borderRadius: 100, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: statusFilter === s ? NAVY : '#f1f5f9', color: statusFilter === s ? '#fff' : '#64748b',
            }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p> : (
          <DataTable
            cols={['ID', 'User', 'Provider', 'Service', 'Date', 'Amount', 'Status']}
            rows={bookings.map((b: any) => [
              b.id?.slice(0,8) + '…',
              b.user?.name ?? '—',
              b.provider?.user?.name ?? '—',
              b.serviceName ?? b.service ?? '—',
              b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('en-IN') : '—',
              formatINR(b.totalAmount ?? 0),
              b.status ?? 'pending',
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/* ── Disputes ─────────────────────────────────────────────────── */
function DisputesConsole() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { get('/admin/disputes?limit=50').then(d => { setDisputes(d?.items ?? d ?? []); setLoading(false); }); }, []);

  async function resolve(id: string, decision: string) {
    await patch(`/admin/disputes/${id}/resolve`, { decision, adminNote: `Resolved by admin: ${decision}` });
    setDisputes((ds: any) => ds.map((d: any) => d.id === id ? { ...d, status: 'resolved' } : d));
  }

  return (
    <div>
      <PageHeader title="Disputes" sub="Resolve conflicts between users and providers" />
      <Card>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p> : (
          <DataTable
            cols={['ID', 'Raised By', 'Against', 'Reason', 'Opened', 'Status', 'Actions']}
            rows={disputes.map((d: any) => [
              d.id?.slice(0,8) + '…',
              d.raisedBy?.name ?? '—',
              d.against?.name ?? '—',
              d.reason ?? '—',
              d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-IN') : '—',
              d.status ?? 'open',
              d.status === 'open' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => resolve(d.id, 'favour_user')} style={{ padding: '3px 10px', background: '#dcfce7', color: GREEN, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>User Wins</button>
                  <button onClick={() => resolve(d.id, 'favour_provider')} style={{ padding: '3px 10px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Provider Wins</button>
                </div>
              ) : '—',
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/* ── KYC / Priest Verification ───────────────────────────────── */
type ProviderState = 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended' | 'blocked';

interface VerificationRecord {
  providerId: string;
  providerName: string;
  religion: string;
  serviceMode: string;
  providerState: ProviderState;
  submittedAt: string;
  kycVideoUrl?: string;
  rejectionReason?: string;
}

function KycConsole() {
  const [queue, setQueue] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VerificationRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [infoRequest, setInfoRequest] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'approved'>('queue');
  const [actionLoading, setActionLoading] = useState(false);

  const API_V1 = (path: string) => `/api/v1${path}`;
  const authPost = (path: string, body: any) =>
    fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? ''}${API_V1(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.access ?? ''}` },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const loadQueue = (tab: 'queue' | 'approved') => {
    setLoading(true);
    const state = tab === 'queue' ? 'submitted' : 'approved';
    get(`/api/v1/admin/verifications/queue?providerState=${state}&limit=50`)
      .then(d => {
        setQueue(d?.items ?? d?.data ?? d ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadQueue(activeTab); }, [activeTab]);

  const openDetail = async (rec: VerificationRecord) => {
    setSelected(rec);
    setVideoUrl(null);
    setRejectReason('');
    setInfoRequest('');
    try {
      const res = await get(`/api/v1/admin/verifications/${rec.providerId}`);
      setVideoUrl(res?.kycVideoUrl ?? res?.data?.kycVideoUrl ?? null);
    } catch { /* ignore */ }
  };

  const doAction = async (action: 'approve' | 'reject' | 'request_info' | 'suspend' | 'reinstate' | 'block') => {
    if (!selected) return;
    setActionLoading(true);
    try {
      let body: any = {};
      if (action === 'reject') body = { reason: rejectReason || 'Does not meet requirements' };
      if (action === 'request_info') body = { note: infoRequest || 'Please provide additional information' };
      await authPost(`/admin/verifications/${selected.providerId}/${action}`, body);
      setSelected(null);
      loadQueue(activeTab);
    } finally {
      setActionLoading(false);
    }
  };

  const stateColor: Record<ProviderState, string> = {
    pending: '#94a3b8', submitted: '#f59e0b', approved: GREEN,
    rejected: RED, suspended: '#f97316', blocked: '#7c3aed',
  };

  return (
    <div>
      <PageHeader title="Priest Verification Queue" sub="Review KYC videos and approve or reject provider applications" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['queue', 'approved'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '7px 18px', borderRadius: 99,
            backgroundColor: activeTab === tab ? NAVY : '#fff',
            color: activeTab === tab ? '#fff' : '#475569',
            border: `1.5px solid ${activeTab === tab ? NAVY : '#e2e8f0'}`,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            {tab === 'queue' ? '⏳ Pending Review' : '✅ Approved Providers'}
          </button>
        ))}
      </div>

      <Card>
        {loading
          ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p>
          : queue.length === 0
            ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>
                {activeTab === 'queue' ? '✅ Queue empty — all applications reviewed!' : 'No approved providers yet.'}
              </p>
            : (
              <DataTable
                cols={['Provider', 'Religion', 'Service Mode', 'Submitted', 'State', 'Actions']}
                rows={queue.map(r => [
                  r.providerName ?? '—',
                  r.religion ?? '—',
                  r.serviceMode ?? '—',
                  r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN') : '—',
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    backgroundColor: `${stateColor[r.providerState]}20`,
                    color: stateColor[r.providerState],
                  }}>{r.providerState}</span>,
                  <button onClick={() => openDetail(r)} style={{
                    padding: '3px 12px', background: `${NAVY}18`, color: NAVY,
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  }}>Review</button>,
                ])}
              />
            )
        }
      </Card>

      {/* ── Detail drawer ── */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 900,
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        }} onClick={() => setSelected(null)}>
          <div
            style={{
              width: '100%', maxWidth: 520,
              height: '100vh',
              backgroundColor: '#fff',
              overflowY: 'auto',
              padding: '28px 24px',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button onClick={() => setSelected(null)} style={{
              position: 'absolute', top: 20, right: 20,
              background: '#f1f5f9', border: 'none', borderRadius: '50%',
              width: 32, height: 32, cursor: 'pointer', fontSize: 16,
            }}>✕</button>

            <h2 style={{ color: NAVY, fontWeight: 800, fontSize: 20, margin: '0 0 4px' }}>
              {selected.providerName}
            </h2>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>
              {selected.religion} · {selected.serviceMode} · {selected.providerState}
            </p>

            {/* KYC Video */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontWeight: 700, color: NAVY, fontSize: 14, marginBottom: 8 }}>KYC Introduction Video</p>
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', borderRadius: 12, border: '2px solid #e2e8f0', maxHeight: 280, objectFit: 'cover', background: '#000' }}
                />
              ) : (
                <div style={{
                  height: 180, borderRadius: 12, border: '2px dashed #e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#94a3b8', fontSize: 13,
                }}>
                  {loading ? 'Loading video…' : 'No video available'}
                </div>
              )}
            </div>

            {/* Actions for submitted state */}
            {selected.providerState === 'submitted' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button disabled={actionLoading} onClick={() => doAction('approve')} style={{
                  padding: '13px', background: GREEN, color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                }}>✓ Approve Provider</button>

                <div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>Rejection reason (required):</p>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. Video quality too low, face not visible…"
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
                  />
                  <button disabled={actionLoading || !rejectReason.trim()} onClick={() => doAction('reject')} style={{
                    marginTop: 6, padding: '11px', width: '100%', background: '#fff', color: RED,
                    border: `1.5px solid ${RED}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    opacity: (!rejectReason.trim() || actionLoading) ? 0.5 : 1,
                  }}>✕ Reject Application</button>
                </div>

                <div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>Request more information:</p>
                  <textarea
                    value={infoRequest}
                    onChange={e => setInfoRequest(e.target.value)}
                    placeholder="e.g. Please re-record with better lighting…"
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
                  />
                  <button disabled={actionLoading || !infoRequest.trim()} onClick={() => doAction('request_info')} style={{
                    marginTop: 6, padding: '11px', width: '100%', background: '#fff', color: '#f59e0b',
                    border: '1.5px solid #f59e0b', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    opacity: (!infoRequest.trim() || actionLoading) ? 0.5 : 1,
                  }}>ℹ️ Request Info</button>
                </div>
              </div>
            )}

            {/* Actions for approved providers */}
            {selected.providerState === 'approved' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={actionLoading} onClick={() => doAction('suspend')} style={{
                  padding: '10px 16px', background: '#fff7ed', color: '#f97316',
                  border: '1.5px solid #fed7aa', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}>⏸ Suspend</button>
                <button disabled={actionLoading} onClick={() => doAction('block')} style={{
                  padding: '10px 16px', background: '#faf5ff', color: '#7c3aed',
                  border: '1.5px solid #e9d5ff', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}>🚫 Block</button>
              </div>
            )}

            {/* Reinstate for suspended */}
            {selected.providerState === 'suspended' && (
              <button disabled={actionLoading} onClick={() => doAction('reinstate')} style={{
                padding: '13px', width: '100%', background: GREEN, color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>↩ Reinstate Provider</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Payouts ──────────────────────────────────────────────────── */
function PayoutsConsole() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { get('/admin/wallet/payouts?limit=50').then(d => { setPayouts(d?.items ?? d ?? []); setLoading(false); }); }, []);

  async function approve(id: string) {
    await patch(`/admin/wallet/payouts/${id}/approve`, {});
    setPayouts((ps: any) => ps.map((p: any) => p.id === id ? { ...p, status: 'approved' } : p));
  }

  return (
    <div>
      <PageHeader title="Payout Management" sub="T+2 settlement approval and TDS compliance" />
      <Card>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p> : (
          <DataTable
            cols={['Provider', 'Amount', 'TDS (10%)', 'Net', 'Bank Account', 'Scheduled', 'Status', 'Actions']}
            rows={payouts.map((p: any) => [
              p.provider?.user?.name ?? '—',
              formatINR(p.grossAmount ?? 0),
              formatINR(p.tdsAmount ?? 0),
              formatINR(p.netAmount ?? 0),
              p.bankAccount ?? '••••' + (p.accountLast4 ?? ''),
              p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString('en-IN') : '—',
              p.status ?? 'pending',
              p.status === 'pending' ? (
                <button onClick={() => approve(p.id)} style={{ padding: '3px 10px', background: '#dcfce7', color: GREEN, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Release</button>
              ) : '—',
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/* ── Fraud ────────────────────────────────────────────────────── */
function FraudConsole() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { get('/admin/fraud/alerts?limit=50').then(d => { setAlerts(d?.items ?? d ?? []); setLoading(false); }); }, []);

  async function dismiss(id: string) {
    await patch(`/admin/fraud/alerts/${id}`, { status: 'dismissed' });
    setAlerts((a: any) => a.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <PageHeader title="Fraud Detection" sub="Velocity checks and suspicious activity alerts" />
      <Card>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Loading…</p> :
         alerts.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>✅ No active fraud alerts</p> : (
          <DataTable
            cols={['User/Provider', 'Rule Triggered', 'Risk Score', 'Detected At', 'Actions']}
            rows={alerts.map((a: any) => [
              a.subject?.name ?? a.userId ?? '—',
              a.rule ?? a.ruleTriggered ?? '—',
              <span style={{ fontWeight: 700, color: (a.score ?? 0) > 70 ? RED : '#f59e0b' }}>{a.score ?? 0}/100</span>,
              a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN') : '—',
              <button onClick={() => dismiss(a.id)} style={{ padding: '3px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Dismiss</button>,
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/* ── Announcements ────────────────────────────────────────────── */
function AnnouncementsConsole() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [faith, setFaith] = useState('all');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!title || !body) return;
    setSending(true);
    try {
      await fetch(`${API()}/notifications/broadcast`, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ title, body, faith: faith === 'all' ? undefined : faith }),
      });
      setSent(true); setTitle(''); setBody('');
      setTimeout(() => setSent(false), 3000);
    } catch { }
    setSending(false);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box', marginBottom: 12 };

  return (
    <div>
      <PageHeader title="Announcements" sub="Send push notifications to users by faith segment" />
      <Card style={{ maxWidth: 560 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Broadcast Notification</p>
        {sent && <div style={{ background: '#dcfce7', borderRadius: 10, padding: '10px 14px', marginBottom: 12, color: GREEN, fontSize: 13, fontWeight: 600 }}>✅ Announcement sent successfully!</div>}
        <select value={faith} onChange={e => setFaith(e.target.value)} style={{ ...inp }}>
          <option value="all">All Users</option>
          <option value="hindu">Hindu</option>
          <option value="muslim">Muslim</option>
          <option value="sikh">Sikh</option>
          <option value="christian">Christian</option>
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title" style={inp} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification message..." rows={4}
          style={{ ...inp, resize: 'vertical', fontFamily: '"Plus Jakarta Sans",sans-serif' }} />
        <button onClick={send} disabled={sending || !title || !body} style={{
          background: title && body ? GOLD2 : '#e2e8f0', color: title && body ? NAVY : '#94a3b8',
          border: 'none', borderRadius: 10, padding: '12px 0', width: '100%',
          fontSize: 13, fontWeight: 700, cursor: title && body ? 'pointer' : 'not-allowed',
        }}>{sending ? 'Sending…' : 'Send Announcement'}</button>
      </Card>
    </div>
  );
}

/* ── Analytics ────────────────────────────────────────────────── */
function AnalyticsConsole() {
  const [data, setData] = useState<any>(null);

  useEffect(() => { get('/admin/analytics/overview').then(d => d && setData(d)); }, []);

  return (
    <div>
      <PageHeader title="Analytics" sub="Platform KPIs and growth metrics" />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatTile label="Total Users"       value={data?.totalUsers?.toLocaleString('en-IN') ?? '—'} />
        <StatTile label="MAU"               value={data?.mau?.toLocaleString('en-IN') ?? '—'} color={GOLD} />
        <StatTile label="Providers"         value={data?.activeProviders ?? '—'} />
        <StatTile label="GMV (Month)"       value={data?.gmvMonth ? formatINR(data.gmvMonth) : '—'} color={GREEN} />
        <StatTile label="Platform Revenue"  value={data?.revenueMonth ? formatINR(data.revenueMonth) : '—'} color={GOLD} />
        <StatTile label="Avg Booking Value" value={data?.avgBookingValue ? formatINR(data.avgBookingValue) : '—'} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card style={{ flex: 1, minWidth: 280 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Bookings by Faith</p>
          {(['hindu','muslim','sikh','christian'] as const).map(f => {
            const count = data?.bookingsByFaith?.[f] ?? 0;
            const total = data?.totalBookings || 1;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={f} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, textTransform: 'capitalize' }}>{f}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                  <div style={{ height: 8, background: GOLD2, borderRadius: 4, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </Card>
        <Card style={{ flex: 1, minWidth: 280 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>Top Metrics</p>
          {[
            { label: 'Total Bookings',       value: data?.totalBookings?.toLocaleString() ?? '—' },
            { label: 'Consultation Minutes', value: data?.consultationMinutes?.toLocaleString() ?? '—' },
            { label: 'Reviews Written',      value: data?.totalReviews?.toLocaleString() ?? '—' },
            { label: 'Disputes Filed',       value: data?.totalDisputes ?? '—' },
            { label: 'KYC Approved',         value: data?.kycApproved ?? '—' },
            { label: 'Payouts Processed',    value: data?.payoutsProcessed ? formatINR(data.payoutsProcessed) : '—' },
          ].map(m => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{m.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{m.value}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
