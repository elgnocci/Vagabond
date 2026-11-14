import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createTrama, deleteTrama, updateTrama, type TramaDraft } from '../db/db'
import { useData, useToast, useToday } from '../db/hooks'
import { computeStreak } from '../domain/streaks'
import { MILESTONES, milestoneProgress, rhythmText, tramaStats, type TramaStats } from '../domain/tramas'
import { TRAMA_COLORS, type Trama } from '../domain/types'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/States'
import { TramaForm } from '../ui/TramaForm'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<{ open: boolean; trama?: Trama }>({ open: false })
  const [toast, setToast] = useToast()
  const closeForm = useCallback(() => setForm((f) => ({ ...f, open: false })), [])

  const stats = useMemo(() => (data ? tramaStats(data.tramas, data.habits, data.logs) : undefined), [data])
  const current = stats?.find((s) => s.trama.id === selected)
  const suggested = TRAMA_COLORS.find((c) => !data?.tramas.some((t) => t.color === c)) ?? 'teal'

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
      {current ? (
        <Detail s={current} today={today} logs={data!.logs} onBack={() => setSelected(null)} onEdit={() => setForm({ open: true, trama: current.trama })} />
      ) : (
        <>
          <header className="head">
            <h1 className="mono">Tramas</h1>
            <button className="icon-btn" aria-label="Nueva trama" onClick={() => setForm({ open: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </header>
          <p className="title">Quién estás eligiendo ser</p>
          {!stats ? (
            <LoadingState />
          ) : stats.length === 0 ? (
            <div className="state" style={{ paddingTop: '8vh' }}>
              <h2>Todavía no hay tramas.</h2>
              <p>Una trama es una identidad: la persona en la que te conviertes con cada hábito que cumples.</p>
              <button className="btn" onClick={() => setForm({ open: true })}>Crear mi primera trama</button>
            </div>
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

      <Sheet open={form.open} label={form.trama ? 'Editar trama' : 'Nueva trama'} title={form.trama ? 'Editar trama' : 'Nueva trama'} onClose={closeForm}>
        <TramaForm key={form.trama?.id ?? 'new'} trama={form.trama} suggested={suggested}
          canDelete={!data?.habits.some((h) => h.tramaId === form.trama?.id)} onSubmit={save} onDelete={remove} />
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
  logs: { habitId: string; date: string }[]
  onBack: () => void
  onEdit: () => void
}

function Detail({ s, today, logs, onBack, onEdit }: DetailProps) {
  const { next } = milestoneProgress(s.votes)
  const unit = { days: ['día', 'días'], weeks: ['semana', 'semanas'], months: ['mes', 'meses'] } as const
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
        const streak = computeStreak(h, new Set(logs.filter((l) => l.habitId === h.id).map((l) => l.date)), today)
        return (
          <div className="hrow" key={h.id}>
            <div>
              <b>{h.name}</b>
              <span>{rhythmText(h.rhythm)}{h.minVersion ? ` · 2 min: ${h.minVersion}` : ''}</span>
            </div>
            <em>{streak.current}<small>{unit[streak.unit][streak.current === 1 ? 0 : 1]}</small></em>
          </div>
        )
      })}
    </div>
  )
}
