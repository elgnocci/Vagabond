import { AnimatePresence, motion } from 'motion/react'

interface Props {
  votes: number
  done: number
  total: number
  allDone: boolean
  paused: boolean
  onOpen: () => void
}

/** Franja de votos: el total y el avance de hoy. Tocarla lleva a Progreso. */
export function Strip({ votes, done, total, allDone, paused, onOpen }: Props) {
  return (
    <motion.button type="button" className="strip" onClick={onOpen} aria-label={`${votes} votos. Hoy ${done} de ${total}. Ver progreso.`}
      animate={allDone ? { boxShadow: ['0 0 0 0 rgba(86,216,194,0)', '0 0 0 6px rgba(86,216,194,.28)', '0 0 0 14px rgba(86,216,194,0)'] } : { boxShadow: '0 0 0 0 rgba(86,216,194,0)' }}
      transition={{ duration: 0.9, ease: 'easeOut' }}>
      <span className="n" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={votes} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}>{votes}</motion.span>
        </AnimatePresence>
      </span>
      <span className="t">
        <span>
          {votes === 1 ? 'voto' : 'votos'} por <em>quien quieres ser</em>
          {paused ? ' · en pausa' : total > 0 && (allDone ? <b> · día completo</b> : ` · hoy ${done} de ${total}`)}
        </span>
        {total > 0 && (
          total <= 10
            ? <span className="seg" aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? 'f' : undefined} />)}</span>
            : <span className="seg bar" aria-hidden="true" style={{ '--p': done / total } as React.CSSProperties}><i /></span>
        )}
      </span>
    </motion.button>
  )
}
