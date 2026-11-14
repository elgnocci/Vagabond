import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createHabit, deleteHabit, logMin, toggleLog, tramaVotesOf, updateHabit, type HabitDraft } from '../db/db'
import { useData, useToast, useToday } from '../db/hooks'
import { formatDay } from '../domain/dates'
import { buildToday, voteGrid, type SectionId, type TodayItem, type TodaySection } from '../domain/today'
import { MILESTONES } from '../domain/tramas'
import type { Habit, Trama } from '../domain/types'
import { HabitCard } from '../ui/HabitCard'
import { HabitMenu } from '../ui/HabitMenu'
import { HabitWizard } from '../ui/HabitWizard'
import { Hero } from '../ui/Hero'
import { Milestone } from '../ui/Milestone'
import { Sheet } from '../ui/Sheet'
import { EmptyState, LoadingState } from '../ui/States'

const TITLES: Record<SectionId, string> = {
  morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', week: 'Esta semana', month: 'Este mes',
}

function sectionStatus(s: TodaySection) {
  return s.done === s.total ? <span className="ok">Completa</span> : <span>{s.done} de {s.total}</span>
}

export function Hoy() {
  const today = useToday()
  const data = useData()
  const [form, setForm] = useState<{ open: boolean; habit?: Habit }>({ open: false })
  const [menu, setMenu] = useState<{ open: boolean; id?: string }>({ open: false })
  const [hito, setHito] = useState<{ trama: Trama; votes: number } | null>(null)
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])
  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])

  const view = useMemo(() => data && buildToday(data.habits, data.tramas, data.logs, today), [data, today])
  const grid = useMemo(() => (data ? voteGrid(data.logs, today) : []), [data, today])
  const menuItem: TodayItem | undefined = useMemo(
    () => view?.sections.flatMap((s) => s.items).find((i) => i.habit.id === menu.id),
    [view, menu.id],
  )

  // Vibración más larga cuando el día pasa a estar completo.
  const wasDone = useRef<boolean | null>(null)
  useEffect(() => {
    if (!view) return
    if (wasDone.current === false && view.allDone) navigator.vibrate?.([14, 50, 24])
    wasDone.current = view.allDone
  }, [view])

  /** Tras sumar un voto: vibra y, si la trama llegó a un hito, lo celebra. */
  async function voted(habit: Habit) {
    navigator.vibrate?.(12)
    const votes = await tramaVotesOf(habit.id)
    const trama = data?.tramas.find((t) => t.id === habit.tramaId)
    if (trama && MILESTONES.includes(votes)) window.setTimeout(() => setHito({ trama, votes }), 450)
  }

  async function toggle(habit: Habit) {
    try {
      if (await toggleLog(habit.id, today)) await voted(habit)
    } catch {
      setToast('No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  async function markMin(habit: Habit) {
    closeMenu()
    try {
      await logMin(habit.id, today)
      await voted(habit)
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

  async function remove(habit: Habit) {
    closeMenu()
    try {
      await deleteHabit(habit.id)
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
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
                <HabitCard key={item.habit.id} item={item} onToggle={() => toggle(item.habit)}
                  onMenu={() => setMenu({ open: true, id: item.habit.id })} />
              ))}
            </section>
          ))}
          {data!.habits.length <= 3 && <p className="hint">Toca para marcar. Mantén presionado para más opciones.</p>}
        </>
      )}

      <Sheet open={form.open} label={form.habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={closeForm}>
        <HabitWizard key={form.habit?.id ?? 'new'} tramas={data?.tramas ?? []} habits={data?.habits ?? []} habit={form.habit} onSubmit={save} />
      </Sheet>

      <Sheet open={menu.open && !!menuItem} label="Opciones del hábito" onClose={closeMenu}>
        {menuItem && (
          <HabitMenu key={menuItem.habit.id} item={menuItem} onMin={() => markMin(menuItem.habit)}
            onEdit={() => { closeMenu(); setForm({ open: true, habit: menuItem.habit }) }}
            onDelete={() => remove(menuItem.habit)} />
        )}
      </Sheet>

      {/* Sin animación de salida: al cerrarse no debe quedar nada encima bloqueando los toques. */}
      {hito && <Milestone {...hito} onClose={() => setHito(null)} />}

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
