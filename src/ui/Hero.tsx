import { AnimatePresence, motion } from 'motion/react'
import type { GridCell } from '../domain/today'

interface Props {
  votes: number
  grid: GridCell[]
  done: number
  total: number
  allDone: boolean
}

export function Hero({ votes, grid, done, total, allDone }: Props) {
  return (
    <motion.section className="hero" aria-label="Tus votos"
      animate={allDone ? { boxShadow: ['0 0 0 0 rgba(86,216,194,0)', '0 0 0 6px rgba(86,216,194,.28)', '0 0 0 14px rgba(86,216,194,0)'] } : { boxShadow: '0 0 0 0 rgba(86,216,194,0)' }}
      transition={{ duration: 0.9, ease: 'easeOut' }}>
      <div className="hero-row">
        <div>
          <span className="hero-n" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={votes} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
                {votes}
              </motion.span>
            </AnimatePresence>
          </span>
          <p>{votes === 1 ? 'voto' : 'votos'} por <em>quien quieres ser</em></p>
        </div>
        <div className="grid" role="img" aria-label="Votos de las últimas cinco semanas">
          {grid.map((c) => (
            <i key={c.date} data-l={c.level} className={[c.isToday ? 'today' : '', c.future ? 'future' : ''].join(' ')} />
          ))}
        </div>
      </div>
      {total > 0 && (
        <div className="today-row">
          <b>Hoy</b>
          {total <= 8 ? (
            <div className="seg" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? 'f' : undefined} />)}
            </div>
          ) : (
            <div className="seg bar" aria-hidden="true" style={{ '--p': done / total } as React.CSSProperties}><i /></div>
          )}
          {allDone ? <span className="ok">Día completo</span> : <span>{done} de {total}</span>}
        </div>
      )}
    </motion.section>
  )
}
