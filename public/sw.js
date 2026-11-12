// The Living Planner — service worker.
// Purpose: show reminders (local + push) and open the right page when one is tapped.
// It deliberately does NOT cache pages, so every launch gets the latest version.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'The Living Planner'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/planner-icon.png',
    badge: '/planner-icon.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) { client.navigate(url).catch(() => {}); return client.focus() }
    }
    return self.clients.openWindow(url)
  })())
})
