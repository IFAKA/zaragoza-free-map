import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { initAnalytics } from './lib/analytics'
import { listenInstall } from './lib/install'
import './styles.css'

initAnalytics()
listenInstall()

// A new version takes over the page (autoUpdate): reload once so people never stay on the old screens. Not on the very first install.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    location.reload()
  })
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
