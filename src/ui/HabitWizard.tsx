import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { HabitDraft } from '../db/db'
import { dependsOn } from '../domain/tramas'
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
const STEPS = 4

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

interface Props {
  tramas: Trama[]
  habits: Habit[]
  habit?: Habit
  onSubmit: (draft: HabitDraft) => Promise<void>
}

/** Asistente de 4 pasos: quién quieres ser, qué harás, cada cuánto y después de qué. */
export function HabitWizard({ tramas, habits, habit, onSubmit }: Props) {
  const r = habit?.rhythm
  const [step, setStep] = useState(habit ? 1 : 0)
  const [tramaId, setTramaId] = useState<string | null>(habit?.tramaId ?? tramas[0]?.id ?? null)
  const [newTrama, setNewTrama] = useState('')
  const [identity, setIdentity] = useState('')
  const [name, setName] = useState(habit?.name ?? '')
  const [minVersion, setMinVersion] = useState(habit?.minVersion ?? '')
  const [mode, setMode] = useState<Mode>(r?.kind === 'quota' ? r.period : 'days')
  const [days, setDays] = useState<number[]>(r?.kind === 'days' ? r.days : ALL_DAYS)
  const [times, setTimes] = useState<Record<Period, number>>({
    week: r?.kind === 'quota' && r.period === 'week' ? r.times : 2,
    month: r?.kind === 'quota' && r.period === 'month' ? r.times : 1,
  })
  const [moment, setMoment] = useState<Moment>(habit?.moment ?? 'morning')
  const [cue, setCue] = useState(habit?.cue ?? '')
  const [anchorId, setAnchorId] = useState<string | null>(habit?.anchorId ?? null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  // Anclas posibles: hábitos de días fijos que no dependan de este (para no crear ciclos).
  const anchors = useMemo(() => {
    const byId = new Map(habits.map((h) => [h.id, h]))
    return habits.filter((h) => !h.archived && h.rhythm.kind === 'days' && !(habit && dependsOn(h, habit.id, byId)))
  }, [habits, habit])
  const anchor = mode === 'days' ? anchors.find((h) => h.id === anchorId) : undefined

  const errors = [
    tramaId || newTrama.trim() ? null : 'Escribe el nombre de la trama.',
    name.trim() ? null : 'Ponle un nombre al hábito.',
    mode !== 'days' || days.length ? null : 'Elige al menos un día.',
    null,
  ]
  const error = tried ? errors[step] : null
  const max = mode === 'week' ? 6 : 15
  const last = step === STEPS - 1
  const cueText = anchor ? lowerFirst(anchor.name) : cue.trim()

  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (errors[step]) return setTried(true)
    setTried(false)
    if (!last) return setStep(step + 1)
    if (busy) return
    setBusy(true)
    try {
      await onSubmit({
        name,
        tramaId,
        newTramaName: newTrama,
        newTramaIdentity: identity,
        moment,
        minVersion,
        cue,
        anchorId: anchor?.id ?? null,
        rhythm: mode === 'days'
          ? { kind: 'days', days: [...days].sort((a, b) => a - b) }
          : { kind: 'quota', period: mode, times: times[mode] },
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  const bump = (n: number) => mode !== 'days' && setTimes((t) => ({ ...t, [mode]: Math.min(max, Math.max(1, t[mode] + n)) }))

  return (
    <form className="wiz" onSubmit={next} noValidate>
      <div className="wiz-top">
        <span className="mono">Paso {step + 1} de {STEPS}</span>
        <div className="seg" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'f' : undefined} />)}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.16 }}>
          {step === 0 && (
            <>
              <h2>¿Quién <em>quieres ser?</em></h2>
              <p className="lead">Un hábito dura cuando es parte de quién eres. Elige la trama a la que suma este.</p>
              <div className="field">
                {tramas.length > 0 && (
                  <div className="chips" role="group" aria-label="Trama" style={{ marginBottom: tramaId ? 0 : 8 }}>
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
                      maxLength={40} autoComplete="off" aria-label="Nombre de la nueva trama" aria-invalid={!!error} />
                    {error && <p className="err" role="alert">{error}</p>}
                    <div className="prefix" style={{ marginTop: 8 }}>
                      <span>Soy alguien que</span>
                      <input className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="no falta a entrenar"
                        maxLength={60} autoComplete="off" aria-label="Soy alguien que…" />
                    </div>
                    <p className="help">La frase es opcional. Cada hábito cumplido será un voto por ella.</p>
                  </>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>¿Qué vas <em>a hacer?</em></h2>
              <div className="field">
                <label htmlFor="h-name">El hábito</label>
                <input id="h-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Ir a boxeo" maxLength={60} autoComplete="off" aria-invalid={!!error} />
                {error && <p className="err" role="alert">{error}</p>}
              </div>
              <div className="field">
                <label htmlFor="h-min">Su versión de 2 minutos</label>
                <input id="h-min" className="input" value={minVersion} onChange={(e) => setMinVersion(e.target.value)}
                  placeholder="Ponerme la ropa de entrenar" maxLength={60} autoComplete="off" />
                <p className="help">Para los días malos. Presentarte cuenta igual que hacerlo completo: mantiene la racha y suma un voto.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>¿Cada <em>cuánto?</em></h2>
              <div className="field">
                <div className="segm" role="group" aria-label="Ritmo">
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
                    {error
                      ? <p className="err" role="alert">{error}</p>
                      : <p className="help">{days.length === 7 ? 'Todos los días.' : 'Solo aparece en los días que elijas.'}</p>}
                  </>
                ) : (
                  <>
                    <div className="stepper">
                      <button type="button" onClick={() => bump(-1)} disabled={times[mode] <= 1} aria-label="Una vez menos">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
                      </button>
                      <output aria-live="polite">
                        <b>{times[mode]}</b>{times[mode] === 1 ? 'vez' : 'veces'} {mode === 'week' ? 'por semana' : 'por mes'}
                      </output>
                      <button type="button" onClick={() => bump(1)} disabled={times[mode] >= max} aria-label="Una vez más">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </button>
                    </div>
                    <p className="help">El día que sea. Si puedes fijar los días, suele funcionar mejor: decide de antemano cuándo.</p>
                  </>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>¿Después <em>de qué?</em></h2>
              <p className="lead">Un hábito nuevo se sostiene mejor pegado a algo que ya haces. Es opcional.</p>
              {mode === 'days' && anchors.length > 0 && (
                <div className="field">
                  <span className="lbl" id="l-ancla">Después de otro hábito</span>
                  <div className="chips" role="group" aria-labelledby="l-ancla">
                    {anchors.map((h) => (
                      <button type="button" key={h.id} className="chip plain" aria-pressed={anchorId === h.id}
                        onClick={() => { setAnchorId(anchorId === h.id ? null : h.id); setCue('') }}>{h.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {!anchor && (
                <div className="field">
                  <label htmlFor="h-cue">{mode === 'days' && anchors.length > 0 ? 'O después de otra cosa' : 'Después de'}</label>
                  <div className="prefix">
                    <span>Después de</span>
                    <input id="h-cue" className="input" value={cue} onChange={(e) => setCue(e.target.value)} placeholder="desayunar"
                      maxLength={50} autoComplete="off" />
                  </div>
                </div>
              )}
              {mode === 'days' && !anchor && (
                <div className="field">
                  <span className="lbl" id="l-momento">Momento del día</span>
                  <div className="chips" role="group" aria-labelledby="l-momento">
                    {MOMENTS.map((m) => (
                      <button type="button" key={m.id} className="chip plain" aria-pressed={moment === m.id} onClick={() => setMoment(m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>
              )}
              {cueText && (
                <p className="preview"><small>Tu plan</small>Después de {cueText}, voy a {lowerFirst(name.trim())}.</p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="wiz-nav">
        {step > 0 && <button type="button" className="btn quiet" onClick={() => { setTried(false); setStep(step - 1) }}>Atrás</button>}
        <button className="btn" type="submit" disabled={busy}>{!last ? 'Siguiente' : habit ? 'Guardar cambios' : 'Crear hábito'}</button>
      </div>
    </form>
  )
}
