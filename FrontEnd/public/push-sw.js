// Web Push handlers, imported into the generated service worker via
// vite.config.ts workbox.importScripts. Runs in the same SW scope as the
// Workbox-generated precaching code — do not register a second SW here.

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch (e) {
    payload = { title: 'Vyrona', body: event.data.text() }
  }

  const title = payload.title || 'Vyrona Alert'
  const options = {
    body: payload.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: payload.tag || payload.alert_id || undefined,
    renotify: Boolean(payload.tag || payload.alert_id),
    requireInteraction: payload.severity === 'High',
    data: {
      url: payload.url || '/dashboard',
      alert_id: payload.alert_id,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          client.postMessage({ type: 'push-notification-click', url: targetUrl })
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
