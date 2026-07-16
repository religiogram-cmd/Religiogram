'use client';

/**
 * /admin — top-level admin console layout.
 *
 * Access flow:
 *   1. If no `tokenStore.access` (and no localStorage fallback), redirect /auth.
 *   2. Best-effort fetch /v1/users/me to confirm `role === 'admin'`.
 *      On 403 (or any non-admin role) we render an "Access denied" panel
 *      rather than redirecting — that gives the admin user feedback if their
 *      role was just downgraded, instead of a silent bounce.
 *   3. While the check is in flight, show a small spinner.
 *
 * Visual: slate-900 header, sidebar-style nav on desktop, hamburger drawer
 * on mobile. Consumer-app fonts / colours are avoided deliberately so admins
 * always know they're in the back-office.
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { tokenStore, apiFetch, ApiError } from '@/lib/api';

type GuardState =
  | { kind: 'checking' }
  | { kind: 'allowed' }
  | { kind: 'denied'; message: string };

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (path: string | null | undefined) => boolean;
}

const NAV: NavItem[] = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    match: (p) => p === '/admin' || p === '/admin/dashboard' || (p ?? '').startsWith('/admin/dashboard'),
  },
  {
    href: '/admin/applications',
    label: 'Applications',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><path d="M9 13h6M9 17h6" />
      </svg>
    ),
    match: (p) => (p ?? '').startsWith('/admin/applications'),
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    match: (p) => (p ?? '').startsWith('/admin/users'),
  },
  {
    href: '/admin/providers',
    label: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
    match: (p) => (p ?? '').startsWith('/admin/providers'),
  },
  {
    href: '/admin/specialisations',
    label: 'Specialisations',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    match: (p) => (p ?? '').startsWith('/admin/specialisations'),
  },
  {
    href: '/admin/ranking',
    label: 'Ranking',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 6l-9.5 9.5-5-5L1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    match: (p) => (p ?? '').startsWith('/admin/ranking'),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>({ kind: 'checking' });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token =
      tokenStore.access ??
      (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null);

    if (!token) {
      router.replace('/auth');
      return;
    }

    (async () => {
      try {
        const me = await apiFetch<{ role?: string }>('/users/me', { auth: true });
        if (cancelled) return;
        if (me?.role !== 'admin') {
          setState({
            kind: 'denied',
            message: 'This account is not authorized to view the admin console.',
          });
          return;
        }
        setState({ kind: 'allowed' });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          if (err.status === 401) {
            router.replace('/auth');
            return;
          }
          setState({
            kind: 'denied',
            message: 'Access denied. Admin role required on this account.',
          });
          return;
        }
        // Network / other error — let them through; the admin API call will
        // surface the real error inside the page.
        setState({ kind: 'allowed' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Close mobile drawer when route changes so nav doesn't stay open after tap.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (state.kind === 'checking') {
    return (
      <div className="min-h-svh flex items-center justify-center bg-slate-50">
        <div
          aria-label="Checking access"
          className="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin"
        />
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div className="min-h-svh flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">{state.message}</p>
          <Link
            href="/home"
            className="inline-block mt-5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const signOut = () => {
    tokenStore.clear();
    router.replace('/auth');
  };

  return (
    <div
      className="min-h-svh bg-slate-50"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* ── Header ── */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left — brand */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/home"
              aria-label="Back to app"
              className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white shrink-0"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </Link>
            <Link
              href="/admin/dashboard"
              className="font-semibold tracking-tight truncate flex items-center gap-2"
            >
              <span className="hidden sm:inline">ReligioGram Admin</span>
              <span className="sm:hidden">Admin</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                CONSOLE
              </span>
            </Link>
          </div>

          {/* Right — desktop nav + sign out, mobile hamburger */}
          <div className="flex items-center gap-1">
            {/* Sign out (always visible) */}
            <button
              type="button"
              onClick={signOut}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Sign out
            </button>
            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label="Toggle navigation"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden p-2 rounded-md text-slate-200 hover:bg-slate-800"
            >
              {mobileNavOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: sidebar on lg+, drawer on mobile ── */}
      <div className="mx-auto max-w-7xl px-0 sm:px-4 lg:px-6 lg:flex lg:gap-6 lg:py-6">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block lg:w-56 shrink-0">
          <nav className="sticky top-20 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 last:mb-0 transition-colors',
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={active ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile drawer — full-width dropdown under header */}
        {mobileNavOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 shadow-sm">
            <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 mt-2 border-t border-slate-200 pt-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </nav>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 sm:px-2 lg:px-0 py-4 sm:py-6 lg:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}
