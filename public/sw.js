// MeetUp v2: push notifications were removed, so this worker no longer does
// anything. Phones that registered the old push worker will fetch this file,
// and it unregisters itself so no stale worker lingers.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister())
})
