import { Capacitor } from '@capacitor/core'
import { handleBack } from './back'
import type { Reminder } from './domain/reminders'
import type { Moment } from './domain/types'

/** Los avisos con la app cerrada solo existen dentro de la app Android. */
export const canNotify = Capacitor.isNativePlatform()

const plugin = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications)

/** Pide permiso para mostrar avisos si hace falta. Devuelve si quedó concedido. */
export async function ensurePermission(): Promise<boolean> {
  if (!canNotify) return false
  const ln = await plugin()
  let status = (await ln.checkPermissions()).display
  if (status !== 'granted') status = (await ln.requestPermissions()).display
  return status === 'granted'
}

/** Reemplaza todos los avisos programados por los del plan. Con el plan vacío, los borra. */
export async function syncReminders(reminders: Reminder[]): Promise<void> {
  if (!canNotify) return
  const ln = await plugin()
  const pending = (await ln.getPending()).notifications
  if (pending.length) await ln.cancel({ notifications: pending.map((n) => ({ id: n.id })) })
  if (!reminders.length || (await ln.checkPermissions()).display !== 'granted') return
  await ln.schedule({
    notifications: reminders.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      // Hora local del teléfono. `allowWhileIdle` deja que suene con el teléfono en reposo.
      schedule: { at: new Date(`${r.date}T${r.time}:00`), allowWhileIdle: true },
      // Los avisos de un hábito traen el botón "Hecho".
      ...(r.habitId ? { actionTypeId: 'HABIT', extra: { habitId: r.habitId, slot: r.slot, date: r.date } } : {}),
    })),
  })
}

interface NativeHandlers {
  /** Se tocó "Hecho" en el aviso de un hábito. */
  onDone: (habitId: string, date: string, slot?: Moment) => void
}

/** Lo que solo existe en la app Android: el botón "Hecho" de los avisos y el botón atrás del teléfono. */
export async function initNative({ onDone }: NativeHandlers): Promise<void> {
  if (!canNotify) return
  const [ln, { App }] = await Promise.all([plugin(), import('@capacitor/app')])
  await ln.registerActionTypes({ types: [{ id: 'HABIT', actions: [{ id: 'done', title: 'Hecho' }] }] })
  await ln.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification.extra as { habitId?: string; date?: string; slot?: Moment } | undefined
    if (event.actionId === 'done' && extra?.habitId && extra.date) onDone(extra.habitId, extra.date, extra.slot)
  })
  // Atrás cierra lo último abierto; si no hay nada, deja la app en segundo plano en vez de cerrarla.
  await App.addListener('backButton', () => {
    if (!handleBack()) void App.minimizeApp()
  })
}

/** Entrega un archivo de texto: en Android abre "compartir"; en la web lo comparte o lo descarga. */
export async function saveFile(name: string, text: string, title: string): Promise<void> {
  if (canNotify) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title, files: [uri] })
    return
  }
  const file = new File([text], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
