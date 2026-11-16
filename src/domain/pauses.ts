import { addDays, type ISODate } from './dates'
import type { Pause } from './types'

export function isPaused(pauses: readonly Pause[], d: ISODate): boolean {
  return pauses.some((p) => d >= p.from && (!p.to || d <= p.to))
}

/** ¿Hay algún día en pausa entre `from` y `to`, ambos incluidos? */
export function anyPaused(pauses: readonly Pause[], from: ISODate, to: ISODate): boolean {
  return pauses.some((p) => p.from <= to && (!p.to || p.to >= from))
}

/** Abre una pausa desde hoy, o cierra la que esté abierta (ayer fue su último día). */
export function togglePause(pauses: readonly Pause[], today: ISODate): Pause[] {
  const open = pauses.find((p) => !p.to)
  if (!open) return [...pauses, { from: today }]
  const rest = pauses.filter((p) => p !== open)
  const last = addDays(today, -1)
  return last < open.from ? rest : [...rest, { from: open.from, to: last }]
}
