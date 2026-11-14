import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReduceItem } from '../domain/today'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2
  return { x: Math.cos(a) * 70, y: Math.sin(a) * 34 }
})

/** Texto del botón de consumo: propio para el tabaco, genérico para lo demás. */
export function useLabel(name: string): string {
  return /tabaco|fum|cigarr/i.test(name) ? 'Fumé uno' : 'Sumar uno'
}

export function reduceSubtitle({ habit, trama, state: s }: ReduceItem): string {
  if (s.over) return 'Hoy te pasaste del tope. Mañana es un día nuevo.'
  if (s.atRisk) return 'Ayer te pasaste. Hoy es el que cuenta.'
  if (s.resistedToday > 0) return `${plural(s.resistedToday, 'antojo resistido', 'antojos resistidos')} hoy`
  if (s.quit && s.streak > 0) return `${plural(s.streak, 'día', 'días')} en cero`
  if (s.streak > 0) return `${plural(s.streak, 'día', 'días')} dentro del tope`
  if (habit.urgePlan) return `Si viene el antojo: ${habit.urgePlan}`
  return trama?.name ?? ''
}

interface Props {
  item: ReduceItem
  onResist: () => void
  onUse: () => void
  onOpen: () => void
}

export function ReduceCard({ item, onResist, onUse, onOpen }: Props) {
  const { habit, state: s } = item
  const [burst, setBurst] = useState(0)
  const segments = s.limit > 0 && Math.max(s.limit, s.used) <= 14
  const cls = ['tb', s.over ? 'over' : '', s.atRisk ? 'risk' : ''].filter(Boolean).join(' ')

  return (
    <div className={cls} data-color={item.trama?.color ?? 'teal'}>
      <button type="button" className="tb-top" onClick={onOpen} aria-label={`${habit.name}: ${s.used} de ${s.limit} hoy. Ver plan.`}>
        <span className="big">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={s.used} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}>{s.used}</motion.span>
          </AnimatePresence>
          <small>/{s.limit}</small>
        </span>
        <span className="t">
          <b>{habit.name}</b>
          <span className="sub">{reduceSubtitle(item)}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>

      {segments ? (
        <div className="cigs" aria-hidden="true">
          {Array.from({ length: Math.max(s.limit, s.used) }, (_, i) => (
            <i key={i} className={i < s.used ? (i >= s.limit ? 'u x' : 'u') : undefined} />
          ))}
        </div>
      ) : s.limit > 0 ? (
        <div className="cigs" aria-hidden="true"><i className="bar" style={{ '--p': Math.min(1, s.used / s.limit) } as React.CSSProperties} /></div>
      ) : (
        <div className="cigs" />
      )}

      <div className="acts">
        <motion.button type="button" className="p" whileTap={{ scale: 0.96 }} onClick={() => { setBurst((b) => b + 1); onResist() }}>
          Resistí un antojo
          {burst > 0 && (
            <span key={burst} aria-hidden="true">
              {SPARKS.map((p, i) => (
                <motion.i key={i} className="spark" initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }} transition={{ duration: 0.6, ease: [0.1, 0.8, 0.3, 1] }} />
              ))}
            </span>
          )}
        </motion.button>
        <motion.button type="button" className="s" whileTap={{ scale: 0.96 }} onClick={onUse}>{useLabel(habit.name)}</motion.button>
      </div>
    </div>
  )
}
