import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  addUrge, addUse, archiveHabit, confirmDay, createHabit, deleteHabit, logMin, removeUrge, removeUse, savePauses, setTodoDone,
  swapHabits, toggleLog, tramaVotesOf, unconfirmDay, updateHabit, type HabitDraft,
} from '../db/db'
import { useData, useHour, useToast, useToday } from '../db/hooks'
import { getDayEnd } from '../day'
import { buildChapters } from '../domain/chapters'
import { addDays, formatDay } from '../domain/dates'
import { formatPct, growthSeries } from '../domain/growth'
import { togglePause } from '../domain/pauses'
import { buildToday, momentAt, type SectionId, type TodayItem, type TodaySection } from '../domain/today'
import { todosForToday } from '../domain/todos'
import { MILESTONES } from '../domain/tramas'
import type { Habit, Trama } from '../domain/types'
import { ChapterSheet } from '../ui/ChapterSheet'
import { HabitDetail } from '../ui/HabitDetail'
import { HabitMenu } from '../ui/HabitMenu'
import { HabitWizard } from '../ui/HabitWizard'
import { Milestone } from '../ui/Milestone'
import { ReduceRow } from '../ui/ReduceRow'
import { ReduceSheet } from '../ui/ReduceSheet'
import { Settings } from '../ui/Settings'
import { Sheet } from '../ui/Sheet'
import { EmptyState, LoadingState } from '../ui/States'
import { Strip } from '../ui/Strip'
import type { TabId } from '../ui/TabBar'
import { ThreadRow } from '../ui/ThreadRow'
import { TodoRow } from '../ui/TodoRow'

const TITLES: Record<SectionId, string> = {
  morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', week: 'Esta semana', month: 'Este mes',
}
const SEEN_CHAPTER = 'vagabond-chapter-seen'
const USED_MENU = 'vagabond-used-menu'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

/** Una sección del hilo. Cuando todo está hecho se pliega en una línea, con un respiro para ver la animación. */
function Section({ s, now, children }: { s: TodaySection; now: boolean; children: React.ReactNode }) {
  const complete = s.total > 0 && s.done === s.total
  const [folded, setFolded] = useState(complete)
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (!complete) return setFolded(false)
    const id = window.setTimeout(() => setFolded(true), 1100)
    return () => window.clearTimeout(id)
  }, [complete])
  const closed = folded && !opened
  const names = [...new Set(s.items.map((i) => i.habit.name))].join(' · ')

  return (
    <section aria-labelledby={`sec-${s.id}`} className={complete ? 'sec complete' : 'sec'}>
      <div className={now ? 'mom now' : 'mom'}>
        <h2 id={`sec-${s.id}`}>{TITLES[s.id]}</h2>
        <em>{complete ? 'completa' : `${s.done} de ${s.total}`}</em>
        {now && <span className="now-tag">Ahora</span>}
      </div>
      {closed ? (
        <button type="button" className="fold" onClick={() => setOpened(true)} aria-label={`${TITLES[s.id]}: todo hecho. Mostrar.`}>
          <span>{names}</span><b>Hecho</b>
        </button>
      ) : children}
    </section>
  )
}

