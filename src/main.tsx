import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { initAnalytics } from './lib/analytics'
import './styles.css'

initAnalytics()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
