import { useState } from 'react'
import type { TodoDraft } from '../db/db'
import { addDays, type ISODate } from '../domain/dates'
import type { Todo } from '../domain/types'

type When = 'none' | 'today' | 'tomorrow' | 'custom'
const OPTIONS: { id: When; label: string }[] = [
  { id: 'none', label: 'Sin fecha' },
  { id: 'today', label: 'Hoy' },
  { id: 'tomorrow', label: 'Mañana' },
  { id: 'custom', label: 'Otra fecha' },
]

interface Props {
  todo?: Todo
  today: ISODate
  onSubmit: (draft: TodoDraft) => Promise<void>
  onDelete?: () => Promise<void>
}

export function TodoForm({ todo, today, onSubmit, onDelete }: Props) {
  const tomorrow = addDays(today, 1)
  const [title, setTitle] = useState(todo?.title ?? '')
  const [when, setWhen] = useState<When>(!todo?.due ? 'none' : todo.due === today ? 'today' : todo.due === tomorrow ? 'tomorrow' : 'custom')
  const [custom, setCustom] = useState(todo?.due ?? addDays(today, 2))
  const [tried, setTried] = useState(false)
  const error = tried && !title.trim() ? 'Escribe qué tienes que hacer.' : null
  const due = when === 'none' ? null : when === 'today' ? today : when === 'tomorrow' ? tomorrow : custom || null

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (title.trim()) void onSubmit({ title, due }) }}>
      <div className="field">
        <label htmlFor="p-title">¿Qué tienes que hacer?</label>
        <input id="p-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ir al dentista"
          maxLength={80} autoComplete="off" aria-invalid={!!error} />
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="field">
        <span className="lbl" id="l-cuando">¿Para cuándo?</span>
        <div className="chips" role="group" aria-labelledby="l-cuando">
          {OPTIONS.map((o) => (
            <button type="button" key={o.id} className="chip plain" aria-pressed={when === o.id} onClick={() => setWhen(o.id)}>{o.label}</button>
          ))}
        </div>
        {when === 'custom' && (
          <input className="input" type="date" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Fecha" style={{ marginTop: 8 }} />
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn block" type="submit">{todo ? 'Guardar cambios' : 'Agregar pendiente'}</button>
        {todo && onDelete && <button className="btn block ghost" type="button" onClick={() => void onDelete()}>Eliminar</button>}
      </div>
    </form>
  )
}
