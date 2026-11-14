import { addDays, weekdayMon, type ISODate } from './dates'
import { computeStreak } from './streaks'
import type { Habit, Log, ReminderSettings, Trama } from './types'

export interface Reminder {
  /** Entero estable dentro de un plan: día × 1000 + posición del hábito (999 = rescate). */
  id: number
  date: ISODate
  /** "HH:MM" */
  time: string
  kind: 'habit' | 'rescue'
  title: string
  body: string
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Avisos de los próximos `days` días, según lo que se sabe ahora.
 * Hoy se saltan los hábitos ya cumplidos y las horas que ya pasaron. Para los días
 * siguientes se asume todo pendiente: el plan se rehace cada vez que algo cambia.
 */
export function planReminders(
  habits: Habit[], tramas: Trama[], logs: Log[], settings: ReminderSettings, today: ISODate, now: string, days = 7,
): Reminder[] {
  if (!settings.enabled) return []
  const fixed = habits
    .filter((h) => !h.archived && h.kind !== 'reduce' && h.rhythm.kind === 'days')
    .sort((a, b) => a.createdAt - b.createdAt)
  const byId = new Map(habits.map((h) => [h.id, h]))
  const tramaName = new Map(tramas.map((t) => [t.id, t.name]))
  const doneOf = (id: string) => new Set(logs.filter((l) => l.habitId === id).map((l) => l.date))
  const scheduled = (h: Habit, d: ISODate) => h.rhythm.kind === 'days' && h.rhythm.days.includes(weekdayMon(d))

  const out: Reminder[] = []
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset)
    const isToday = offset === 0
    const pending: { habit: Habit; risk: boolean }[] = []

    fixed.forEach((habit, idx) => {
      if (!scheduled(habit, date) || habit.createdOn > date) return
      const done = doneOf(habit.id)
      if (isToday && done.has(date)) return
      const risk = isToday && computeStreak(habit, done, today).atRisk
      pending.push({ habit, risk })
      if (!habit.remindAt || (isToday && habit.remindAt <= now)) return

      const anchor = habit.anchorId ? byId.get(habit.anchorId)?.name : undefined
      const cue = anchor ? lowerFirst(anchor) : habit.cue
      out.push({
        id: offset * 1000 + idx,
        date,
        time: habit.remindAt,
        kind: 'habit',
        title: cue ? `${habit.name}, después de ${cue}` : habit.name,
        body: risk
          ? 'Ayer faltaste. Hoy es el que cuenta.'
          : habit.minVersion
            ? `Si hoy cuesta, basta con esto: ${lowerFirst(habit.minVersion)}.`
            : `Un voto más por ${tramaName.get(habit.tramaId) ?? 'quien quieres ser'}.`,
      })
    })

    if (settings.rescue && pending.length > 0 && !(isToday && settings.rescueAt <= now)) {
      const risky = pending.find((p) => p.risk)
      out.push({
        id: offset * 1000 + 999,
        date,
        time: settings.rescueAt,
        kind: 'rescue',
        title: pending.length === 1 ? `Te queda ${lowerFirst(pending[0].habit.name)}` : `Te quedan ${pending.length} por hoy`,
        body: risky ? `${risky.habit.name}: ayer faltaste. Hoy es el que cuenta.` : 'Todavía alcanzas a sumar tus votos de hoy.',
      })
    }
  }
  return out.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : a.id - b.id))
}
