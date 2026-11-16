import { addDays, weekdayMon, type ISODate } from './dates'
import { isPaused } from './pauses'
import { reduceDays } from './reduce'
import { rhythmStart } from './streaks'
import { isMulti } from './today'
import type { Closure, Habit, Log, Pause, Urge, Use } from './types'

export interface GrowthData {
  habits: Habit[]
  logs: Log[]
  uses: Use[]
  urges: Urge[]
  closures: Closure[]
  pauses: Pause[]
}

export interface GrowthDay {
  date: ISODate
  /** Lo que tocaba ese día y lo que se cumplió. */
  done: number
  total: number
  /** Por cuánto se multiplica ese día: entre 0,99 y 1,01. */
  factor: number
  /** Valor acumulado al cierre del día. El día antes de empezar vale 1. */
  value: number
  /** Dónde estaría la curva sumando 1% todos los días. */
  ideal: number
}

/**
 * El 1% diario de "Hábitos atómicos": cada día multiplica al anterior.
 * - Un día suma hasta 1%, en proporción a lo cumplido de lo que tocaba.
 * - Un día en blanco (tocaba algo y no se hizo nada) resta 1%.
 * - Un día sin nada programado, en pausa o sin registros no mueve la curva.
 * Hoy solo puede sumar: mientras no termine, lo pendiente no resta.
 */
export function growthSeries(data: GrowthData, today: ISODate): GrowthDay[] {
  const live = data.habits.filter((h) => !h.archived)
  const first = live.reduce<ISODate | null>((min, h) => (!min || h.createdOn < min ? h.createdOn : min), null)
  if (!first) return []

  const logsOf = new Map<string, Map<ISODate, Log>>()
  for (const l of data.logs) {
    let m = logsOf.get(l.habitId)
    if (!m) logsOf.set(l.habitId, (m = new Map()))
    m.set(l.date, l)
  }
  const reducers = new Map(live.filter((h) => h.kind === 'reduce').map((h) => [h.id, reduceDays(h, data.uses, data.urges, data.closures, data.pauses)]))

  const out: GrowthDay[] = []
  let value = 1
  let ideal = 1
  for (let d = first; d <= today; d = addDays(d, 1)) {
    let done = 0
    let total = 0
    for (const h of live) {
      if (h.createdOn > d) continue
      if (h.kind === 'reduce') {
        if (d === today) continue // el día de hoy se juzga cuando termina
        const st = reducers.get(h.id)!.status(d)
        if (st === 'ok') done++
        if (st === 'ok' || st === 'over') total++
        continue
      }
      const log = logsOf.get(h.id)?.get(d)
      const slots = isMulti(h) ? h.slots!.length : 1
      if (h.rhythm.kind === 'quota') {
        // Con meta semanal o mensual no hay un día "que tocaba": cada vez hecha suma.
        if (log) { done++; total++ }
        continue
      }
      const due = h.rhythm.days.includes(weekdayMon(d)) && d >= rhythmStart(h) && !isPaused(data.pauses, d)
      if (!due && !log) continue
      const made = !log ? 0 : isMulti(h) ? Math.min(slots, log.slots?.length ?? slots) : 1
      done += made
      total += due ? slots : made
    }
    const ratio = total ? done / total : 0
    const factor = total === 0 ? 1 : done === 0 ? (d === today ? 1 : 0.99) : 1 + 0.01 * ratio
    value *= factor
    ideal *= 1.01
    out.push({ date: d, done, total, factor, value, ideal })
  }
  return out
}

/** A este ritmo, por cuánto se multiplica un año: el promedio de los últimos días cerrados, compuesto 365 veces. */
export function yearProjection(series: GrowthDay[], today: ISODate, window = 30): number | null {
  const closed = series.filter((s) => s.date < today).slice(-window)
  if (closed.length < 7) return null
  const product = closed.reduce((p, s) => p * s.factor, 1)
  return Math.pow(product, 365 / closed.length)
}

/** "×1,37" con coma decimal. */
export function formatTimes(v: number): string {
  return `×${(v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')}`
}

/** "+3,2%" o "−1,0%" respecto de un valor base. */
export function formatPct(ratio: number): string {
  const p = (ratio - 1) * 100
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}%`
}
