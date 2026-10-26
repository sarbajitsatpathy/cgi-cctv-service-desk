// CGI CCTV Service Desk — notification service worker.
// Android Chrome cannot use `new Notification()`; registration.showNotification()
// works there and on desktop, so the page uses this worker when available.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(target);
    }),
  );
});
