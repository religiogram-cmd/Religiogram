'use client';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ background: '#FDF6E3', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16 }}>
        <h2 style={{ color: '#0F2452', fontSize: 20 }}>Something went wrong</h2>
        <p style={{ color: '#8B6B35', fontSize: 14 }}>{error.message}</p>
        <button onClick={reset} style={{ background: '#C8920A', color: '#fff', padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
