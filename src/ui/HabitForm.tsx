import { useState } from 'react'
import { motion } from 'motion/react'
import type { HabitDraft } from '../db/db'
import type { Habit, Moment, Period, Trama } from '../domain/types'

type Mode = 'days' | 'week' | 'month'
const MODES: { id: Mode; label: string }[] = [
  { id: 'days', label: 'Días fijos' },
  { id: 'week', label: 'Por semana' },
  { id: 'month', label: 'Por mes' },
]
const MOMENTS: { id: Moment; label: string }[] = [
  { id: 'morning', label: 'Mañana' },
  { id: 'afternoon', label: 'Tarde' },
  { id: 'night', label: 'Noche' },
]
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

interface Props {
  tramas: Trama[]
  habit?: Habit
  onSubmit: (draft: HabitDraft) => Promise<void>
  onDelete?: () => Promise<void>
}

export function HabitForm({ tramas, habit, onSubmit, onDelete }: Props) {
  const r = habit?.rhythm
  const [name, setName] = useState(habit?.name ?? '')
  const [tramaId, setTramaId] = useState<string | null>(habit?.tramaId ?? tramas[0]?.id ?? null)
  const [newTrama, setNewTrama] = useState('')
  const [mode, setMode] = useState<Mode>(r?.kind === 'quota' ? r.period : 'days')
  const [days, setDays] = useState<number[]>(r?.kind === 'days' ? r.days : ALL_DAYS)
  const [times, setTimes] = useState<Record<Period, number>>({
    week: r?.kind === 'quota' && r.period === 'week' ? r.times : 2,
    month: r?.kind === 'quota' && r.period === 'month' ? r.times : 1,
  })
  const [moment, setMoment] = useState<Moment>(habit?.moment ?? 'morning')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const errors = {
    name: name.trim() ? null : 'Ponle un nombre al hábito.',
    trama: tramaId || newTrama.trim() ? null : 'Escribe el nombre de la trama.',
    days: mode !== 'days' || days.length ? null : 'Elige al menos un día.',
  }
  const valid = !errors.name && !errors.trama && !errors.days
  const max = mode === 'week' ? 6 : 15

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSubmit({
        name,
        tramaId,
        newTramaName: newTrama,
        moment,
        rhythm: mode === 'days'
          ? { kind: 'days', days: [...days].sort((a, b) => a - b) }
          : { kind: 'quota', period: mode, times: times[mode] },
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  const step = (n: number) => mode !== 'days' && setTimes((t) => ({ ...t, [mode]: Math.min(max, Math.max(1, t[mode] + n)) }))

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="h-name">¿Qué vas a hacer?</label>
        <input id="h-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Lavarme los dientes" maxLength={60} autoComplete="off" enterKeyHint="done"
          aria-invalid={tried && !!errors.name} />
        {tried && errors.name && <p className="err" role="alert">{errors.name}</p>}
      </div>

      <div className="field">
        <span className="lbl" id="l-trama">¿A qué trama suma?</span>
        {tramas.length > 0 && (
          <div className="chips" role="group" aria-labelledby="l-trama" style={{ marginBottom: tramaId ? 0 : 8 }}>
            {tramas.map((t) => (
              <button type="button" key={t.id} className="chip" data-color={t.color} aria-pressed={tramaId === t.id}
                onClick={() => setTramaId(t.id)}>{t.name}</button>
            ))}
            <button type="button" className="chip plain" aria-pressed={tramaId === null} onClick={() => setTramaId(null)}>+ Nueva</button>
          </div>
        )}
        {tramaId === null && (
          <>
            <input className="input" value={newTrama} onChange={(e) => setNewTrama(e.target.value)} placeholder="Cuidar mi cuerpo"
              maxLength={40} autoComplete="off" aria-label="Nombre de la nueva trama" aria-invalid={tried && !!errors.trama} />
            {tried && errors.trama
              ? <p className="err" role="alert">{errors.trama}</p>
              : <p className="help">Una trama es quien quieres ser. Cada hábito cumplido es un voto por ella.</p>}
          </>
        )}
      </div>

      <div className="field">
        <span className="lbl" id="l-ritmo">¿Cada cuánto?</span>
        <div className="segm" role="group" aria-labelledby="l-ritmo">
          {MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {mode === m.id && <motion.i layoutId="ritmo" className="thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        {mode === 'days' ? (
          <>
            <div className="days" role="group" aria-label="Días de la semana">
              {DAY_LETTERS.map((l, d) => (
                <button type="button" key={d} aria-pressed={days.includes(d)} aria-label={DAY_NAMES[d]} onClick={() => toggleDay(d)}>{l}</button>
              ))}
            </div>
            {tried && errors.days
              ? <p className="err" role="alert">{errors.days}</p>
              : <p className="help">{days.length === 7 ? 'Todos los días.' : 'Solo aparece en los días que elijas.'}</p>}
          </>
        ) : (
          <>
            <div className="stepper">
              <button type="button" onClick={() => step(-1)} disabled={times[mode] <= 1} aria-label="Una vez menos">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
              </button>
              <output aria-live="polite">
                <b>{times[mode]}</b>{times[mode] === 1 ? 'vez' : 'veces'} {mode === 'week' ? 'por semana' : 'por mes'}
              </output>
              <button type="button" onClick={() => step(1)} disabled={times[mode] >= max} aria-label="Una vez más">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            <p className="help">El día que sea. Si puedes fijar los días, suele funcionar mejor: decide de antemano cuándo.</p>
          </>
        )}
      </div>

      {mode === 'days' && (
        <div className="field">
          <span className="lbl" id="l-momento">¿En qué momento?</span>
          <div className="chips" role="group" aria-labelledby="l-momento">
            {MOMENTS.map((m) => (
              <button type="button" key={m.id} className="chip plain" aria-pressed={moment === m.id} onClick={() => setMoment(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="sheet-actions">
        <button className="btn block" type="submit" disabled={busy}>{habit ? 'Guardar cambios' : 'Crear hábito'}</button>
        {onDelete && (
          <button className="btn block ghost" type="button" disabled={busy}
            onClick={() => (confirming ? onDelete() : setConfirming(true))}>
            {confirming ? 'Sí, eliminar el hábito y sus votos' : 'Eliminar hábito'}
          </button>
        )}
      </div>
    </form>
  )
}
