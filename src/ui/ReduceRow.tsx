import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReduceItem } from '../domain/today'
import { reduceSubtitle, useLabel } from './habitText'

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a) * 44, y: Math.sin(a) * 26 }
})

interface Props {
  item: ReduceItem
  onResist: () => void
  onUse: () => void
  onOpen: () => void
  /** Respuesta a "¿cómo te fue ayer?". */
  onConfirm: (ok: boolean) => void
}

/** Lo que se está dejando, en una fila: cuánto va hoy contra el tope, y los dos botones. */
export function ReduceRow({ item, onResist, onUse, onOpen, onConfirm }: Props) {
  const { habit, state: s } = item
  const [burst, setBurst] = useState(0)
  const cls = ['rd', s.over ? 'over' : '', s.atRisk ? 'risk' : ''].filter(Boolean).join(' ')
  const ratio = s.limit > 0 ? Math.min(1, s.used / s.limit) : s.used > 0 ? 1 : 0

  return (
    <div className={cls} data-color={item.trama?.color ?? 'teal'}>
      <div className="rd-main">
        <button type="button" className="rd-info" onClick={onOpen}
          aria-label={`${habit.name}: ${s.used}${s.limit > 0 ? ` de ${s.limit}` : ''} hoy. Ver plan.`}>
          <span className="big">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={s.used} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}>{s.used}</motion.span>
            </AnimatePresence>
            {s.limit > 0 && <small>/{s.limit}</small>}
          </span>
          <span className="t">
            <b>{habit.name}</b>
            <span>{reduceSubtitle(item)}</span>
          </span>
        </button>
        <motion.button type="button" className="p" whileTap={{ scale: 0.94 }} onClick={() => { setBurst((b) => b + 1); onResist() }}
          aria-label="Resistí un antojo">
          Resistí
          {burst > 0 && (
            <span key={burst} aria-hidden="true">
              {SPARKS.map((p, i) => (
                <motion.i key={i} className="spark" initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }} transition={{ duration: 0.6, ease: [0.1, 0.8, 0.3, 1] }} />
              ))}
            </span>
          )}
        </motion.button>
        <motion.button type="button" className="s" whileTap={{ scale: 0.94 }} onClick={onUse} aria-label={useLabel(habit.name)}>+1</motion.button>
      </div>
      <i className="rd-bar" aria-hidden="true" style={{ '--p': ratio } as React.CSSProperties} />
      {s.needsConfirm && (
        <div className="rd-ask">
          <span>Ayer no anotaste nada. ¿Cómo te fue?</span>
          <div>
            <button type="button" onClick={() => onConfirm(true)}>{s.limit === 0 ? 'En cero' : 'Dentro del tope'}</button>
            <button type="button" className="no" onClick={() => onConfirm(false)}>{s.limit === 0 ? 'Hubo alguno' : 'Me pasé'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
