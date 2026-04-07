// public/sw.js
// Service worker for Iron Coach PWA
// Handles background push notifications and offline caching

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

// Handle push notifications from server
self.addEventListener('push', (e) => {
  if (!e.data) return

  let payload
  try { payload = e.data.json() }
  catch { payload = { title: 'Iron Coach', body: e.data.text() } }

  e.waitUntil(
    self.registration.showNotification(payload.title ?? 'Iron Coach', {
      body:     payload.body ?? '',
      icon:     '/icons/icon-192.png',
      badge:    '/icons/icon-192.png',
      tag:      payload.tag ?? 'iron-coach',
      renotify: true,
      vibrate:  [200, 100, 200, 100, 400],
      data:     payload.data ?? {}
    })
  )
})

// Handle notification tap — open app
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        if (clients.length > 0) {
          return clients[0].focus()
        }
        return self.clients.openWindow('/')
      })
  )
})

// Basic offline cache for app shell
const CACHE = 'iron-coach-v1'
const CACHE_URLS = ['/', '/index.html']

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for app shell
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase')) return  // never cache API calls

  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(cached => cached ?? caches.match('/index.html'))
    )
  )
})
