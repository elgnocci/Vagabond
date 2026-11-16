import { addDays, diffDays, periodEnd, periodStart, weekdayMon, type ISODate } from './dates'
import { isPaused } from './pauses'
import { computeStreak, rhythmStart } from './streaks'
import { doneSlots, habitOrder, isMulti, slotsOf } from './today'
import type { Habit, Log, Moment, Pause, ReminderSettings, Trama } from './types'

export interface Reminder {
  /** Entero único dentro de un plan. */
  id: number
  date: ISODate
  /** "HH:MM" */
  time: string
  kind: 'habit' | 'rescue' | 'comeback'
  title: string
  body: string
  /** Para marcar el hábito desde el propio aviso. */
  habitId?: string
  slot?: Moment
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** Android no deja tener demasiados avisos programados a la vez. */
export const MAX_REMINDERS = 400

/**
 * Avisos de los próximos `days` días, según lo que se sabe ahora.
 * Hoy se saltan los momentos ya cumplidos y las horas que ya pasaron. Para los días
 * siguientes se asume todo pendiente: el plan se rehace cada vez que algo cambia.
 * Los dos avisos de regreso solo llegan a sonar si la app no se abre en 3 y 7 días.
 */
export function planReminders(
  habits: Habit[], tramas: Trama[], logs: Log[], settings: ReminderSettings, today: ISODate, now: string, days = 7,
  pauses: readonly Pause[] = [],
): Reminder[] {
  if (!settings.enabled) return []
  const live = habits.filter((h) => !h.archived && h.kind !== 'reduce').sort(habitOrder)
  const byId = new Map(habits.map((h) => [h.id, h]))
  const tramaName = new Map(tramas.map((t) => [t.id, t.name]))
  const logsOf = new Map<string, Log[]>()
  for (const l of logs) logsOf.set(l.habitId, [...(logsOf.get(l.habitId) ?? []), l])

  const out: Reminder[] = []
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset)
    if (isPaused(pauses, date)) continue
    const isToday = offset === 0
    let pending = 0
    let lastPending = ''
    let risky = ''

    live.forEach((habit, idx) => {
      if (habit.createdOn > date) return
      const mine = logsOf.get(habit.id) ?? []
      const done = new Set(mine.map((l) => l.date))
      const base = offset * 1000 + idx * 4

      if (habit.rhythm.kind === 'quota') {
        // Hábito con meta semanal o mensual: avisa solo cuando los días que quedan empiezan a apretar.
        if (!habit.remindAt || (isToday && (done.has(date) || habit.remindAt <= now))) return
        const { period, times } = habit.rhythm
        const start = periodStart(date, period)
        const end = periodEnd(start, period)
        let progress = 0
        for (const d of done) if (d >= start && d <= end) progress++
        const needed = times - progress
        const left = diffDays(date, end) + 1
        if (needed <= 0 || left > needed + 1) return
        out.push({
          id: base, date, time: habit.remindAt, kind: 'habit', habitId: habit.id,
          title: habit.name,
          body: left <= needed
            ? `${left === 1 ? 'Queda 1 día' : `Quedan ${left} días`} y te ${needed === 1 ? 'falta 1' : `faltan ${needed}`} ${period === 'week' ? 'esta semana' : 'este mes'}.`
            : `Te ${needed === 1 ? 'falta 1 vez' : `faltan ${needed} veces`} ${period === 'week' ? 'esta semana' : 'este mes'}.`,
        })
        return
      }

      if (!habit.rhythm.days.includes(weekdayMon(date)) || date < rhythmStart(habit)) return
      const made = isToday ? doneSlots(habit, mine.find((l) => l.date === date)) : []
      const risk = isToday && made.length === 0 && computeStreak(habit, done, today, pauses).atRisk
      slotsOf(habit).forEach((slot, si) => {
        if (made.includes(slot.moment)) return
        pending++
        lastPending = habit.name
        if (risk) risky = habit.name
        if (!slot.remindAt || (isToday && slot.remindAt <= now)) return
        const anchor = !isMulti(habit) && habit.anchorId ? byId.get(habit.anchorId)?.name : undefined
        const cue = anchor ? lowerFirst(anchor) : slot.cue
        out.push({
          id: base + si, date, time: slot.remindAt, kind: 'habit', habitId: habit.id,
          slot: isMulti(habit) ? slot.moment : undefined,
          title: cue ? `${habit.name}, después de ${cue}` : habit.name,
          body: risk
            ? 'Ayer faltaste. Hoy es el que cuenta.'
            : habit.minVersion
              ? `Si hoy cuesta, basta con esto: ${lowerFirst(habit.minVersion)}.`
              : `Un voto más por ${tramaName.get(habit.tramaId) ?? 'quien quieres ser'}.`,
        })
      })
    })

    if (settings.rescue && pending > 0 && !(isToday && settings.rescueAt <= now)) {
      out.push({
        id: offset * 1000 + 999, date, time: settings.rescueAt, kind: 'rescue',
        title: pending === 1 ? `Te queda ${lowerFirst(lastPending)}` : `Te quedan ${pending} por hoy`,
        body: risky ? `${risky}: ayer faltaste. Hoy es el que cuenta.` : 'Todavía alcanzas a sumar tus votos de hoy.',
      })
    }
  }

  if (live.length > 0) {
    out.push(
      { id: 900003, date: addDays(today, 3), time: '19:00', kind: 'comeback', title: 'La trama sigue donde la dejaste', body: 'Tres días sin votos. Hoy basta con uno.' },
      { id: 900007, date: addDays(today, 7), time: '19:00', kind: 'comeback', title: 'Una semana fuera', body: 'No hace falta ponerse al día. Vuelve con la versión de 2 minutos de un solo hábito.' },
    )
  }
  return out
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : a.id - b.id))
    .slice(0, MAX_REMINDERS)
}
