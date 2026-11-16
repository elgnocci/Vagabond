import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { todayISO } from '../day'
import type { ISODate } from '../domain/dates'
import { DEFAULT_REMINDERS, type Pause, type ReminderSettings } from '../domain/types'
import { db } from './db'

/** Todos los datos de la app, en vivo. `undefined` mientras cargan. */
export function useData() {
  return useLiveQuery(async () => {
    const [habits, tramas, logs, uses, urges, todos, meta, closures] = await Promise.all([
      db.habits.toArray(), db.tramas.orderBy('order').toArray(), db.logs.toArray(), db.uses.toArray(), db.urges.toArray(),
      db.todos.toArray(), db.meta.toArray(), db.closures.toArray(),
    ])
    const get = (key: string) => meta.find((m) => m.key === key)?.value
    return {
      habits, tramas, logs, uses, urges, todos, closures,
      reminders: { ...DEFAULT_REMINDERS, ...(get('reminders') as Partial<ReminderSettings> | undefined) },
      pauses: (get('pauses') as Pause[] | undefined) ?? [],
      lastBackupAt: (get('lastBackupAt') as number | undefined) ?? null,
    }
  }, [])
}

export type Data = NonNullable<ReturnType<typeof useData>>

/** La fecha de hoy; se actualiza al volver a la app y al pasar la medianoche. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO())
  useEffect(() => {
    const check = () => setToday(todayISO())
    const id = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('vagabond-day-end', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('vagabond-day-end', check)
    }
  }, [])
  return today
}

/** La hora del reloj (0 a 23), actualizada cada minuto. */
export function useHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return hour
}

/** Mensaje de error temporal. */
export function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(id)
  }, [toast])
  return [toast, setToast]
}
