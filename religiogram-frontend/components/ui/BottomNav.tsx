'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUnreadCount } from '@/lib/notifications-api';
import { tokenStore } from '@/lib/api';

const GOLD   = '#C8920A';
const MUTED  = '#A08060';
const BG_NAV = '#FFFAED';

/** Poll interval for the notification badge (30 seconds). */
const BADGE_POLL_MS = 30_000;

function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const token = tokenStore.access;
        if (!token) return;
        const n = await getUnreadCount(token);
        if (!cancelled) setCount(n);
      } catch { /* silently ignore */ }
    };

    fetchCount();
    const timer = setInterval(fetchCount, BADGE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return count;
}

function NavIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div style={{ color: active ? GOLD : MUTED, transition: 'color 0.15s' }}>{children}</div>;
}

const NAV_ITEMS = [
  {
    href: '/home',
    label: 'Home',
    icon: (a: boolean) => (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        {a && <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" fill={GOLD} fillOpacity=".18"/>}
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinejoin="round"/>
        <path d="M9 21v-7h6v7" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: '/priests',
    label: 'Priests',
    icon: (a: boolean) => (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        {a && <circle cx="12" cy="7" r="4" fill={GOLD} fillOpacity=".18"/>}
        <circle cx="12" cy="7" r="4" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6}/>
        <path d="M5.5 21c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinecap="round"/>
        <path d="M9 7c0-1.66 1.34-3 3-3" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.4} strokeLinecap="round"/>
        <path d="M12 4v2.5" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.4} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/places',
    label: 'Holy Places',
    icon: (a: boolean) => (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        {a && <path d="M3 21h18M3 21V10l9-7 9 7v11" fill={GOLD} fillOpacity=".13"/>}
        <path d="M3 21h18M3 21V10l9-7 9 7v11" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinejoin="round"/>
        <rect x="9" y="13" width="6" height="8" rx="1" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.5}/>
        <path d="M12 3v3M10 6h4" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.5} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/social',
    label: 'Community',
    icon: (a: boolean) => (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        {a && <circle cx="9" cy="8" r="3" fill={GOLD} fillOpacity=".18"/>}
        <circle cx="9" cy="8" r="3" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6}/>
        <path d="M3 20c0-2.76 2.69-5 6-5" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinecap="round"/>
        <circle cx="17" cy="10" r="2.5" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.5}/>
        <path d="M13.5 20c0-2.21 1.57-4 3.5-4s3.5 1.79 3.5 4" stroke={a ? GOLD : MUTED} strokeWidth={a ? 1.8 : 1.5} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (a: boolean) => (
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        {a && <circle cx="12" cy="8" r="4" fill={GOLD} fillOpacity=".18"/>}
        <circle cx="12" cy="8" r="4" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6}/>
        <path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" stroke={a ? GOLD : MUTED} strokeWidth={a ? 2 : 1.6} strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname    = usePathname() ?? '';
  const unreadCount = useUnreadCount();

  const active = (href: string) =>
    href === '/home'    ? pathname.startsWith('/home') :
    href === '/priests' ? pathname.startsWith('/priests') || pathname.startsWith('/book/') || pathname.startsWith('/consult') :
    href === '/places'  ? pathname.startsWith('/places') || pathname.startsWith('/place/') || pathname.startsWith('/temple/') :
    href === '/social'  ? pathname.startsWith('/social') :
    pathname.startsWith(href);

  return (
    <nav className="rg-bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: BG_NAV,
      borderTop: `1.5px solid rgba(200,146,10,0.25)`,
      display: 'flex', alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 200,
      boxShadow: '0 -4px 20px rgba(200,146,10,0.12)',
    }}>
      {/* Ornamental top line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, opacity: 0.4 }} />

      {NAV_ITEMS.map(item => {
        const isActive   = active(item.href);
        const showBadge  = item.href === '/profile' && unreadCount > 0;

        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '8px 0 6px',
            textDecoration: 'none',
            position: 'relative',
          }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NavIcon active={isActive}>{item.icon(isActive)}</NavIcon>
              {showBadge && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  background: '#EF4444', color: '#fff',
                  borderRadius: '50%', minWidth: 16, height: 16,
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: '0 2px',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span style={{
              fontSize: 10, marginTop: 3,
              color: isActive ? GOLD : MUTED,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: '.01em',
            }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
