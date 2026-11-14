import { Capacitor } from '@capacitor/core'
import type { Reminder } from './domain/reminders'

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
    })),
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
