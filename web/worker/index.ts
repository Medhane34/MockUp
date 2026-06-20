/// <reference lib="webworker" />

export type { };

declare const self: ServiceWorkerGlobalScope;
const swSelf = self as unknown as ServiceWorkerGlobalScope;

// Force the worker to activate immediately and take control
swSelf.addEventListener('install', () => {
  swSelf.skipWaiting();
});

swSelf.addEventListener('activate', (event) => {
  event.waitUntil(swSelf.clients.claim());
});

// 1. Handle Push Events
swSelf.addEventListener('push', (event: PushEvent) => {
  let payload = { title: 'New Update', body: '', url: '/' };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = {
        title: json.title || 'New Update',
        body: json.body || '',
        url: json.url || '/'
      };
    } catch (e) {
      payload = { title: 'New Update', body: event.data.text(), url: '/' };
    }
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: '/icon.jpeg',
    badge: '/icon.jpeg',
    data: { url: payload.url } // This data persists when the notification is clicked
  };

  event.waitUntil(
    swSelf.registration.showNotification(payload.title, options)
  );
});

// 2. Handle Click Events (Robust Redirection)
swSelf.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  // Extract the URL from the notification data
  const urlToOpen = event.notification.data?.url || '/';

  console.log("Notification clicked. Navigating to:", urlToOpen); // Check this in your Browser DevTools Console

  event.waitUntil(
    swSelf.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, try to focus it
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, or it's a different URL, open a new window
      if (swSelf.clients.openWindow) {
        return swSelf.clients.openWindow(urlToOpen);
      }
    })
  );
});