import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { archiveHabit, createTrama, deleteTrama, updateTrama, type TramaDraft } from '../db/db'
import { useData, useToast, useToday, type Data } from '../db/hooks'
import { collectVotes, limitOn, reduceState } from '../domain/reduce'
import { computeStreak } from '../domain/streaks'
import { MILESTONES, milestoneProgress, rhythmText, tramaStats, type TramaStats } from '../domain/tramas'
import { TRAMA_COLORS, type Trama } from '../domain/types'
import { Constellation } from '../ui/Constellation'
import { HabitDetail } from '../ui/HabitDetail'
import { plural } from '../ui/habitText'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/States'
import { TramaForm } from '../ui/TramaForm'

type View = 'map' | 'list'
const VIEWS: { id: View; label: string }[] = [{ id: 'map', label: 'Mapa' }, { id: 'list', label: 'Lista' }]

function MileBar({ votes }: { votes: number }) {
  const { next, ratio } = milestoneProgress(votes)
  return (
    <div className="mile">
      <div className="track"><motion.i initial={false} animate={{ scaleX: Math.max(ratio, 0.02) }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} /></div>
      <span>{next ? `${plural(next - votes, 'voto', 'votos')} para los ${next}` : 'Todos los hitos'}</span>
    </div>
  )
}

