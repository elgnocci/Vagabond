import type { StreakInfo } from '../domain/streaks'
import type { ReduceItem, TodayItem } from '../domain/today'

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Racha corta para la fila: "9 d", "3 sem", "2 meses". */
export function streakShort(s: StreakInfo): string | null {
  if (s.current <= 0) return null
  if (s.unit === 'days') return `${s.current} d`
  return `${s.current} ${s.unit === 'weeks' ? 'sem' : s.current === 1 ? 'mes' : 'meses'}`
}

export function streakLong(s: StreakInfo): string {
  if (s.current <= 0) return 'sin racha'
  const unit = s.unit === 'days' ? plural(s.current, 'día', 'días') : s.unit === 'weeks' ? plural(s.current, 'semana', 'semanas') : plural(s.current, 'mes', 'meses')
  return `racha de ${unit}`
}

/** La señal de la tarjeta ("Después de…") o, si no tiene, algo que oriente. */
function cueLine(item: TodayItem): string {
  const after = item.anchorName ? lowerFirst(item.anchorName) : item.cue
  if (after) return `Después de ${after}`
  if (item.multi) return `${item.multi.done} de ${item.multi.total} hoy`
  return item.trama?.name ?? ''
}

export function subtitle(item: TodayItem): string {
  const { streak, habit, doneToday } = item
  if (item.minToday) return 'Versión de 2 minutos. Cuenta igual.'
  if (doneToday && habit.reward) return `Ahora te toca: ${lowerFirst(habit.reward)}`
  const p = streak.period
  if (!p || habit.rhythm.kind !== 'quota') {
    if (streak.atRisk && !doneToday) return streak.missedYesterday ? 'Ayer faltaste. Hoy es el que cuenta.' : 'La última vez faltaste. Hoy es el que cuenta.'
    return cueLine(item)
  }
  const week = habit.rhythm.period === 'week'
  if (p.met) return week ? 'Meta de la semana cumplida' : 'Meta del mes cumplida'
  const progress = `${p.progress} de ${p.times} ${week ? 'esta semana' : 'este mes'}`
  if (doneToday) return progress
  if (p.outOfReach) return `${progress}. Cada vez igual suma un voto.`
  if (p.tight) return `${p.available === 1 ? 'Queda 1 día' : `Quedan ${p.available} días`} y te ${p.needed === 1 ? 'falta 1' : `faltan ${p.needed}`}.`
  if (streak.missedLast && streak.atRisk) return week ? 'La semana pasada no llegaste. Esta es la que cuenta.' : 'El mes pasado no llegaste. Este es el que cuenta.'
  return progress
}

/** Texto del botón de consumo: propio para el tabaco, genérico para lo demás. */
export function useLabel(name: string): string {
  return /tabaco|fum|cigarr/i.test(name) ? 'Fumé uno' : 'Sumar uno'
}

export function reduceSubtitle({ habit, trama, state: s }: ReduceItem): string {
  if (s.over) return s.limit === 0 ? 'Hoy hubo uno. Mañana es un día nuevo.' : 'Hoy te pasaste del tope. Mañana es un día nuevo.'
  if (s.atRisk) return 'Ayer te pasaste. Hoy es el que cuenta.'
  if (s.resistedToday > 0) return `${plural(s.resistedToday, 'antojo resistido', 'antojos resistidos')} hoy`
  if (s.limit === 0 && s.streak > 0) return `${plural(s.streak, 'día', 'días')} en cero`
  if (s.streak > 0) return `${plural(s.streak, 'día', 'días')} dentro del tope`
  if (habit.urgePlan) return `Si viene el antojo: ${habit.urgePlan}`
  return trama?.name ?? ''
}
