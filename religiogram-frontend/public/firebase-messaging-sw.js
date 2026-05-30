// firebase-messaging-sw.js
// This file MUST be at the root of public/ so it's served at /firebase-messaging-sw.js
// FCM uses this service worker to receive background push notifications.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// These are safe to embed — they're PUBLIC Firebase config values, not secrets.
// The actual security is controlled by Firebase Security Rules and the server.
firebase.initializeApp({
  apiKey: self.__WEB_FIREBASE_API_KEY__,        // injected at build by next.config.js
  projectId: self.__WEB_FIREBASE_PROJECT_ID__,
  messagingSenderId: self.__WEB_FIREBASE_SENDER_ID__,
  appId: self.__WEB_FIREBASE_APP_ID__,
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage((payload) => {
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
