// firebase-messaging-sw.js
// This file MUST be at the root of public/ so it's served at /firebase-messaging-sw.js
// FCM uses this service worker to receive background push notifications.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Fetch Firebase config at install time from /api/firebase-config (which reads env vars at runtime).
// If config is missing or invalid, the SW silently no-ops.
let messaging = null;
let initPromise = (async () => {
  try {
    const resp = await fetch('/api/firebase-config');
    const cfg = await resp.json();
    if (cfg && cfg.apiKey && cfg.projectId && !String(cfg.apiKey).includes('PLACEHOLDER')) {
      firebase.initializeApp(cfg);
      messaging = firebase.messaging();
    } else {
      console.warn('[FCM SW] Firebase config not set on server — push notifications will not arrive.');
    }
  } catch (e) {
    console.warn('[FCM SW] Failed to load Firebase config:', e);
  }
})();

// Wait until config loaded before binding background handler
initPromise.then(() => {
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
