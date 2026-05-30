'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import OnlineConsultationScreen from '@/components/consultation/OnlineConsultationScreen';
import { tokenStore } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

export default function ConsultProviderPage() {
  const { providerId } = useParams();
  const router = useRouter();
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const handleStartSession = async (pId: string, mode: 'chat' | 'call') => {
    setInitiating(true);
    setInitError(null);
    const tok = tokenStore.access ?? '';
    try {
      const res = await fetch(`${API_BASE}/api/v1/consultation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: 'Bearer ' + tok } : {}),
        },
        body: JSON.stringify({ providerId: pId, planType: 'intro_5' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Handle insufficient balance specifically
        if (res.status === 402 || body?.message?.toLowerCase?.().includes('balance')) {
          setInitError('Insufficient wallet balance. Please top up and try again.');
        } else {
          setInitError(body?.message ?? `Could not start session (${res.status}). Please try again.`);
        }
        return;
      }
      const data = await res.json();
      const sessionId: string = data?.data?.id ?? data?.id ?? data?.sessionId;
      if (!sessionId) {
        setInitError('Session started but no session ID returned. Please try again.');
        return;
      }
      router.push(`/consultation/${sessionId}?mode=${mode}`);
    } catch (err) {
      setInitError('Network error. Please check your connection and try again.');
    } finally {
      setInitiating(false);
    }
  };

  return (
    <>
      {initError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#FEE2E2', color: '#991B1B', padding: '12px 20px',
          fontSize: 14, fontWeight: 600, textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{initError}</span>
          <button
            onClick={() => setInitError(null)}
            style={{ background: 'none', border: 'none', color: '#991B1B', fontSize: 18, cursor: 'pointer', padding: '0 0 0 12px' }}
          >&#x2715;</button>
        </div>
      )}
      {initiating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#FFFBF0', borderRadius: 16, padding: '28px 36px', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid #C8920A', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <style>{'@keyframes spin{to{transform:rotate(360deg);}}'}</style>
            <p style={{ color: '#1B2A5C', fontWeight: 700, margin: 0 }}>Starting session…</p>
          </div>
        </div>
      )}
      <OnlineConsultationScreen
        providerId={providerId as string}
        onBack={() => router.back()}
        onStartSession={handleStartSession}
      />
    </>
  );
}
