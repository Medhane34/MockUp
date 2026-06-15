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
    data: { url: payload.url } // Storing the URL here
  };

  event.waitUntil(
    swSelf.registration.showNotification(payload.title, options)
  );
});

swSelf.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  // Ensure we have a valid URL
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    swSelf.clients.openWindow(urlToOpen)
  );
});