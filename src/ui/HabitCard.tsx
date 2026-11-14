import { useRef } from 'react'
import { motion } from 'motion/react'
import type { TodayItem } from '../domain/today'
import type { StreakInfo } from '../domain/streaks'
import { CheckPill } from './CheckPill'
import { lowerFirst } from './HabitWizard'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function streakLabel(s: StreakInfo): string | null {
  if (s.current <= 0) return null
  if (s.unit === 'days') return String(s.current)
  return `${s.current} ${s.unit === 'weeks' ? 'sem' : s.current === 1 ? 'mes' : 'meses'}`
}

/** La señal del hábito ("Después de…") o, si no tiene, el nombre de su trama. */
function cueLine(item: TodayItem): string {
  const after = item.anchorName ? lowerFirst(item.anchorName) : item.habit.cue
  return after ? `Después de ${after}` : item.trama?.name ?? ''
}

export function subtitle(item: TodayItem): string {
  const { streak, habit, doneToday } = item
  if (item.minToday) return 'Versión de 2 minutos. Cuenta igual.'
  const p = streak.period
  if (!p || habit.rhythm.kind !== 'quota') {
    if (streak.atRisk) return streak.missedYesterday ? 'Ayer faltaste. Hoy es el que cuenta.' : 'La última vez faltaste. Hoy es el que cuenta.'
    return cueLine(item)
  }
  const week = habit.rhythm.period === 'week'
  if (p.met) return week ? 'Meta de la semana cumplida' : 'Meta del mes cumplida'
  const progress = `${p.progress} de ${p.times} ${week ? 'esta semana' : 'este mes'}`
  if (doneToday) return progress
  if (p.outOfReach) return `${progress}. Cada vez igual suma un voto.`
  if (p.tight) return `${p.available === 1 ? 'Queda 1 día' : `Quedan ${p.available} días`} y te ${p.needed === 1 ? 'falta 1' : `faltan ${p.needed}`}.`
  if (streak.missedLast) return week ? 'La semana pasada no llegaste. Esta es la que cuenta.' : 'El mes pasado no llegaste. Este es el que cuenta.'
  return progress
}

const DOT_TEXT = { done: 'hecho', missed: 'fallado', off: 'sin programar', pending: 'pendiente' } as const

interface Props {
  item: TodayItem
  onToggle: () => void
  onMenu: () => void
}

export function HabitCard({ item, onToggle, onMenu }: Props) {
  const { habit, trama, doneToday, streak } = item
  const timer = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const met = !!streak.period?.met

  const cancel = () => window.clearTimeout(timer.current)
  const down = () => {
    held.current = false
    cancel()
    timer.current = window.setTimeout(() => {
      held.current = true
      navigator.vibrate?.(8)
      onMenu()
    }, 480)
  }

  const cls = ['card', doneToday || met ? 'done' : '', !doneToday && streak.atRisk ? 'risk' : '', met && !doneToday ? 'met' : '', item.linked ? 'linked' : '']
    .filter(Boolean).join(' ')
  const racha = streak.current > 0
    ? `racha de ${streak.unit === 'days' ? plural(streak.current, 'día', 'días') : streak.unit === 'weeks' ? plural(streak.current, 'semana', 'semanas') : plural(streak.current, 'mes', 'meses')}`
    : 'sin racha'

  return (
    <motion.button
      type="button" className={cls} data-color={trama?.color ?? 'teal'} aria-pressed={doneToday}
      aria-label={`${habit.name}. ${subtitle(item)}. ${racha}. Mantén presionado para más opciones.`}
      whileTap={{ scale: 0.975 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      onPointerDown={down} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); cancel(); if (!held.current) { held.current = true; onMenu() } }}
      onClick={() => { if (held.current) { held.current = false; return } onToggle() }}
    >
      <span className="t">
        <span className="name">{habit.name}</span>
        <span className="sub">{subtitle(item)}</span>
        <span className="trail">
          <span className="dots" role="img" aria-label={`Últimos 7 días: ${item.dots.map((d) => DOT_TEXT[d]).join(', ')}`}>
            {item.dots.map((d, i) => <i key={i} className={d} />)}
          </span>
          {!doneToday && streak.current > 0 && <span className="streak">{racha.replace('racha de ', '')}</span>}
        </span>
      </span>
      <CheckPill on={doneToday} label={streakLabel(streak)} />
    </motion.button>
  )
}
