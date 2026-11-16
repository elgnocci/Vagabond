import { addDays, periodEnd, startOfMonth, startOfWeek, weekdayMon, type ISODate } from './dates'
import { isPaused } from './pauses'
import { reduceDays } from './reduce'
import { computeStreak, rhythmStart } from './streaks'
import type { Closure, Habit, Pause, Urge, Use } from './types'

export interface SeriesPoint {
  date: ISODate
  /** Votos acumulados hasta ese día, incluido. */
  total: number
  /** Votos de ese día. */
  added: number
}

/** Votos acumulados día a día entre `from` y hoy. */
export function cumulativeSeries(votes: { date: ISODate }[], from: ISODate, today: ISODate): SeriesPoint[] {
  const perDay = new Map<ISODate, number>()
  let total = 0
  for (const v of votes) {
    if (v.date < from) total++
    else perDay.set(v.date, (perDay.get(v.date) ?? 0) + 1)
  }
  const out: SeriesPoint[] = []
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const added = perDay.get(d) ?? 0
    total += added
    out.push({ date: d, total, added })
  }
  return out
}

export function weekCompare(votes: { date: ISODate }[], today: ISODate): { thisWeek: number; lastWeek: number } {
  const start = startOfWeek(today)
  const prev = addDays(start, -7)
  let thisWeek = 0
  let lastWeek = 0
  for (const v of votes) {
    if (v.date >= start && v.date <= today) thisWeek++
    else if (v.date >= prev && v.date < start) lastWeek++
  }
  return { thisWeek, lastWeek }
}

export function activeDays(votes: { date: ISODate }[]): number {
  return new Set(votes.map((v) => v.date)).size
}

export interface Rate {
  done: number
  expected: number
  ratio: number
}

/** Constancia en los últimos `window` días: lo hecho sobre lo que tocaba. Hoy pendiente no cuenta en contra. */
export function habitRate(
  habit: Habit, done: ReadonlySet<ISODate>, today: ISODate, window = 30, pauses: readonly Pause[] = [],
): Rate {
  const first = addDays(today, -(window - 1))
  const start = rhythmStart(habit)
  const from = start > first ? start : first
  let did = 0
  let expected = 0
  if (habit.rhythm.kind === 'days') {
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!habit.rhythm.days.includes(weekdayMon(d))) continue
      if (done.has(d)) did++
      if (done.has(d) || (d < today && !isPaused(pauses, d))) expected++
    }
  } else {
    for (const d of done) if (d >= from && d <= today) did++
    let days = 0
    for (let d = from; d <= today; d = addDays(d, 1)) if (!isPaused(pauses, d)) days++
    expected = Math.max(1, Math.round((habit.rhythm.times * days) / (habit.rhythm.period === 'week' ? 7 : 30)))
    did = Math.min(did, expected)
  }
  return { done: did, expected, ratio: expected ? did / expected : 0 }
}

/** Constancia de algo que se está dejando: días cerrados dentro del tope, sobre los días con registro o confirmación. */
export function reduceRate(
  habit: Habit, uses: Use[], urges: Urge[], closures: Closure[], today: ISODate, pauses: readonly Pause[] = [], window = 30,
): Rate {
  const first = addDays(today, -window)
  const from = habit.createdOn > first ? habit.createdOn : first
  const days = reduceDays(habit, uses, urges, closures, pauses)
  let ok = 0
  let expected = 0
  for (let d = from; d < today; d = addDays(d, 1)) {
    const st = days.status(d)
    if (st === 'skip') continue
    expected++
    if (st === 'ok') ok++
  }
  return { done: ok, expected, ratio: expected ? ok / expected : 0 }
}

/** La racha más larga que tuvo el hábito. Una racha solo puede tocar su máximo en un día cumplido. */
export function bestStreak(
  habit: Pick<Habit, 'rhythm' | 'createdOn'> & Partial<Pick<Habit, 'rhythmSince' | 'streakCarry'>>, done: ReadonlySet<ISODate>, today: ISODate,
  pauses: readonly Pause[] = [],
): number {
  let best = computeStreak(habit, done, today, pauses).current
  for (const d of done) {
    if (d > today) continue
    // En hábitos de meta la racha sube al cerrar el período, así que se mide en su último día.
    const at = habit.rhythm.kind === 'quota' ? periodEnd(habit.rhythm.period === 'week' ? startOfWeek(d) : startOfMonth(d), habit.rhythm.period) : d
    best = Math.max(best, computeStreak(habit, done, at > today ? today : at, pauses).current)
  }
  return best
}

/** Días de un mes en filas de lunes a domingo; `null` rellena los huecos. */
export function monthGrid(monthStart: ISODate): (ISODate | null)[] {
  const cells: (ISODate | null)[] = Array(weekdayMon(monthStart)).fill(null)
  const end = periodEnd(monthStart, 'month')
  for (let d = monthStart; d <= end; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  return cells
}
