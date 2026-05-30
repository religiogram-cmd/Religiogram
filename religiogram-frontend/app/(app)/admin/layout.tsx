'use client';

/**
 * v9 (P0-4 fix): Frontend role gate for the admin console.
 *
 * Backend enforces RBAC via JwtAuthGuard + RolesGuard + AdminPrefixGuard, but a
 * URL like /admin should never even render the console UI for non-admin users
 * — both as defense-in-depth and to avoid exposing the admin URL surface area
 * to anyone with a valid (non-admin) session.
 *
 * Behaviour:
 *   - while the zustand store is hydrating from the server, show a spinner;
 *   - if no user is present, redirect to /onboarding (login);
 *   - if user.role !== 'admin', redirect to /home and log a console warning
 *     (real Sentry alert is fired server-side by the 403 from any admin call);
 *   - only admins reach `children`.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [verified, setVerified] = useState(false);

  // Trigger hydration once on mount.
  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  // Decide after hydration completes.
  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace('/onboarding');
      return;
    }
    if (user.role !== 'admin') {
      // Non-admin users have no business on this URL. Send them home.
      // Don't show a "denied" page — that just confirms the URL exists.
      router.replace('/home');
      return;
    }
    setVerified(true);
  }, [isHydrated, user, router]);

  if (!verified) {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F1F5F9',
        }}
      >
        <div
          aria-label="Checking access"
          style={{
            width: 32,
            height: 32,
            border: '3px solid #C8920A22',
            borderTopColor: '#C8920A',
            borderRadius: '50%',
            animation: 'rgspin 0.9s linear infinite',
          }}
        />
        <style>{`@keyframes rgspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