export function Tramas() {
  const data = useData()
  const today = useToday()
  const [view, setView] = useState<View>('map')
  const [selected, setSelected] = useState<string | null>(null)
  const [hist, setHist] = useState<{ open: boolean; id?: string }>({ open: false })
  const [form, setForm] = useState<{ open: boolean; trama?: Trama }>({ open: false })
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])
  const closeHist = useCallback(() => setHist((h) => ({ ...h, open: false })), [])

  const m = useMemo(() => {
    if (!data) return undefined
    const votes = collectVotes(data.habits, data.logs, data.uses, data.urges, today, data.closures, data.pauses)
    const perHabit = new Map<string, number>()
    const lit = new Set<string>()
    for (const v of votes) {
      perHabit.set(v.habitId, (perHabit.get(v.habitId) ?? 0) + 1)
      if (v.date === today) lit.add(v.habitId)
    }
    return { stats: tramaStats(data.tramas, data.habits, votes), votesOf: (id: string) => perHabit.get(id) ?? 0, lit }
  }, [data, today])
  const stats = m?.stats
  const current = stats?.find((s) => s.trama.id === selected)
  const suggested = TRAMA_COLORS.find((c) => !data?.tramas.some((t) => t.color === c)) ?? 'teal'
  const anyHabit = !!stats?.some((s) => s.habits.length > 0)

  async function save(draft: TramaDraft) {
    try {
      if (form.trama) await updateTrama(form.trama.id, draft)
      else await createTrama(draft)
      closeForm()
    } catch {
      setToast('No se pudo guardar la trama. Inténtalo de nuevo.')
    }
  }

  async function remove() {
    if (!form.trama) return
    try {
      if (await deleteTrama(form.trama.id)) {
        closeForm()
        setSelected(null)
      } else setToast('Esta trama todavía tiene hábitos.')
    } catch {
      setToast('No se pudo eliminar. Inténtalo de nuevo.')
    }
  }

  return (
    <main className="screen">
      {current && data ? (
        <Detail s={current} today={today} data={data} onBack={() => setSelected(null)} onEdit={() => setForm({ open: true, trama: current.trama })}
          onHabit={(id) => setHist({ open: true, id })} onError={setToast} />
      ) : (
        <>
          <header className="head">
            <h1 className="mono">Tramas</h1>
            <button className="icon-btn" aria-label="Nueva trama" onClick={() => setForm({ open: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </header>
          <p className="title">Quién estás eligiendo ser</p>
          {!stats || !m ? (
            <LoadingState />
          ) : stats.length === 0 ? (
            <div className="state" style={{ paddingTop: '8vh' }}>
              <h2>Todavía no hay tramas.</h2>
              <p>Una trama es una identidad: la persona en la que te conviertes con cada hábito que cumples.</p>
              <button className="btn" onClick={() => setForm({ open: true })}>Crear mi primera trama</button>
            </div>
          ) : (
            <>
              {anyHabit && (
                <div className="segm sm view-switch" role="group" aria-label="Vista">
                  {VIEWS.map((v) => (
                    <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                      {view === v.id && <motion.i layoutId="vista" className="thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                      <span>{v.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {anyHabit && view === 'map' ? (
                <>
                  <Constellation stats={stats} votesOf={m.votesOf} lit={m.lit} onHabit={(id) => setHist({ open: true, id })} onTrama={setSelected} />
                  <p className="hint">Cada nodo crece con sus votos y se enciende cuando votas hoy. Toca uno para ver su historia.</p>
                </>
              ) : (
                stats.map((s) => (
                  <motion.button key={s.trama.id} className="trama" data-color={s.trama.color} whileTap={{ scale: 0.98 }} onClick={() => setSelected(s.trama.id)}>
                    <span className="trama-top">
                      <span>
                        <span className="trama-name">{s.trama.name}</span>
                        {s.trama.identity && <span className="identity">Soy alguien que {s.trama.identity}</span>}
                      </span>
                      <span className="votes">{s.votes}<small>{s.votes === 1 ? 'voto' : 'votos'}</small></span>
                    </span>
                    <MileBar votes={s.votes} />
                    <span className="mono" style={{ display: 'block', marginTop: 12 }}>
                      {s.habits.length ? plural(s.habits.length, 'hábito', 'hábitos') : 'Sin hábitos todavía'}
                    </span>
                  </motion.button>
                ))
              )}
            </>
          )}
        </>
      )}

      <Sheet open={form.open} label={form.trama ? 'Editar trama' : 'Nueva trama'} title={form.trama ? 'Editar trama' : 'Nueva trama'} onClose={closeForm}>
        <TramaForm key={form.trama?.id ?? 'new'} trama={form.trama} suggested={suggested}
          canDelete={!data?.habits.some((h) => h.tramaId === form.trama?.id)} onSubmit={save} onDelete={remove} />
      </Sheet>

      <Sheet open={hist.open} label="Historial del hábito" onClose={closeHist}>
        {data && data.habits.filter((h) => h.id === hist.id).map((h) => (
          <HabitDetail key={h.id} habit={h} data={data} today={today} onError={setToast} />
        ))}
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

interface DetailProps {
  s: TramaStats
  today: string
  data: Data
  onBack: () => void
  onEdit: () => void
  onHabit: (id: string) => void
  onError: (msg: string) => void
}

function Detail({ s, today, data, onBack, onEdit, onHabit, onError }: DetailProps) {
  const { next } = milestoneProgress(s.votes)
  const unit = { days: ['día', 'días'], weeks: ['semana', 'semanas'], months: ['mes', 'meses'] } as const
  const archived = data.habits.filter((h) => h.archived && (h.tramaId === s.trama.id || h.tramaId2 === s.trama.id))
  return (
    <div data-color={s.trama.color}>
      <header className="head">
        <button className="back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          Tramas
        </button>
        <button className="icon-btn" aria-label="Editar trama" onClick={onEdit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" /></svg>
        </button>
      </header>
      <section className="hero">
        <span className="trama-name">{s.trama.name}</span>
        {s.trama.identity && <span className="identity" style={{ display: 'block', font: 'italic 400 22px/1.2 var(--serif)', marginTop: 8 }}>Soy alguien que {s.trama.identity}</span>}
        <div className="detail-n" style={{ marginTop: 20 }}>{s.votes}</div>
        <p>{s.votes === 1 ? 'voto' : 'votos'} por esta trama</p>
        <MileBar votes={s.votes} />
        <div className="steps" aria-label="Hitos">
          {MILESTONES.slice(0, 5).map((m) => (
            <span key={m} className={m <= s.votes ? 'hit' : m === next ? 'next' : undefined}>{m}</span>
          ))}
        </div>
      </section>

      <div className="sec-h"><h2>Hábitos</h2><span>{s.habits.length}</span></div>
      {s.habits.length === 0 && <p className="note" style={{ textAlign: 'left', margin: '0 4px' }}>Esta trama aún no tiene hábitos. Créalos desde Hoy con el botón +.</p>}
      {s.habits.map((h) => {
        const shared = h.tramaId2 ? data.tramas.find((t) => t.id === (h.tramaId === s.trama.id ? h.tramaId2 : h.tramaId))?.name : undefined
        const also = shared ? ` · también en ${shared}` : ''
        if (h.kind === 'reduce') {
          const st = reduceState(h, data.uses, data.urges, today, data.closures, data.pauses)
          return (
            <button className="hrow" key={h.id} onClick={() => onHabit(h.id)}>
              <span>
                <b>{h.name}</b>
                <span>{st.cold ? 'En cero desde el primer día' : `Plan de reducción · ${h.plan && !st.quit ? `tope de hoy ${limitOn(h.plan, today)}` : 'en cero'}`}{also}</span>
              </span>
              <em>{st.streak}<small>{unit.days[st.streak === 1 ? 0 : 1]}</small></em>
            </button>
          )
        }
        const streak = computeStreak(h, new Set(data.logs.filter((l) => l.habitId === h.id).map((l) => l.date)), today, data.pauses)
        return (
          <button className="hrow" key={h.id} onClick={() => onHabit(h.id)}>
            <span>
              <b>{h.name}</b>
              <span>{rhythmText(h.rhythm)}{h.slots && h.slots.length > 1 ? `, ${h.slots.length} veces al día` : ''}{h.minVersion ? ` · 2 min: ${h.minVersion}` : ''}{also}</span>
            </span>
            <em>{streak.current}<small>{unit[streak.unit][streak.current === 1 ? 0 : 1]}</small></em>
          </button>
        )
      })}

      {archived.length > 0 && (
        <>
          <div className="sec-h"><h2>Archivados</h2><span>{archived.length}</span></div>
          {archived.map((h) => (
            <div className="hrow" key={h.id}>
              <span><b>{h.name}</b><span>Sus votos siguen contando</span></span>
              <button className="link go" onClick={() => void archiveHabit(h.id, false).catch(() => onError('No se pudo recuperar. Inténtalo de nuevo.'))}>Recuperar</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
