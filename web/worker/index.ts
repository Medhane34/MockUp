// worker/index.ts

/// <reference lib="webworker" />

// This forces TypeScript to treat this file as a module instead of a global script
export type { };

declare const self: ServiceWorkerGlobalScope;

// Safely cast 'self' to the correct Service Worker global scope type
const swSelf = self as unknown as ServiceWorkerGlobalScope;

swSelf.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    const options: NotificationOptions = {
      body: data.body || '',
      icon: '/icon.jpeg',
      badge: '/icon.jpeg',
    };

    event.waitUntil(
      swSelf.registration.showNotification(data.title || 'Notification', options)
    );
  } catch (error) {
    console.error('Error parsing push notification data:', error);
  }
});
