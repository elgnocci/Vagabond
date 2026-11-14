import { addDays, diffDays, type ISODate } from './dates'
import type { Habit, Log, ReducePlan, Urge, Use, Vote } from './types'

/** Plan que baja el tope semana a semana desde `startLimit` hasta cero en `weeks` semanas. */
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
  /** Ya pasó la fecha final: el tope es cero. */
  quit: boolean
  daysToQuit: number
}

type ReduceHabit = Pick<Habit, 'id' | 'createdOn' | 'plan'>

export function reduceState(habit: ReduceHabit, uses: Use[], urges: Urge[], today: ISODate): ReduceState {
  const plan = habit.plan ?? { stages: [], quitDate: habit.createdOn }
  const perDay = new Map<ISODate, number>()
  for (const u of uses) if (u.habitId === habit.id) perDay.set(u.date, (perDay.get(u.date) ?? 0) + 1)
  const mine = urges.filter((u) => u.habitId === habit.id)

  const limit = limitOn(plan, today)
  const used = perDay.get(today) ?? 0
  const over = used > limit
  const okOn = (d: ISODate) => (perDay.get(d) ?? 0) <= limitOn(plan, d)

  const okDays: ISODate[] = []
  for (let d = habit.createdOn; d < today; d = addDays(d, 1)) if (okOn(d)) okDays.push(d)

  let streak = 0
  let misses = over ? 1 : 0
  for (let d = addDays(today, -1); d >= habit.createdOn && misses < 2; d = addDays(d, -1)) {
    if (okOn(d)) {
      streak++
      misses = 0
    } else misses++
  }

  const yesterday = addDays(today, -1)
  return {
    limit,
    used,
    over,
    resistedToday: mine.filter((u) => u.date === today).length,
    resistedTotal: mine.length,
    okDays,
    streak,
    atRisk: !over && yesterday >= habit.createdOn && !okOn(yesterday),
    quit: today >= plan.quitDate,
    daysToQuit: Math.max(0, diffDays(today, plan.quitDate)),
  }
}

/**
 * Todos los votos: hábitos cumplidos, antojos resistidos y días cerrados dentro del tope.
 * El día de hoy no vota hasta que termina, para que el total nunca baje.
 */
export function collectVotes(habits: Habit[], logs: Log[], uses: Use[], urges: Urge[], today: ISODate): Vote[] {
  const votes: Vote[] = logs.map((l) => ({ habitId: l.habitId, date: l.date }))
  for (const u of urges) votes.push({ habitId: u.habitId, date: u.date })
  for (const h of habits) {
    if (h.kind !== 'reduce') continue
    for (const date of reduceState(h, uses, [], today).okDays) votes.push({ habitId: h.id, date })
  }
  return votes
}
