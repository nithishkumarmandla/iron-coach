import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Service workers make local debugging painful if stale code gets cached.
// In development, aggressively remove any old registrations and caches.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
      .catch(() => {})

    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {})
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
