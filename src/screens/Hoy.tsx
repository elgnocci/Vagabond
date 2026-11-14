import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  addUrge, addUse, createHabit, deleteHabit, logMin, removeUrge, removeUse, setTodoDone, toggleLog, tramaVotesOf, updateHabit,
  type HabitDraft,
} from '../db/db'
import { useData, useToast, useToday } from '../db/hooks'
import { formatDay } from '../domain/dates'
import { collectVotes } from '../domain/reduce'
import { buildToday, voteGrid, type SectionId, type TodayItem, type TodaySection } from '../domain/today'
import { todosForToday } from '../domain/todos'
import { MILESTONES } from '../domain/tramas'
import type { Habit, Trama } from '../domain/types'
import { HabitCard } from '../ui/HabitCard'
import { HabitDetail } from '../ui/HabitDetail'
import { HabitMenu } from '../ui/HabitMenu'
import { HabitWizard } from '../ui/HabitWizard'
import { Hero } from '../ui/Hero'
import { Milestone } from '../ui/Milestone'
import { ReduceCard } from '../ui/ReduceCard'
import { ReduceSheet } from '../ui/ReduceSheet'
import { Settings } from '../ui/Settings'
import { Sheet } from '../ui/Sheet'
import type { TabId } from '../ui/TabBar'
import { TodoRow } from '../ui/TodoRow'
import { EmptyState, LoadingState } from '../ui/States'

const TITLES: Record<SectionId, string> = {
  morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', week: 'Esta semana', month: 'Este mes',
}

function sectionStatus(s: TodaySection) {
  return s.done === s.total ? <span className="ok">Completa</span> : <span>{s.done} de {s.total}</span>
}

