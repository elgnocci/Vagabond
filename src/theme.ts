import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

export type Theme = 'system' | 'dark' | 'light'
const KEY = 'vagabond-theme'
const BAR = { dark: '#0b0d0d', light: '#f3f5f4' }

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Aplica el tema y lo recuerda. "system" sigue al teléfono. */
export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Sin almacenamiento disponible: el tema vale solo para esta visita.
  }
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  // En Android, los íconos de la barra de estado deben contrastar con el fondo elegido.
  if (Capacitor.isNativePlatform()) {
    const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default
    void SystemBars.setStyle({ style }).catch(() => {})
  }
  // La barra del sistema toma el color del tema elegido.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const scheme = m.media.includes('light') ? 'light' : 'dark'
    m.content = BAR[theme === 'system' ? scheme : theme]
  })
}
