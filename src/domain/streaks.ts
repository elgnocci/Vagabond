import {
  addDays, diffDays, periodEnd, periodStart, prevPeriodStart, weekdayMon, type ISODate,
} from './dates'
import { anyPaused, isPaused } from './pauses'
import type { Habit, Pause } from './types'

export interface PeriodProgress {
  progress: number
  times: number
  met: boolean
  /** Veces que faltan para la meta. */
  needed: number
  /** Días del período en que todavía se puede sumar (hoy incluido si no está marcado). */
  available: number
  /** Los días que quedan son justo los que se necesitan. */
  tight: boolean
  /** Ya no se alcanza la meta en este período. */
  outOfReach: boolean
}

export interface StreakInfo {
  current: number
  unit: 'days' | 'weeks' | 'months'
  /** La última ocasión pasada (día programado o período) se falló. */
  missedLast: boolean
  /** Ese fallo fue exactamente ayer. Solo para hábitos de días fijos. */
  missedYesterday: boolean
  /** Pendiente ahora y a un fallo de romper la racha, o con el período justo. */
  atRisk: boolean
  period?: PeriodProgress
}

type HabitLike = Pick<Habit, 'rhythm' | 'createdOn'> & Partial<Pick<Habit, 'rhythmSince' | 'streakCarry'>>

/** Desde qué día se evalúa el ritmo actual. */
export function rhythmStart(habit: HabitLike): ISODate {
  return habit.rhythmSince && habit.rhythmSince > habit.createdOn ? habit.rhythmSince : habit.createdOn
}

/**
 * Regla "nunca fallar dos veces": un fallo aislado no rompe la racha (tampoco
 * suma); dos fallos seguidos la cortan. Lo pendiente de hoy no es un fallo, y
 * los días en pausa no cuentan a favor ni en contra.
 */
export function computeStreak(
  habit: HabitLike, done: ReadonlySet<ISODate>, today: ISODate, pauses: readonly Pause[] = [],
): StreakInfo {
  return habit.rhythm.kind === 'days'
    ? fixedStreak(habit, habit.rhythm.days, done, today, pauses)
    : quotaStreak(habit, habit.rhythm.period, habit.rhythm.times, done, today, pauses)
}

function fixedStreak(
  habit: HabitLike, days: number[], done: ReadonlySet<ISODate>, today: ISODate, pauses: readonly Pause[],
): StreakInfo {
  const scheduled = new Set(days)
  const start = rhythmStart(habit)
  let current = 0
  let misses = 0
  let seenPast = false
  let missedLast = false
  let missedYesterday = false
  let broken = false

  for (let d = today; d >= start; d = addDays(d, -1)) {
    if (!scheduled.has(weekdayMon(d))) continue
    const ok = done.has(d)
    // En pausa no se exige; si igual se hizo, cuenta.
    if (!ok && isPaused(pauses, d)) continue
    if (d === today) {
      if (ok) current++
      continue
    }
    if (!seenPast) {
      seenPast = true
      missedLast = !ok
      missedYesterday = !ok && d === addDays(today, -1)
    }
    if (ok) {
      current++
      misses = 0
    } else if (++misses === 2) {
      broken = true
      break
    }
  }

  // La racha anterior a un cambio de ritmo se conserva mientras no se haya roto después.
  if (!broken) current += habit.streakCarry ?? 0
  const pendingToday = scheduled.has(weekdayMon(today)) && !done.has(today) && !isPaused(pauses, today) && today >= start
  return { current, unit: 'days', missedLast, missedYesterday, atRisk: pendingToday && missedLast }
}

function quotaStreak(
  habit: HabitLike, period: 'week' | 'month', times: number, done: ReadonlySet<ISODate>, today: ISODate,
  pauses: readonly Pause[],
): StreakInfo {
  const countIn = (start: ISODate) => {
    const end = periodEnd(start, period)
    let n = 0
    for (const d of done) if (d >= start && d <= end) n++
    return n
  }

  const curStart = periodStart(today, period)
  const firstStart = periodStart(rhythmStart(habit), period)
  const progress = countIn(curStart)
  const met = progress >= times

  let current = met ? 1 : 0
  let misses = 0
  let missedLast = false
  let first = true
  let broken = false
  for (let s = prevPeriodStart(curStart, period); s >= firstStart; s = prevPeriodStart(s, period)) {
    const ok = countIn(s) >= times
    if (ok) {
      current++
      misses = 0
    } else {
      // El primer período está incompleto y los que tuvieron pausa no se exigen: no son fallos.
      if (s === firstStart) break
      if (anyPaused(pauses, s, periodEnd(s, period))) continue
      if (first) missedLast = true
      if (++misses === 2) {
        broken = true
        break
      }
    }
    first = false
  }
  if (!broken) current += habit.streakCarry ?? 0

  const daysLeft = diffDays(today, periodEnd(curStart, period)) + 1
  const available = daysLeft - (done.has(today) ? 1 : 0)
  const needed = Math.max(0, times - progress)
  const tight = needed > 0 && available === needed
  const outOfReach = needed > available
  // En su primer período, o con pausa en el período actual, el hábito todavía no se exige.
  const lenient = curStart === firstStart || anyPaused(pauses, curStart, periodEnd(curStart, period))

  return {
    current,
    unit: period === 'week' ? 'weeks' : 'months',
    missedLast,
    missedYesterday: false,
    atRisk: !met && !outOfReach && !lenient && (tight || missedLast),
    period: { progress, times, met, needed, available, tight, outOfReach },
  }
}