export function Hoy({ onGo }: { onGo: (tab: TabId) => void }) {
  const today = useToday()
  const data = useData()
  const [form, setForm] = useState<{ open: boolean; habit?: Habit }>({ open: false })
  const [menu, setMenu] = useState<{ open: boolean; id?: string }>({ open: false })
  const [hito, setHito] = useState<{ trama: Trama; votes: number } | null>(null)
  const [plan, setPlan] = useState<{ open: boolean; id?: string }>({ open: false })
  const [hist, setHist] = useState<{ open: boolean; id?: string }>({ open: false })
  const [settings, setSettings] = useState(false)
  const [snack, setSnack] = useState<{ msg: string; undo: () => void } | null>(null)
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])
  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])
  const closePlan = useCallback(() => setPlan((m) => ({ ...m, open: false })), [])

  const view = useMemo(() => data && buildToday(data.habits, data.tramas, data.logs, today, data.uses, data.urges), [data, today])
  const grid = useMemo(
    () => (data ? voteGrid(collectVotes(data.habits, data.logs, data.uses, data.urges, today), today) : []),
    [data, today],
  )
  const planItem = view?.reduce.find((r) => r.habit.id === plan.id)
  const todos = useMemo(() => (data ? todosForToday(data.todos, today) : []), [data, today])

  useEffect(() => {
    if (!snack) return
    const id = window.setTimeout(() => setSnack(null), 5000)
    return () => window.clearTimeout(id)
  }, [snack])
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
    const votes = await tramaVotesOf(habit.id, today)
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

  /** Antojo resistido: suma un voto. Se puede deshacer. */
  async function resist(habit: Habit) {
    try {
      const id = await addUrge(habit.id, today)
      setSnack({ msg: 'Antojo resistido. Un voto más.', undo: () => void removeUrge(id) })
      await voted(habit)
    } catch {
      setToast('No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  async function use(habit: Habit) {
    try {
      const id = await addUse(habit.id, today)
      navigator.vibrate?.(6)
      setSnack({ msg: 'Anotado.', undo: () => void removeUse(id) })
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
    closePlan()
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
        <div className="head-acts">
          <button className="icon-btn" aria-label="Ajustes" onClick={() => setSettings(true)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>
          </button>
          {view?.hasHabits && (
            <button className="icon-btn" aria-label="Nuevo hábito" onClick={() => setForm({ open: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
        </div>
      </header>

      {!view ? (
        <LoadingState />
      ) : !view.hasHabits ? (
        <EmptyState onCreate={() => setForm({ open: true })} />
      ) : (
        <>
          <Hero votes={view.totalVotes} grid={grid} done={view.done} total={view.total} allDone={view.allDone} />
          {view.sections.length === 0 && view.reduce.length === 0 && (
            <div className="rest">
              <b>Hoy no hay nada programado.</b>
              <span>Descansar también es parte de la trama. Mañana sigue la historia.</span>
            </div>
          )}
          {[...view.sections.filter((s) => s.id !== 'week' && s.id !== 'month'), 'reduce' as const,
            ...view.sections.filter((s) => s.id === 'week' || s.id === 'month')].map((s) => s === 'reduce' ? (
            view.reduce.length > 0 && (
              <section key="reduce" aria-labelledby="sec-reduce">
                <div className="sec-h">
                  <h2 id="sec-reduce">Lo que estoy dejando</h2>
                  {view.reduce.every((r) => !r.state.over) ? <span className="ok">Dentro del tope</span> : <span>Sobre el tope</span>}
                </div>
                {view.reduce.map((r) => (
                  <ReduceCard key={r.habit.id} item={r} onResist={() => resist(r.habit)} onUse={() => use(r.habit)}
                    onOpen={() => setPlan({ open: true, id: r.habit.id })} />
                ))}
              </section>
            )
          ) : (
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
          {todos.length > 0 && (
            <section aria-labelledby="sec-todos">
              <div className="sec-h">
                <h2 id="sec-todos">Pendientes</h2>
                <button className="link go" onClick={() => onGo('pendientes')}>Ver todos</button>
              </div>
              {todos.slice(0, 3).map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onOpen={() => onGo('pendientes')} onToggle={() => {
                  navigator.vibrate?.(10)
                  setTodoDone(t.id, true).then(
                    () => setSnack({ msg: 'Pendiente hecho.', undo: () => void setTodoDone(t.id, false) }),
                    () => setToast('No se pudo guardar. Inténtalo de nuevo.'),
                  )
                }} />
              ))}
              {todos.length > 3 && <p className="hint" style={{ marginTop: 4 }}>y {todos.length - 3} más</p>}
            </section>
          )}
          {view.sections.length > 0 && data!.habits.length <= 3 && <p className="hint">Toca para marcar. Mantén presionado para más opciones.</p>}
        </>
      )}

      <Sheet open={form.open} label={form.habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={closeForm}>
        <HabitWizard key={form.habit?.id ?? 'new'} tramas={data?.tramas ?? []} habits={data?.habits ?? []} habit={form.habit} onSubmit={save} />
      </Sheet>

      <Sheet open={menu.open && !!menuItem} label="Opciones del hábito" onClose={closeMenu}>
        {menuItem && (
          <HabitMenu key={menuItem.habit.id} item={menuItem} onMin={() => markMin(menuItem.habit)}
            onEdit={() => { closeMenu(); setForm({ open: true, habit: menuItem.habit }) }}
            onHistory={() => { closeMenu(); setHist({ open: true, id: menuItem.habit.id }) }}
            onDelete={() => remove(menuItem.habit)} />
        )}
      </Sheet>

      <Sheet open={plan.open && !!planItem} label="Plan de reducción" onClose={closePlan}>
        {planItem && (
          <ReduceSheet key={planItem.habit.id} item={planItem} today={today}
            onEdit={() => { closePlan(); setForm({ open: true, habit: planItem.habit }) }}
            onDelete={() => remove(planItem.habit)} />
        )}
      </Sheet>

      <Sheet open={hist.open} label="Historial del hábito" onClose={() => setHist((h) => ({ ...h, open: false }))}>
        {data && data.habits.filter((h) => h.id === hist.id).map((h) => (
          <HabitDetail key={h.id} habit={h} data={data} today={today} onError={setToast} />
        ))}
      </Sheet>

      <Sheet open={settings} label="Ajustes" title="Ajustes" onClose={() => setSettings(false)}>
        {data && <Settings data={data} today={today} canNotify={false} onError={setToast} />}
      </Sheet>

      {/* Sin animación de salida: al cerrarse no debe quedar nada encima bloqueando los toques. */}
      {hito && <Milestone {...hito} onClose={() => setHito(null)} />}

      <AnimatePresence>
        {snack && !toast && !form.open && !menu.open && !plan.open && !hist.open && !settings && (
          <motion.div key={snack.msg} className="toast snack" role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            {snack.msg}
            <button onClick={() => { snack.undo(); setSnack(null) }}>Deshacer</button>
          </motion.div>
        )}
      </AnimatePresence>

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
