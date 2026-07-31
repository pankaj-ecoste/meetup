// MeetUp push service worker (plan.md §8.14).
//
// Deliberately has NO fetch handler: every MeetUp flow (record -> transcribe
// -> extract -> save) needs the network, so there is nothing useful to serve
// from a cache, and adding one would risk staling API responses in a way
// that's invisible to users. This worker's only job is push delivery.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'MeetUp', body: 'You have an update.', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // non-JSON payload — fall back to the defaults above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientsList) {
        if (client.url.endsWith(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
