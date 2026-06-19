import { useEffect } from 'react';
import { tokenStore } from '@/lib/api';
import { registerDeviceToken } from '@/lib/notifications-api';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

/**
 * Requests Notification permission and registers the FCM device token
 * with the backend. Called once after successful auth inside AppLayout.
 *
 * Design decisions:
 * - We use Firebase JS SDK v9 modular for web push (smallest bundle path).
 * - We only request permission if the browser supports it and the user
 *   hasn't already been asked (Notification.permission === 'default').
 * - The token is stored in sessionStorage so we don't re-register on
 *   every page navigation, only on fresh sessions.
 * - If Firebase config is missing OR the firebase package isn't installed
 *   yet, the hook is a no-op (graceful).
 */
export function usePushNotifications() {
  useEffect(() => {
    // Only run in browser, only if token exists (authed), only if supported
    if (
      typeof window === 'undefined' ||
      !(tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null)) ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)
    ) return;

    // Don't re-register in same session
    if (sessionStorage.getItem('rg_push_registered')) return;

    // Only ask if not yet decided
    if (Notification.permission === 'denied') return;

    const register = async () => {
      try {
        const permission = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();

        if (permission !== 'granted') return;

        // Load Firebase SDK lazily (don't block initial render)
        const firebaseConfig = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };

        // Bail out gracefully if Firebase isn't configured
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return;

        // Dynamic import to avoid loading Firebase on every page.
        // Wrapped in try/catch so a missing firebase package (before
        // `npm install`) silently no-ops instead of throwing in dev.
        let appMod: any, msgMod: any;
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - firebase is a runtime dep, types resolved at build time
          appMod = await import('firebase/app');
          // @ts-ignore
          msgMod = await import('firebase/messaging');
        } catch {
          // Firebase package not installed yet - silently skip push registration
          return;
        }
        const { initializeApp, getApps } = appMod;
        const { getMessaging, getToken } = msgMod;

        const app = getApps().length
          ? getApps()[0]
          : initializeApp(firebaseConfig);

        // Explicitly register the messaging service worker so getToken
        // can find it. If the SW isn't ready, push delivery silently fails.
        let swRegistration: ServiceWorkerRegistration | undefined;
        try {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
          if (swRegistration.installing || swRegistration.waiting) {
            await new Promise<void>((resolve) => {
              const sw = swRegistration!.installing || swRegistration!.waiting;
              if (!sw) return resolve();
              sw.addEventListener('statechange', () => {
                if (sw.state === 'activated' || sw.state === 'installed') resolve();
              });
              setTimeout(resolve, 4000); // safety
            });
          }
        } catch (e) {
          console.warn('[PushNotifications] SW registration failed:', e);
        }

        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });

        if (token && (tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null))) {
          await registerDeviceToken((tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null)), token, 'web');
          sessionStorage.setItem('rg_push_registered', '1');
        }
      } catch (err) {
        // Non-fatal - push is a nice-to-have, not a hard requirement
        console.warn('[PushNotifications] registration failed:', err);
      }
    };

    // Delay to not compete with the auth bootstrap
    const timer = setTimeout(register, 3000);
    return () => clearTimeout(timer);
  }, []);
}
