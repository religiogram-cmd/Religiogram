'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

let push: ((t: Omit<Toast, 'id'>) => void) | null = null;

/** Show a toast — usable from anywhere without React context. */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (push) push({ message, type });
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
    };
    return () => { push = null; };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(72px + env(safe-area-inset-bottom))',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const palette = t.type === 'success'
          ? { bg: '#0F2452', fg: '#FFFAEC', accent: '#22C55E' }
          : t.type === 'error'
          ? { bg: '#7F1D1D', fg: '#FFFAEC', accent: '#F87171' }
          : { bg: '#1F2937', fg: '#fff', accent: '#C8920A' };
        return (
          <div key={t.id} style={{
            background: palette.bg, color: palette.fg,
            padding: '10px 16px', borderRadius: 22,
            fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif',
            boxShadow: '0 8px 30px rgba(0,0,0,0.30)',
            display: 'flex', alignItems: 'center', gap: 8,
            maxWidth: 360, animation: 'rg-toast-in 0.25s ease-out',
            borderLeft: `3px solid ${palette.accent}`,
          }}>
            {t.message}
          </div>
        );
      })}
      <style>{`
        @keyframes rg-toast-in {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
