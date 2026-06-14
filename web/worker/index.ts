// worker/index.ts

/// <reference lib="webworker" />

// This forces TypeScript to treat this file as a module instead of a global script
export type { };

declare const self: ServiceWorkerGlobalScope;

// Safely cast 'self' to the correct Service Worker global scope type
const swSelf = self as unknown as ServiceWorkerGlobalScope;
const isPermissionGranted = (self as any).Notification?.permission === 'granted';
swSelf.addEventListener('push', (event: PushEvent) => {
  if (!isPermissionGranted) {
    console.warn('Push event received, but notification permission is not granted.');
    return;
  }
  let data = { title: 'Notification', body: '' };

  if (event.data) {
    try {
      // Attempt to parse as JSON first
      data = event.data.json();
    } catch (e) {
      // Fallback: If it's not JSON, treat it as plain text
      data = { title: 'New Message', body: event.data.text() };
    }
  }

  const options: NotificationOptions = {
    body: data.body,
    icon: '/icon.jpeg',
    badge: '/icon.jpeg',
  };

  event.waitUntil(
    swSelf.registration.showNotification(data.title, options)
  );
});
