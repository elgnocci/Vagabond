import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { TodayItem } from '../domain/today'
import { streakLong, streakShort, subtitle } from './habitText'

const SPRING = { type: 'spring', stiffness: 520, damping: 24, mass: 0.8 } as const
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.4
  return { x: Math.cos(a) * 26, y: Math.sin(a) * 26 }
})

/** El nodo del hilo: anillo vacío que se llena al marcar, con chispas. */
function Node({ on }: { on: boolean }) {
  const [burst, setBurst] = useState(0)
  const prev = useRef(on)
  useEffect(() => {
    if (on && !prev.current) setBurst((b) => b + 1)
    prev.current = on
  }, [on])
  return (
    <span className="knot" aria-hidden="true">
      <motion.span className={on ? 'k on' : 'k'} animate={{ scale: on ? [1, 1.28, 1] : 1 }} transition={SPRING}>
        {on && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.26, delay: 0.05 }} />
          </svg>
        )}
      </motion.span>
      {burst > 0 && (
        <span key={burst}>
          <motion.span className="halo" initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
          {SPARKS.map((s, i) => (
            <motion.span key={i} className="spark" initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              animate={{ x: s.x, y: s.y, scale: 0, opacity: 0 }} transition={{ duration: 0.55, ease: [0.1, 0.8, 0.3, 1] }} />
          ))}
        </span>
      )}
    </span>
  )
}

interface Props {
  item: TodayItem
  onToggle: () => void
  onMenu: () => void
}

/** Un hábito en el hilo del día. Tocar marca; mantener presionado abre sus opciones. */
export function ThreadRow({ item, onToggle, onMenu }: Props) {
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
  const cls = ['st', doneToday ? 'done' : '', !doneToday && streak.atRisk ? 'risk' : '', met && !doneToday ? 'met' : '', item.linked ? 'linked' : '']
    .filter(Boolean).join(' ')
  const short = streakShort(streak)

  return (
    <motion.button type="button" className={cls} data-color={trama?.color ?? 'teal'} aria-pressed={doneToday}
      aria-label={`${habit.name}. ${subtitle(item)}. ${streakLong(streak)}. Mantén presionado para más opciones.`}
      whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      onPointerDown={down} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); cancel(); if (!held.current) { held.current = true; onMenu() } }}
      onClick={() => { if (held.current) { held.current = false; return } onToggle() }}>
      <Node on={doneToday} />
      <span className="t">
        <b>{habit.name}</b>
        <span>{subtitle(item)}</span>
      </span>
      {short && <span className="run">{short}</span>}
    </motion.button>
  )
}
