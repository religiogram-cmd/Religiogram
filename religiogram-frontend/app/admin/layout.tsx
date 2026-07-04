'use client';

/**
 * /admin — top-level admin console layout.
 *
 * Guards every page under /admin/* behind an access-token + admin-role check.
 *   1. If no `tokenStore.access` (and no localStorage fallback), redirect /auth.
 *   2. Best-effort fetch /v1/users/me to confirm `role === 'admin'`.
 *      On 403 (or any non-admin role) we render an "Access denied" panel
 *      rather than redirecting — that gives the admin user feedback if their
 *      role was just downgraded, instead of a silent bounce.
 *   3. While the check is in flight, show a small spinner.
 *
 * Visual: slate-900 header bar so the back-office never looks like the
 * consumer app, with two nav links + sign-out.
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { tokenStore, apiFetch, ApiError } from '@/lib/api';

type GuardState =
  | { kind: 'checking' }
  | { kind: 'allowed' }
  | { kind: 'denied'; message: string };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;

    const token =
      tokenStore.access ??
      (typeof window !== 'undefined'
        ? window.localStorage.getItem('rg_access')
        : null);

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
            message: 'Access denied. Admin role required.',
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

  const isApplications    = pathname?.startsWith('/admin/applications');
  const isSpecialisations = pathname?.startsWith('/admin/specialisations');
  const isRanking         = pathname?.startsWith('/admin/ranking');

  return (
    <div
      className="min-h-svh bg-slate-50"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
    >
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/home"
              aria-label="Back to app"
              className="p-1.5 rounded-md text-slate-200 hover:bg-slate-800"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </Link>
            <Link href="/admin/applications" className="font-semibold tracking-tight">
              ReligioGram Admin
            </Link>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2 text-sm">
            <Link
              href="/admin/applications"
              className={[
                'px-3 py-1.5 rounded-md',
                isApplications
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-200 hover:bg-slate-800',
              ].join(' ')}
            >
              Applications
            </Link>
            <Link
              href="/admin/specialisations"
              className={[
                'px-3 py-1.5 rounded-md',
                isSpecialisations
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-200 hover:bg-slate-800',
              ].join(' ')}
            >
              Specialisations
            </Link>
            <Link
              href="/admin/ranking"
              className={[
                'px-3 py-1.5 rounded-md',
                isRanking
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-200 hover:bg-slate-800',
              ].join(' ')}
            >
              Ranking
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="px-3 py-1.5 rounded-md text-slate-200 hover:bg-slate-800"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
