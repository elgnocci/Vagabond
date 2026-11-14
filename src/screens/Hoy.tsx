import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { createHabit, db, deleteHabit, toggleLog, updateHabit, type HabitDraft } from '../db/db'
import { formatDay, toISO, type ISODate } from '../domain/dates'
import { buildToday, voteGrid, type SectionId, type TodaySection } from '../domain/today'
import type { Habit } from '../domain/types'
import { HabitCard } from '../ui/HabitCard'
import { HabitForm } from '../ui/HabitForm'
import { Hero } from '../ui/Hero'
import { Sheet } from '../ui/Sheet'
import { EmptyState, LoadingState } from '../ui/States'

const TITLES: Record<SectionId, string> = {
  morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', week: 'Esta semana', month: 'Este mes',
}

/** La fecha de hoy; se actualiza al volver a la app y al pasar la medianoche. */
function useToday(): ISODate {
  const [today, setToday] = useState(() => toISO(new Date()))
  useEffect(() => {
    const check = () => setToday(toISO(new Date()))
    const id = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}

function sectionStatus(s: TodaySection) {
  return s.done === s.total ? <span className="ok">Completa</span> : <span>{s.done} de {s.total}</span>
}

export function Hoy() {
  const today = useToday()
  const data = useLiveQuery(async () => {
    const [habits, tramas, logs] = await Promise.all([db.habits.toArray(), db.tramas.orderBy('order').toArray(), db.logs.toArray()])
    return { habits, tramas, logs }
  }, [])

  const [form, setForm] = useState<{ open: boolean; habit?: Habit }>({ open: false })
  const [toast, setToast] = useState<string | null>(null)
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])

  const view = useMemo(() => data && buildToday(data.habits, data.tramas, data.logs, today), [data, today])
  const grid = useMemo(() => (data ? voteGrid(data.logs, today) : []), [data, today])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(id)
  }, [toast])

  // Vibración más larga cuando el día pasa a estar completo.
  const wasDone = useRef<boolean | null>(null)
  useEffect(() => {
    if (!view) return
    if (wasDone.current === false && view.allDone) navigator.vibrate?.([14, 50, 24])
    wasDone.current = view.allDone
  }, [view])

  async function toggle(habitId: string) {
    try {
      if (await toggleLog(habitId, today)) navigator.vibrate?.(12)
    } catch {
      setToast('No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  async function save(draft: HabitDraft) {
    try {
      if (form.habit) await updateHabit(form.habit.id, draft)
      else await createHabit(draft)
      closeForm()
    } catch {
      setToast('No se pudo guardar el hábito. Inténtalo de nuevo.')
    }
  }

  async function remove() {
    if (!form.habit) return
    try {
      await deleteHabit(form.habit.id)
      closeForm()
    } catch {
      setToast('No se pudo eliminar. Inténtalo de nuevo.')
    }
  }

  return (
    <main className="screen">
      <header className="head">
        <h1 className="mono">
          <span className="sr-only">Hoy, </span>
          {formatDay(today)}{view?.dayNumber ? ` · Día ${view.dayNumber}` : ''}
        </h1>
        {view?.hasHabits && (
          <button className="icon-btn" aria-label="Nuevo hábito" onClick={() => setForm({ open: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.600" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      </header>

      {!view ? (
        <LoadingState />
      ) : !view.hasHabits ? (
        <EmptyState onCreate={() => setForm({ open: true })} />
      ) : (
        <>
          <Hero votes={view.totalVotes} grid={grid} done={view.done} total={view.total} allDone={view.allDone} />
          {view.sections.length === 0 && (
            <div className="rest">
              <b>Hoy no hay nada programado.</b>
              <span>Descansar también es parte de la trama. Mañana sigue la historia.</span>
            </div>
          )}
          {view.sections.map((s) => (
            <section key={s.id} aria-labelledby={`sec-${s.id}`}>
              <div className="sec-h">
                <h2 id={`sec-${s.id}`}>{TITLES[s.id]}</h2>
                {sectionStatus(s)}
              </div>
              {s.items.map((item) => (
                <HabitCard key={item.habit.id} item={item} onToggle={() => toggle(item.habit.id)}
                  onEdit={() => setForm({ open: true, habit: item.habit })} />
              ))}
            </section>
          ))}
          {data!.habits.length <= 3 && <p className="hint">Toca para marcar. Mantén presionado para editar.</p>}
        </>
      )}

      <Sheet open={form.open} title={form.habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={closeForm}>
        <HabitForm key={form.habit?.id ?? 'new'} tramas={data?.tramas ?? []} habit={form.habit}
          onSubmit={save} onDelete={form.habit ? remove : undefined} />
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
