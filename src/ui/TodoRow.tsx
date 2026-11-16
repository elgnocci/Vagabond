import { motion } from 'motion/react'
import type { ISODate } from '../domain/dates'
import { dueLabel } from '../domain/todos'
import type { Todo } from '../domain/types'

interface Props {
  todo: Todo
  today: ISODate
  onToggle: () => void
  onOpen?: () => void
}

/** Un pendiente: la casilla lo marca; el texto abre la edición. */
export function TodoRow({ todo, today, onToggle, onOpen }: Props) {
  const late = !todo.done && !!todo.due && todo.due < today
  return (
    <motion.div layout="position" className={['todo', todo.done ? 'done' : '', late ? 'late' : ''].filter(Boolean).join(' ')}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
      <motion.button type="button" className="ck" role="checkbox" aria-checked={todo.done} aria-label={todo.title}
        whileTap={{ scale: 0.85 }} onClick={onToggle}>
        <span>
          {todo.done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22 }} />
            </svg>
          )}
        </span>
      </motion.button>
      <button type="button" className="body" onClick={onOpen} disabled={!onOpen} aria-label={`Editar ${todo.title}`}>
        <b>{todo.title}</b>
        {todo.due && !todo.done && <span>{late ? `Atrasado · ${dueLabel(todo.due, today)}` : dueLabel(todo.due, today)}</span>}
      </button>
    </motion.div>
  )
}
