import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/app.css'
import { Capacitor } from '@capacitor/core'
import { App } from './App'
import { getTheme, setTheme } from './theme'

setTheme(getTheme())

// En la web publicada, guarda la app para que abra sin conexión. La app Android ya la lleva dentro.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
