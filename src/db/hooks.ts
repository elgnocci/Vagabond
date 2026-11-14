import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toISO, type ISODate } from '../domain/dates'
import { db } from './db'

/** Todos los datos de la app, en vivo. `undefined` mientras cargan. */
export function useData() {
  return useLiveQuery(async () => {
    const [habits, tramas, logs, uses, urges, todos] = await Promise.all([
      db.habits.toArray(), db.tramas.orderBy('order').toArray(), db.logs.toArray(), db.uses.toArray(), db.urges.toArray(),
      db.todos.toArray(),
    ])
    return { habits, tramas, logs, uses, urges, todos }
  }, [])
}

/** La fecha de hoy; se actualiza al volver a la app y al pasar la medianoche. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => toISO(new Date()))
  useEffect(() => {
    const check = () => setToday(toISO(new Date()))
    const id = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
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
