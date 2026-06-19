// firebase-messaging-sw.js
// This file MUST be at the root of public/ so it's served at /firebase-messaging-sw.js
// FCM uses this service worker to receive background push notifications.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Frontend fetches config from /api/firebase-config at install time to avoid build-time injection.
// If config can't be loaded (Firebase not configured), the SW silently no-ops.
let messaging = null;
try {
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSy___PLACEHOLDER___REPLACE_VIA_VERCEL_ENV',
    projectId: 'religiogram',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:placeholder',
  };
  if (FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes('PLACEHOLDER')) {
    firebase.initializeApp(FIREBASE_CONFIG);
    messaging = firebase.messaging();
  }
} catch (_) {
  // No-op if config invalid
}
if (!messaging) {
  // Service worker still installs; just won't handle FCM events
  console.warn('[FCM SW] Firebase config missing — push notifications will not arrive.');
}

// Handle background notifications
if (messaging) messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'ReligioGram', {
    body: body ?? '',
    icon: icon ?? '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: payload.data,
    vibrate: [100, 50, 100],
    tag: payload.data?.notificationId ?? 'rg-notification',
    renotify: true,
  });
});

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      clients.openWindow(url);
    })
  );
});
