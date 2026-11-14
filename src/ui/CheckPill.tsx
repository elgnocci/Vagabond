import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

const SPRING = { type: 'spring', stiffness: 520, damping: 26, mass: 0.8 } as const
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.4
  return { x: Math.cos(a) * 34, y: Math.sin(a) * 30 }
})

/** El control de marcar: anillo vacío que se llena, dibuja el check y muestra la racha. */
export function CheckPill({ on, label }: { on: boolean; label: string | null }) {
  const [burst, setBurst] = useState(0)
  const prev = useRef(on)
  useEffect(() => {
    if (on && !prev.current) setBurst((b) => b + 1)
    prev.current = on
  }, [on])

  return (
    <span className="pill-wrap" aria-hidden="true">
      <motion.span layout className={on ? 'pill on' : 'pill'} style={{ borderRadius: 22 }} transition={SPRING}>
        <AnimatePresence initial={false} mode="popLayout">
          {on && (
            <motion.svg key="check" layout="position" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING}>
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, delay: 0.06, ease: 'easeOut' }} />
            </motion.svg>
          )}
          {on && label && (
            <motion.span key={label} layout="position" className="num" initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={SPRING}>
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
      {burst > 0 && (
        <span key={burst}>
          <motion.span className="ring" initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }} />
          {SPARKS.map((s, i) => (
            <motion.span key={i} className="spark" initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              animate={{ x: s.x, y: s.y, scale: 0, opacity: 0 }} transition={{ duration: 0.55, ease: [0.1, 0.8, 0.3, 1] }} />
          ))}
        </span>
      )}
    </span>
  )
}
