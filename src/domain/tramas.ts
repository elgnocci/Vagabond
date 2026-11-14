import type { Habit, Rhythm, Trama } from './types'

export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000]

const PHRASES: Record<number, string> = {
  10: 'La trama ya tiene un comienzo.',
  25: 'Esto empieza a parecerse a ti.',
  50: 'Ya no es un intento. Es una costumbre.',
  100: 'Cien veces elegiste lo mismo. Eso eres.',
  250: 'La trama ya se escribe casi sola.',
  500: 'Quinientas pruebas de quién eres.',
  1000: 'Mil votos. No queda nada que demostrar.',
}

export function milestonePhrase(n: number): string {
  return PHRASES[n] ?? ''
}

/** El hito anterior y el siguiente para una cantidad de votos. */
export function milestoneProgress(votes: number): { prev: number; next: number | null; ratio: number } {
  const next = MILESTONES.find((m) => m > votes) ?? null
  const prev = [...MILESTONES].reverse().find((m) => m <= votes) ?? 0
  return { prev, next, ratio: next ? (votes - prev) / (next - prev) : 1 }
}

export interface TramaStats {
  trama: Trama
  votes: number
  habits: Habit[]
}

export function tramaStats(tramas: Trama[], habits: Habit[], logs: { habitId: string }[]): TramaStats[] {
  const tramaOf = new Map(habits.map((h) => [h.id, h.tramaId]))
  const votes = new Map<string, number>()
  for (const l of logs) {
    const t = tramaOf.get(l.habitId)
    if (t) votes.set(t, (votes.get(t) ?? 0) + 1)
  }
  return tramas.map((trama) => ({
    trama,
    votes: votes.get(trama.id) ?? 0,
    habits: habits.filter((h) => h.tramaId === trama.id && !h.archived),
  }))
}

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function rhythmText(r: Rhythm): string {
  if (r.kind === 'quota') return `${r.times} ${r.times === 1 ? 'vez' : 'veces'} por ${r.period === 'week' ? 'semana' : 'mes'}`
  if (r.days.length === 7) return 'Todos los días'
  return r.days.map((d) => LETTERS[d]).join(' · ')
}

/** Hábitos que no pueden ser ancla de `habitId`: él mismo y los que ya dependen de él. */
export function dependsOn(habit: Habit, habitId: string, byId: Map<string, Habit>): boolean {
  const seen = new Set<string>()
  for (let h: Habit | undefined = habit; h && !seen.has(h.id); h = h.anchorId ? byId.get(h.anchorId) : undefined) {
    if (h.id === habitId) return true
    seen.add(h.id)
  }
  return false
}