export function Hoy({ onGo }: { onGo: (tab: TabId) => void }) {
  const today = useToday()
  const hour = useHour()
  const data = useData()
  const [form, setForm] = useState<{ open: boolean; habit?: Habit }>({ open: false })
  const [menu, setMenu] = useState<{ open: boolean; key?: string }>({ open: false })
  const [plan, setPlan] = useState<{ open: boolean; id?: string }>({ open: false })
  const [hist, setHist] = useState<{ open: boolean; id?: string }>({ open: false })
  const [settings, setSettings] = useState(false)
  const [chapterOpen, setChapterOpen] = useState(false)
  const [seenChapter, setSeenChapter] = useState(() => read(SEEN_CHAPTER) ?? '')
  const [usedMenu, setUsedMenu] = useState(() => read(USED_MENU) === '1')
  const [hito, setHito] = useState<{ trama: Trama; votes: number } | null>(null)
  const [snack, setSnack] = useState<{ msg: string; undo: () => void } | null>(null)
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])
  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), [])
  const closePlan = useCallback(() => setPlan((m) => ({ ...m, open: false })), [])
  const closeHist = useCallback(() => setHist((m) => ({ ...m, open: false })), [])
  const closeSettings = useCallback(() => setSettings(false), [])
  const closeChapter = useCallback(() => setChapterOpen(false), [])

  const view = useMemo(
    () => data && buildToday(data.habits, data.tramas, data.logs, today, data.uses, data.urges, { closures: data.closures, pauses: data.pauses }),
    [data, today],
  )
  const items = useMemo(() => view?.sections.flatMap((s) => s.items) ?? [], [view])
  const menuItem: TodayItem | undefined = items.find((i) => i.key === menu.key)
  const planItem = view?.reduce.find((r) => r.habit.id === plan.id)
  const todos = useMemo(() => (data ? todosForToday(data.todos, today) : []), [data, today])
  const chapter = useMemo(() => (data ? buildChapters(data, today, 1)[0] : undefined), [data, today])
  // Cuánto lleva sumado hoy a la curva del 1% diario.
  const gain = useMemo(() => {
    const g = data ? growthSeries(data, today).at(-1) : undefined
    return g && g.factor > 1 ? formatPct(g.factor) : null
  }, [data, today])
  const freshChapter = chapter && chapter.start > seenChapter ? chapter : undefined
  // De madrugada, antes de que cierre el día, todavía es la noche de ese día.
  const nowMoment = hour < getDayEnd() ? 'night' : momentAt(hour)
  const backupDue = !!data && data.logs.length > 20 && (!data.lastBackupAt || Date.now() - data.lastBackupAt > 30 * 86_400_000)
  const anySheet = form.open || menu.open || plan.open || hist.open || settings || chapterOpen

  useEffect(() => {
    if (!snack) return
    const id = window.setTimeout(() => setSnack(null), 5000)
    return () => window.clearTimeout(id)
  }, [snack])

  // Vibración más larga cuando el día pasa a estar completo.
  const wasDone = useRef<boolean | null>(null)
  useEffect(() => {
    if (!view) return
    if (wasDone.current === false && view.allDone) navigator.vibrate?.([14, 50, 24])
    wasDone.current = view.allDone
  }, [view])

  const fail = (msg = 'No se pudo guardar. Inténtalo de nuevo.') => () => setToast(msg)

  /** Tras sumar un voto: vibra y, si una de sus tramas llegó a un hito, lo celebra. */
  async function voted(habit: Habit) {
    navigator.vibrate?.(12)
    const hit = (await tramaVotesOf(habit.id, today)).find((t) => MILESTONES.includes(t.votes))
    const trama = hit && data?.tramas.find((t) => t.id === hit.tramaId)
    if (hit && trama) window.setTimeout(() => setHito({ trama, votes: hit.votes }), 450)
  }

  const toggle = (item: TodayItem) =>
    toggleLog(item.habit, today, item.slot).then((on) => (on ? voted(item.habit) : undefined), fail())

  function markMin(item: TodayItem) {
    closeMenu()
    logMin(item.habit, today, item.slot).then(() => voted(item.habit), fail())
  }

  /** Antojo resistido: suma un voto. Se puede deshacer. */
  const resist = (habit: Habit) =>
    addUrge(habit.id, today).then((id) => {
      setSnack({ msg: 'Antojo resistido. Un voto más.', undo: () => void removeUrge(id) })
      return voted(habit)
    }, fail())

  const use = (habit: Habit) =>
    addUse(habit.id, today).then((id) => {
      navigator.vibrate?.(6)
      setSnack({ msg: 'Anotado.', undo: () => void removeUse(id) })
    }, fail())

  function confirm(habit: Habit, ok: boolean) {
    const y = addDays(today, -1)
    confirmDay(habit, y, ok).then(() => {
      if (ok) navigator.vibrate?.(12)
      setSnack({ msg: ok ? 'Ayer cuenta: un voto más.' : 'Anotado. Hoy es un día nuevo.', undo: () => void unconfirmDay(habit.id, y) })
    }, fail())
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

  function remove(habit: Habit) {
    closeMenu()
    closePlan()
    deleteHabit(habit.id).catch(fail('No se pudo eliminar. Inténtalo de nuevo.'))
  }

  function archive(habit: Habit) {
    closeMenu()
    closePlan()
    archiveHabit(habit.id, true).then(
      () => setSnack({ msg: 'Archivado. Sus votos se conservan.', undo: () => void archiveHabit(habit.id, false) }),
      fail(),
    )
  }

  function openMenu(item: TodayItem) {
    if (!usedMenu) {
      setUsedMenu(true)
      write(USED_MENU, '1')
    }
    setMenu({ open: true, key: item.key })
  }

  /** Los hábitos vecinos en la misma sección, para subir o bajar. */
  function neighbours(item: TodayItem): { up?: Habit; down?: Habit } {
    const section = view?.sections.find((s) => s.items.some((i) => i.key === item.key))
    const ids = [...new Set(section?.items.map((i) => i.habit.id) ?? [])]
    const at = ids.indexOf(item.habit.id)
    const get = (id?: string) => data?.habits.find((h) => h.id === id)
    return { up: get(ids[at - 1]), down: get(ids[at + 1]) }
  }

  function readChapter() {
    if (!chapter) return
    setChapterOpen(true)
    setSeenChapter(chapter.start)
    write(SEEN_CHAPTER, chapter.start)
  }

  const moments = view?.sections.filter((s) => s.id !== 'week' && s.id !== 'month') ?? []
  const quotas = view?.sections.filter((s) => s.id === 'week' || s.id === 'month') ?? []
  // "Ahora" va en el momento actual; si ese no tiene nada, en el siguiente que tenga algo pendiente.
  const order: SectionId[] = ['morning', 'afternoon', 'night']
  const nowId = moments.find((s) => order.indexOf(s.id) >= order.indexOf(nowMoment) && s.done < s.total)?.id

  const row = (item: TodayItem) => (
    <ThreadRow key={item.key} item={item} onToggle={() => void toggle(item)} onMenu={() => openMenu(item)} />
  )

  return (
    <main className="screen">
      <header className="head">
        <h1 className="mono">
          <span className="sr-only">Hoy, </span>
          {formatDay(today)}{view?.dayNumber ? ` · Día ${view.dayNumber}` : ''}
        </h1>
        <div className="head-acts">
          <button className="icon-btn" aria-label={backupDue ? 'Ajustes. Hace tiempo que no haces un respaldo.' : 'Ajustes'} onClick={() => setSettings(true)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>
            {backupDue && <i className="badge" />}
          </button>
          {view?.hasHabits && (
            <button className="icon-btn" aria-label="Nuevo hábito" onClick={() => setForm({ open: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
        </div>
      </header>

      {!view || !data ? (
        <LoadingState />
      ) : !view.hasHabits ? (
        <EmptyState onCreate={() => setForm({ open: true })} />
      ) : (
        <>
          <Strip votes={view.totalVotes} done={view.done} total={view.total} allDone={view.allDone} paused={view.paused} gain={gain} onOpen={() => onGo('progreso')} />

          {freshChapter && (
            <button type="button" className="note-card" onClick={readChapter}>
              <span><small className="mono">Capítulo {freshChapter.number} · se cerró la semana</small><b>{freshChapter.title}</b></span>
              <em>Leer</em>
            </button>
          )}

          {view.paused && (
            <div className="note-card static">
              <span><small className="mono">En pausa</small><b>Nada cuenta en contra hasta que vuelvas.</b></span>
              <button type="button" onClick={() => void savePauses(togglePause(data.pauses, today)).catch(fail())}>Reanudar</button>
            </div>
          )}

          {view.reduce.length > 0 && (
            <section aria-label="Lo que estoy dejando" className="rds">
              {view.reduce.map((r) => (
                <ReduceRow key={r.habit.id} item={r} onResist={() => void resist(r.habit)} onUse={() => void use(r.habit)}
                  onOpen={() => setPlan({ open: true, id: r.habit.id })} onConfirm={(ok) => confirm(r.habit, ok)} />
              ))}
            </section>
          )}

          {view.sections.length === 0 && !view.paused && view.reduce.length === 0 && (
            <div className="rest">
              <b>Hoy no hay nada programado.</b>
              <span>Descansar también es parte de la trama. Mañana sigue la historia.</span>
            </div>
          )}

          {(moments.length > 0 || quotas.length > 0) && (
            <div className="thread">
              {moments.map((s) => <Section key={s.id} s={s} now={s.id === nowId}>{s.items.map(row)}</Section>)}
              {quotas.map((s) => <Section key={s.id} s={s} now={false}>{s.items.map(row)}</Section>)}
            </div>
          )}

          {todos.length > 0 && (
            <section aria-labelledby="sec-todos" className="todos">
              <div className="sec-h">
                <h2 id="sec-todos">Pendientes</h2>
                <button className="link go" onClick={() => onGo('pendientes')}>Ver todos</button>
              </div>
              {todos.slice(0, 3).map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onOpen={() => onGo('pendientes')} onToggle={() => {
                  navigator.vibrate?.(10)
                  setTodoDone(t.id, true).then(
                    () => setSnack({ msg: 'Pendiente hecho.', undo: () => void setTodoDone(t.id, false) }),
                    fail(),
                  )
                }} />
              ))}
              {todos.length > 3 && <p className="hint" style={{ marginTop: 4 }}>y {todos.length - 3} más</p>}
            </section>
          )}

          {!usedMenu && items.length > 0 && <p className="hint">Toca para marcar. Mantén presionado para más opciones.</p>}
        </>
      )}

      <Sheet open={form.open} label={form.habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={closeForm}>
        <HabitWizard key={form.habit?.id ?? 'new'} tramas={data?.tramas ?? []} habits={data?.habits ?? []} habit={form.habit} onSubmit={save} />
      </Sheet>

      <Sheet open={menu.open && !!menuItem} label="Opciones del hábito" onClose={closeMenu}>
        {menuItem && (() => {
          const { up, down } = neighbours(menuItem)
          const h = menuItem.habit
          return (
            <HabitMenu key={menuItem.key} item={menuItem} onMin={() => markMin(menuItem)}
              onEdit={() => { closeMenu(); setForm({ open: true, habit: h }) }}
              onHistory={() => { closeMenu(); setHist({ open: true, id: h.id }) }}
              onUp={up && (() => void swapHabits(h.id, up.id).catch(fail()))}
              onDown={down && (() => void swapHabits(h.id, down.id).catch(fail()))}
              onArchive={() => archive(h)} onDelete={() => remove(h)} />
          )
        })()}
      </Sheet>

      <Sheet open={plan.open && !!planItem} label="Plan de reducción" onClose={closePlan}>
        {planItem && (
          <ReduceSheet key={planItem.habit.id} item={planItem} today={today}
            onEdit={() => { closePlan(); setForm({ open: true, habit: planItem.habit }) }}
            onHistory={() => { closePlan(); setHist({ open: true, id: planItem.habit.id }) }}
            onArchive={() => archive(planItem.habit)} onDelete={() => remove(planItem.habit)} />
        )}
      </Sheet>

      <Sheet open={hist.open} label="Historial del hábito" onClose={closeHist}>
        {data && data.habits.filter((h) => h.id === hist.id).map((h) => (
          <HabitDetail key={h.id} habit={h} data={data} today={today} onError={setToast} />
        ))}
      </Sheet>

      <Sheet open={settings} label="Ajustes" title="Ajustes" onClose={closeSettings}>
        {data && <Settings data={data} today={today} onError={setToast} />}
      </Sheet>

      <Sheet open={chapterOpen && !!chapter} label="Capítulo de la semana" onClose={closeChapter}>
        {chapter && <ChapterSheet chapter={chapter} />}
      </Sheet>

      {/* Sin animación de salida: al cerrarse no debe quedar nada encima bloqueando los toques. */}
      {hito && <Milestone {...hito} onClose={() => setHito(null)} />}

      <AnimatePresence>
        {snack && !toast && !anySheet && (
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
