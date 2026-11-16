import { addDays, diffDays, type ISODate } from './dates'
import { isPaused } from './pauses'
import type { Closure, Habit, Log, Pause, ReducePlan, Urge, Use, Vote } from './types'

/**
 * Plan que baja el tope semana a semana desde `startLimit` hasta cero en `weeks` semanas.
 * Con `weeks` en 0 es dejarlo de golpe: el tope es cero desde el primer día.
 */
export function buildPlan(startLimit: number, weeks: number, start: ISODate): ReducePlan {
  const stages: ReducePlan['stages'] = []
  for (let i = 0; i < weeks; i++) {
    const limit = Math.max(1, Math.round((startLimit * (weeks - i)) / weeks))
    if (stages.at(-1)?.limit !== limit) stages.push({ from: addDays(start, 7 * i), limit })
  }
  return { stages, quitDate: addDays(start, 7 * weeks) }
}

/** Tope del día: el de la etapa vigente, o cero desde la fecha final. */
export function limitOn(plan: ReducePlan, date: ISODate): number {
  if (date >= plan.quitDate) return 0
  let limit = plan.stages[0]?.limit ?? 0
  for (const s of plan.stages) if (s.from <= date) limit = s.limit
  return limit
}

/**
 * Cómo terminó un día:
 * - `ok` / `over`: dentro o sobre el tope, por un cierre guardado o por lo registrado ese día.
 * - `unknown`: no se registró nada ni se confirmó. No suma votos: no abrir la app no es un logro.
 * - `skip`: día en pausa sin registros.
 */
export type DayStatus = 'ok' | 'over' | 'unknown' | 'skip'

type ReduceHabit = Pick<Habit, 'id' | 'createdOn' | 'plan'>

export interface ReduceDays {
  used: (d: ISODate) => number
  limit: (d: ISODate) => number
  status: (d: ISODate) => DayStatus
}

export function reduceDays(
  habit: ReduceHabit, uses: Use[], urges: Urge[], closures: Closure[] = [], pauses: readonly Pause[] = [],
): ReduceDays {
  const plan = habit.plan ?? { stages: [], quitDate: habit.createdOn }
  const perDay = new Map<ISODate, number>()
  const active = new Set<ISODate>()
  for (const u of uses) {
    if (u.habitId !== habit.id) continue
    perDay.set(u.date, (perDay.get(u.date) ?? 0) + 1)
    active.add(u.date)
  }
  for (const u of urges) if (u.habitId === habit.id) active.add(u.date)
  const closed = new Map(closures.filter((c) => c.habitId === habit.id).map((c) => [c.date, c]))

  const used = (d: ISODate) => perDay.get(d) ?? 0
  const limit = (d: ISODate) => closed.get(d)?.limit ?? limitOn(plan, d)
  return {
    used,
    limit,
    status: (d) => {
      const c = closed.get(d)
      if (c) return c.ok ? 'ok' : 'over'
      if (active.has(d)) return used(d) <= limitOn(plan, d) ? 'ok' : 'over'
      return isPaused(pauses, d) ? 'skip' : 'unknown'
    },
  }
}

export interface ReduceState {
  limit: number
  used: number
  over: boolean
  resistedToday: number
  resistedTotal: number
  /** Días ya cerrados dentro del tope. Cada uno es un voto. */
  okDays: ISODate[]
  /** Días seguidos dentro del tope, con la regla de "nunca fallar dos veces". */
  streak: number
  /** Ayer se pasó del tope y hoy todavía no. */
  atRisk: boolean
  /** Ayer no se registró nada: hay que preguntar cómo fue. */
  needsConfirm: boolean
  /** Ya pasó la fecha final: el tope es cero. */
  quit: boolean
  /** El plan es dejarlo de golpe, sin etapas. */
  cold: boolean
  daysToQuit: number
}

export function reduceState(
  habit: ReduceHabit, uses: Use[], urges: Urge[], today: ISODate, closures: Closure[] = [], pauses: readonly Pause[] = [],
): ReduceState {
  const plan = habit.plan ?? { stages: [], quitDate: habit.createdOn }
  const days = reduceDays(habit, uses, urges, closures, pauses)
  const mine = urges.filter((u) => u.habitId === habit.id)

  const limit = limitOn(plan, today)
  const used = days.used(today)
  const over = used > limit

  const okDays: ISODate[] = []
  for (let d = habit.createdOn; d < today; d = addDays(d, 1)) if (days.status(d) === 'ok') okDays.push(d)

  let streak = 0
  let misses = over ? 1 : 0
  for (let d = addDays(today, -1); d >= habit.createdOn && misses < 2; d = addDays(d, -1)) {
    const st = days.status(d)
    if (st === 'skip') continue
    if (st === 'ok') {
      streak++
      misses = 0
    } else misses++
  }

  const yesterday = addDays(today, -1)
  const yStatus = yesterday >= habit.createdOn ? days.status(yesterday) : 'skip'
  return {
    limit,
    used,
    over,
    resistedToday: mine.filter((u) => u.date === today).length,
    resistedTotal: mine.length,
    okDays,
    streak,
    atRisk: !over && yStatus === 'over',
    needsConfirm: yStatus === 'unknown',
    quit: today >= plan.quitDate,
    cold: plan.stages.length === 0,
    daysToQuit: Math.max(0, diffDays(today, plan.quitDate)),
  }
}

/** Cierres para congelar los días pasados con registros, antes de cambiar el plan. */
export function freezeDays(habit: ReduceHabit, uses: Use[], urges: Urge[], closures: Closure[], today: ISODate): Closure[] {
  const days = reduceDays(habit, uses, urges, closures)
  const has = new Set(closures.filter((c) => c.habitId === habit.id).map((c) => c.date))
  const out: Closure[] = []
  for (let d = habit.createdOn; d < today; d = addDays(d, 1)) {
    const st = days.status(d)
    if (has.has(d) || st === 'unknown' || st === 'skip') continue
    out.push({ habitId: habit.id, date: d, limit: days.limit(d), ok: st === 'ok' })
  }
  return out
}

/**
 * Todos los votos: hábitos cumplidos (uno por cada momento hecho), antojos resistidos y
 * días cerrados dentro del tope. El día de hoy no vota hasta que termina, para que el total nunca baje.
 */
export function collectVotes(
  habits: Habit[], logs: Log[], uses: Use[], urges: Urge[], today: ISODate, closures: Closure[] = [],
  pauses: readonly Pause[] = [],
): Vote[] {
  const votes: Vote[] = []
  for (const l of logs) {
    const n = l.slots ? Math.max(1, l.slots.length) : 1
    for (let i = 0; i < n; i++) votes.push({ habitId: l.habitId, date: l.date })
  }
  for (const u of urges) votes.push({ habitId: u.habitId, date: u.date })
  for (const h of habits) {
    if (h.kind !== 'reduce') continue
    for (const date of reduceState(h, uses, urges, today, closures, pauses).okDays) votes.push({ habitId: h.id, date })
  }
  return votes
}
