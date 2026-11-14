import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Hoja inferior: se cierra tocando fuera, arrastrando el tirador hacia abajo o con Escape. */
export function Sheet({ open, title, onClose, children }: Props) {
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // Lo que queda detrás no se puede tocar ni leer mientras la hoja está abierta.
    const root = document.getElementById('root')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root?.setAttribute('inert', '')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      root?.removeAttribute('inert')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="scrim" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div key="sheet" className="sheet" role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}>
            <div onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none', margin: '-10px 0 0', padding: '10px 0 0', cursor: 'grab' }}>
              <h2 style={{ paddingTop: 20, marginTop: -20 }}>{title}</h2>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
