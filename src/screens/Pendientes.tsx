import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { clearDoneTodos, createTodo, deleteTodo, setTodoDone, updateTodo, type TodoDraft } from '../db/db'
import { useData, useToast, useToday } from '../db/hooks'
import { groupTodos } from '../domain/todos'
import type { Todo } from '../domain/types'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/States'
import { TodoForm } from '../ui/TodoForm'
import { TodoRow } from '../ui/TodoRow'

const GROUPS = [
  ['overdue', 'Atrasados'], ['today', 'Hoy'], ['upcoming', 'Próximos'], ['undated', 'Sin fecha'],
] as const

export function Pendientes() {
  const data = useData()
  const today = useToday()
  const [form, setForm] = useState<{ open: boolean; todo?: Todo }>({ open: false })
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])
  const groups = useMemo(() => data && groupTodos(data.todos, today), [data, today])

  const guard = (fn: () => Promise<unknown>, msg = 'No se pudo guardar. Inténtalo de nuevo.') => fn().catch(() => setToast(msg))
  const toggle = (t: Todo) => {
    if (!t.done) navigator.vibrate?.(10)
    void guard(() => setTodoDone(t.id, !t.done))
  }
  const save = (draft: TodoDraft) =>
    guard(async () => {
      if (form.todo) await updateTodo(form.todo.id, draft)
      else await createTodo(draft)
      closeForm()
    }) as Promise<void>
  const remove = () =>
    guard(async () => {
      if (form.todo) await deleteTodo(form.todo.id)
      closeForm()
    }, 'No se pudo eliminar. Inténtalo de nuevo.') as Promise<void>

  const open = groups ? GROUPS.reduce((n, [id]) => n + groups[id].length, 0) : 0

  return (
    <main className="screen">
      <header className="head">
        <h1 className="mono">Pendientes</h1>
        <button className="icon-btn" aria-label="Nuevo pendiente" onClick={() => setForm({ open: true })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>
      <p className="title">Lo que se hace una vez</p>

      {!groups ? (
        <LoadingState />
      ) : open === 0 && groups.done.length === 0 ? (
        <div className="state" style={{ paddingTop: '8vh' }}>
          <h2>Nada pendiente.</h2>
          <p>Aquí va lo que tienes que hacer una vez y no es un hábito: pedir hora al dentista, pagar una cuenta, devolver un libro.</p>
          <button className="btn" onClick={() => setForm({ open: true })}>Agregar un pendiente</button>
        </div>
      ) : (
        <>
          {open === 0 && (
            <div className="rest" style={{ marginTop: 0 }}>
              <b>Todo al día.</b>
              <span>No queda nada pendiente.</span>
            </div>
          )}
          {GROUPS.map(([id, label]) => groups[id].length > 0 && (
            <section key={id} aria-labelledby={`g-${id}`}>
              <div className="sec-h"><h2 id={`g-${id}`}>{label}</h2><span>{groups[id].length}</span></div>
              {groups[id].map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onToggle={() => toggle(t)} onOpen={() => setForm({ open: true, todo: t })} />
              ))}
            </section>
          ))}
          {groups.done.length > 0 && (
            <section aria-labelledby="g-done">
              <div className="sec-h">
                <h2 id="g-done">Hechos</h2>
                <button className="link" onClick={() => void guard(clearDoneTodos, 'No se pudo borrar. Inténtalo de nuevo.')}>Borrar hechos</button>
              </div>
              {groups.done.map((t) => <TodoRow key={t.id} todo={t} today={today} onToggle={() => toggle(t)} onOpen={() => setForm({ open: true, todo: t })} />)}
            </section>
          )}
        </>
      )}

      <Sheet open={form.open} label={form.todo ? 'Editar pendiente' : 'Nuevo pendiente'} title={form.todo ? 'Editar pendiente' : 'Nuevo pendiente'} onClose={closeForm}>
        <TodoForm key={form.todo?.id ?? 'new'} todo={form.todo} today={today} onSubmit={save} onDelete={remove} />
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="alert" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
