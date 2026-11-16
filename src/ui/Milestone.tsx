import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { milestonePhrase } from '../domain/tramas'
import type { Trama } from '../domain/types'

const ORBIT = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  return { x: Math.cos(a) * 130, y: Math.sin(a) * 96 }
})

/** Celebración al llegar a un hito de votos en una trama. */
export function Milestone({ trama, votes, onClose }: { trama: Trama; votes: number; onClose: () => void }) {
  return createPortal(
    <div className="hito-wrap" data-color={trama.color}>
      <motion.div className="scrim" style={{ zIndex: 0 }} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div className="hito" role="alertdialog" aria-modal="true" aria-label={`${votes} votos por ${trama.name}`}
        initial={{ scale: 0.86, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
        {ORBIT.map((o, i) => (
          <motion.i key={i} className="orbit" aria-hidden="true" initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x: o.x, y: o.y, scale: [0, 1, 0], opacity: [1, 1, 0] }} transition={{ duration: 0.9, delay: 0.12, ease: 'easeOut' }} />
        ))}
        <motion.div className="n" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.08 }}>
          {votes}
        </motion.div>
        <div className="of">votos por <b>{trama.name}</b></div>
        <p>{milestonePhrase(votes)}</p>
        <button className="btn block" autoFocus onClick={onClose}>Seguir</button>
      </motion.div>
    </div>,
    document.body,
  )
}
