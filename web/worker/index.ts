/// <reference lib="webworker" />

export type { };

declare const self: ServiceWorkerGlobalScope;
const swSelf = self as unknown as ServiceWorkerGlobalScope;

// 1. Handle incoming PUSH messages
swSelf.addEventListener('push', (event: PushEvent) => {
  let payload = { title: 'New Update', body: '', url: '/' };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = {
        title: json.title || 'New Update',
        body: json.body || '',
        url: json.url || '/' // Extract the URL from the payload
      };
    } catch (e) {
      payload = { title: 'New Update', body: event.data.text(), url: '/' };
    }
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: '/icon.jpeg',
    badge: '/icon.jpeg',
    // CRITICAL: We pass the URL into the 'data' field so the click listener can see it
    data: { url: payload.url }
  };

  event.waitUntil(
    swSelf.registration.showNotification(payload.title, options)
  );
});

// 2. Handle Notification CLICKS
swSelf.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  // Access the URL we passed in the 'data' field above
  const urlToOpen = event.notification.data?.url || '/';

  // This opens the URL in a new window or focuses the existing tab
  event.waitUntil(
    swSelf.clients.openWindow(urlToOpen)
  );
});