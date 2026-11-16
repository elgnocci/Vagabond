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

/** Un hábito puede sumar a dos tramas: sus votos cuentan en ambas (y una sola vez en el total). */
export function tramaStats(tramas: Trama[], habits: Habit[], logs: { habitId: string }[]): TramaStats[] {
  const tramasOf = new Map(habits.map((h) => [h.id, h.tramaId2 && h.tramaId2 !== h.tramaId ? [h.tramaId, h.tramaId2] : [h.tramaId]]))
  const votes = new Map<string, number>()
  for (const l of logs) for (const t of tramasOf.get(l.habitId) ?? []) votes.set(t, (votes.get(t) ?? 0) + 1)
  return tramas.map((trama) => ({
    trama,
    votes: votes.get(trama.id) ?? 0,
    habits: habits.filter((h) => (h.tramaId === trama.id || h.tramaId2 === trama.id) && !h.archived),
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

export interface StarNode {
  habit: Habit
  x: number
  y: number
  r: number
  votes: number
  color: Trama['color']
}

export interface Constellation {
  width: number
  height: number
  bands: { trama: Trama; y: number; votes: number }[]
  nodes: StarNode[]
  /** Líneas entre hábitos de una misma trama. */
  edges: { a: string; b: string; color: Trama['color'] }[]
  /** Hábito que también suma a otra trama: línea desde su nodo hasta esa trama. */
  bridges: { habitId: string; x: number; y: number; color: Trama['color'] }[]
  /** Apilamientos: del ancla al hábito que va después. */
  stacks: { a: string; b: string }[]
}

/** Número estable entre 0 y 1 a partir de un texto: la misma id cae siempre en el mismo lugar. */
function seeded(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

const COLS = [0.2, 0.56, 0.84, 0.36, 0.72]

/**
 * Ubica cada hábito como un nodo dentro de la franja de su trama principal.
 * La posición sale de la id del hábito y de su lugar en la trama, así que no cambia de un día a otro.
 * El tamaño crece con los votos (raíz cuadrada, para que los primeros votos se noten más).
 */
export function layoutConstellation(stats: TramaStats[], votesOf: (habitId: string) => number, width: number): Constellation {
  const bands: Constellation['bands'] = []
  const nodes: StarNode[] = []
  const edges: Constellation['edges'] = []
  const bridges: Constellation['bridges'] = []
  const bandTop = new Map<string, number>()
  const ROW = 86
  let y = 0

  for (const s of stats) {
    const own = s.habits.filter((h) => h.tramaId === s.trama.id).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
    bandTop.set(s.trama.id, y)
    bands.push({ trama: s.trama, y, votes: s.votes })
    const top = y + 34
    own.forEach((habit, i) => {
      const votes = votesOf(habit.id)
      const r = Math.round(Math.min(40, 20 + 3.2 * Math.sqrt(votes)))
      const jx = (seeded(habit.id, 1) - 0.5) * 0.08
      const jy = (seeded(habit.id, 2) - 0.5) * 22
      const x = Math.round(Math.min(width - r - 6, Math.max(r + 6, (COLS[i % COLS.length] + jx) * width)))
      nodes.push({ habit, x, y: Math.round(top + 44 + Math.floor(i / 2) * ROW + (i % 2) * 30 + jy), r, votes, color: s.trama.color })
      if (i > 0) edges.push({ a: own[i - 1].id, b: habit.id, color: s.trama.color })
    })
    y = top + Math.max(1, Math.ceil(own.length / 2)) * ROW + 64
  }

  const byId = new Map(nodes.map((n) => [n.habit.id, n]))
  const stacks: Constellation['stacks'] = []
  for (const n of nodes) {
    const { habit } = n
    if (habit.anchorId && byId.has(habit.anchorId)) stacks.push({ a: habit.anchorId, b: habit.id })
    if (habit.tramaId2 && habit.tramaId2 !== habit.tramaId && bandTop.has(habit.tramaId2)) {
      const t = stats.find((s) => s.trama.id === habit.tramaId2)!.trama
      bridges.push({ habitId: habit.id, x: 12, y: bandTop.get(t.id)! + 12, color: t.color })
    }
  }
  return { width, height: Math.max(y, 120), bands, nodes, edges, bridges, stacks }
}
