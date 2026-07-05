'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import OnlineConsultationScreen from '@/components/consultation/OnlineConsultationScreen';
import ActiveSessionScreen, { type SessionSummary } from '@/components/consultation/ActiveSessionScreen';
import SessionCompletionScreen from '@/components/consultation/SessionCompletionScreen';
import { tokenStore } from '@/lib/api';

/* NEXT_PUBLIC_API_BASE already ends in `/api/v1` in prod; don't add it again. */
const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return '/api/v1';
  return 'https://api.religiogram.com/api/v1';
})();

interface BookingData {
  id: string;
  providerId: string;
  providerName?: string;
  serviceName: string;
  amountPaise: number;
  ratePerMinute?: number;
  planType?: 'intro_5' | 'pack_20' | 'pack_30' | 'per_minute';
}

type View = 'discovery' | 'session' | 'completion';

function ConsultationInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = (params?.sessionId as string) ?? '';

  const [view, setView] = useState<View>('discovery');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [walletBal, setWalletBal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sp, setSp] = useState({
    consultantName: '',
    consultantRole: '',
    rate: 35,
    mode: 'chat' as 'chat' | 'call',
    planType: 'intro_5' as BookingData['planType'],
  });

  useEffect(() => {
    if (!sessionId || sessionId === 'new') return;
    setLoading(true);
    setError(null);
    const tok = tokenStore.access ?? '';
    const h: Record<string, string> = tok ? { Authorization: 'Bearer ' + tok } : {};
    Promise.all([
      fetch(API_BASE + '/consultation/' + sessionId, { headers: h }).then(r => {
        if (!r.ok) throw new Error('Session ' + r.status);
        return r.json();
      }),
      fetch(API_BASE + '/wallet/balance', { headers: h }).then(r =>
        r.ok ? r.json() : { availablePaise: 0 }
      ),
    ])
      .then(([br, wr]) => {
        const bk: BookingData = br?.data ?? br;
        const ap: number = wr?.data?.availablePaise ?? wr?.availablePaise ?? 0;
        setBooking(bk);
        setWalletBal(ap / 100);
        setSp({
          consultantName: bk.providerName ?? 'Spiritual Guide',
          consultantRole: bk.serviceName ?? '',
          rate: Math.round(((bk as any).ratePerMinute ?? bk.amountPaise) / 100) || 35,
          mode: (searchParams?.get('mode') as 'chat' | 'call') ?? 'chat',
          planType: bk.planType ?? 'intro_5',
        });
        setView('session');
      })
      .catch(e => {
        console.error(e);
        setError('Could not load session. Please go back and try again.');
      })
      .finally(() => setLoading(false));
  }, [sessionId, searchParams]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#FFFBF0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #C8920A', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
      <style>{'@keyframes spin{to{transform:rotate(360deg);}}'}</style>
      <p style={{ color: '#1B2A5C', fontWeight: 600, fontSize: 16, margin: 0 }}>Loading session…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#FFFBF0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
      <p style={{ color: '#dc2626', fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{error}</p>
      <button onClick={() => router.back()} style={{ background: '#1B2A5C', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        Go Back
      </button>
    </div>
  );

  if (view === 'session') return (
    <ActiveSessionScreen
      sessionId={booking?.id ?? sessionId ?? 'sess-001'}
      consultantName={sp.consultantName}
      consultantRole={sp.consultantRole}
      ratePerMin={sp.rate}
      walletBalance={walletBal || 1250}
      mode={sp.mode}
      planType={sp.planType}
      onSessionEnd={s => { setSummary(s); setView('completion'); }}
    />
  );

  if (view === 'completion' && summary) return (
    <SessionCompletionScreen
      summary={summary}
      onDone={() => router.push('/home')}
      onBookAgain={() => setView('discovery')}
      onInviteFriend={() => router.push('/community')}
      onViewHistory={() => router.push('/bookings')}
    />
  );

  return (
    <OnlineConsultationScreen
      onBack={() => router.back()}
      onStartSession={(_, mode) => {
        setSp(p => ({ ...p, mode }));
        setView('session');
      }}
    />
  );
}

export default function ConsultationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#FFFBF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(200,146,10,0.2)', borderTopColor: '#C8920A', borderRadius: '50%' }} />
      </div>
    }>
      <ConsultationInner />
    </Suspense>
  );
}
