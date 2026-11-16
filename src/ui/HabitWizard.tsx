import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { HabitDraft } from '../db/db'
import { todayISO } from '../day'
import { diffDays, formatShort } from '../domain/dates'
import { buildPlan, limitOn } from '../domain/reduce'
import { isMulti, slotsOf } from '../domain/today'
import { dependsOn } from '../domain/tramas'
import type { Habit, Moment, Period, Trama } from '../domain/types'
import { lowerFirst } from './habitText'

type Mode = 'days' | 'week' | 'month'
const MODES: { id: Mode; label: string }[] = [
  { id: 'days', label: 'Días fijos' },
  { id: 'week', label: 'Por semana' },
  { id: 'month', label: 'Por mes' },
]
const MOMENTS: { id: Moment; label: string; hint: string }[] = [
  { id: 'morning', label: 'Mañana', hint: 'desayunar' },
  { id: 'afternoon', label: 'Tarde', hint: 'almorzar' },
  { id: 'night', label: 'Noche', hint: 'cenar' },
]
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const STEPS = 4
const SPRING = { type: 'spring', stiffness: 500, damping: 36 } as const

function Stepper({ value, min, max, onChange, children }: {
  value: number; min: number; max: number; onChange: (v: number) => void; children: React.ReactNode
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Menos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <output aria-live="polite"><b>{value}</b>{children}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Más">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}

/** Hora de aviso: apagada muestra un botón claro; encendida, la hora y cómo quitarla. */
function TimeField({ value, onChange, label, fallback }: { value: string; onChange: (v: string) => void; label: string; fallback: string }) {
  if (!value) {
    return <button type="button" className="chip plain add-time" onClick={() => onChange(fallback)} aria-label={`${label}: sin recordatorio. Poner hora.`}>Sin recordatorio · Poner hora</button>
  }
  return (
    <div className="timerow">
      <input type="time" className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <button type="button" className="btn quiet" onClick={() => onChange('')}>Quitar</button>
    </div>
  )
}

type SlotState = Record<Moment, { on: boolean; cue: string; remindAt: string }>
const DEFAULT_TIME: Record<Moment, string> = { morning: '08:00', afternoon: '14:00', night: '21:30' }

interface Props {
  tramas: Trama[]
  habits: Habit[]
  habit?: Habit
  onSubmit: (draft: HabitDraft) => Promise<void>
}

/** Asistente de 4 pasos: quién quieres ser, qué harás, cada cuánto y después de qué. */
export function HabitWizard({ tramas, habits, habit, onSubmit }: Props) {
  const r = habit?.rhythm
  const today = todayISO()
  const [step, setStep] = useState(habit ? 1 : 0)
  const [tramaId, setTramaId] = useState<string | null>(habit?.tramaId ?? tramas[0]?.id ?? null)
  const [tramaId2, setTramaId2] = useState<string | null>(habit?.tramaId2 ?? null)
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
  const [slots, setSlots] = useState<SlotState>(() => {
    const init: SlotState = { morning: { on: false, cue: '', remindAt: '' }, afternoon: { on: false, cue: '', remindAt: '' }, night: { on: false, cue: '', remindAt: '' } }
    const from = habit && habit.kind !== 'reduce' && habit.rhythm.kind === 'days' ? slotsOf(habit) : [{ moment: 'morning' as Moment }]
    for (const s of from) init[s.moment] = { on: true, cue: s.cue ?? '', remindAt: s.remindAt ?? '' }
    return init
  })
  // Para hábitos con meta semanal o mensual, que no tienen momento del día.
  const [cue, setCue] = useState(habit?.rhythm.kind === 'quota' ? habit.cue ?? '' : '')
  const [remindAt, setRemindAt] = useState(habit?.rhythm.kind === 'quota' ? habit.remindAt ?? '' : '')
  const [anchorId, setAnchorId] = useState<string | null>(habit?.anchorId ?? null)
  const [reward, setReward] = useState(habit?.reward ?? '')
  // Lo que se quiere dejar: plan de reducción hasta cero, o de golpe.
  const [kind, setKind] = useState<'build' | 'reduce'>(habit?.kind ?? 'build')
  const reduce = kind === 'reduce'
  const [cold, setCold] = useState(!!habit?.plan && habit.plan.stages.length === 0)
  const [startLimit, setStartLimit] = useState(() => (habit?.plan ? Math.max(1, limitOn(habit.plan, today)) : 10))
  const [weeks, setWeeks] = useState(() => (habit?.plan ? Math.max(1, Math.ceil(diffDays(today, habit.plan.quitDate) / 7)) : 6))
  const [planTouched, setPlanTouched] = useState(!habit?.plan)
  const [urgePlan, setUrgePlan] = useState(habit?.urgePlan ?? '')
  const plan = useMemo(() => buildPlan(startLimit, cold ? 0 : weeks, today), [startLimit, weeks, cold, today])
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  // Anclas posibles: hábitos de días fijos, una vez al día, que no dependan de este (para no crear ciclos).
  const anchors = useMemo(() => {
    const byId = new Map(habits.map((h) => [h.id, h]))
    return habits.filter((h) => !h.archived && h.kind !== 'reduce' && h.rhythm.kind === 'days' && !(habit && dependsOn(h, habit.id, byId)))
  }, [habits, habit])
  const picked = MOMENTS.filter((m) => slots[m.id].on)
  const multi = mode === 'days' && picked.length > 1
  const anchor = mode === 'days' && !multi ? anchors.find((h) => h.id === anchorId) : undefined
  const others = tramas.filter((t) => t.id !== tramaId)

  const errors = [
    tramaId || newTrama.trim() ? null : 'Escribe el nombre de la trama.',
    name.trim() ? null : 'Ponle un nombre al hábito.',
    reduce || mode !== 'days' || days.length ? null : 'Elige al menos un día.',
    reduce || mode !== 'days' || anchor || picked.length ? null : 'Elige al menos un momento del día.',
  ]
  const error = tried ? errors[step] : null
  const max = mode === 'week' ? 6 : 15
  const last = step === STEPS - 1
  const first = picked[0]
  const cueText = reduce ? '' : anchor ? lowerFirst(anchor.name) : mode === 'days' ? (multi ? '' : slots[first?.id ?? 'morning'].cue.trim()) : cue.trim()

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
        tramaId2: tramaId2 && tramaId2 !== tramaId ? tramaId2 : null,
        newTramaName: newTrama,
        newTramaIdentity: identity,
        moment: anchor?.moment ?? first?.id ?? 'morning',
        minVersion,
        cue,
        remindAt,
        slots: mode === 'days' ? picked.map((m) => ({ moment: m.id, cue: slots[m.id].cue, remindAt: slots[m.id].remindAt })) : [],
        reward,
        anchorId: anchor?.id ?? null,
        kind,
        plan: reduce && planTouched ? plan : null,
        urgePlan,
        rhythm: mode === 'days'
          ? { kind: 'days', days: [...days].sort((a, b) => a - b) }
          : { kind: 'quota', period: mode, times: times[mode] },
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
  const setSlot = (m: Moment, patch: Partial<SlotState[Moment]>) => setSlots((s) => ({ ...s, [m]: { ...s[m], ...patch } }))
  const touchPlan = () => setPlanTouched(true)

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
                        onClick={() => { setTramaId(t.id); if (tramaId2 === t.id) setTramaId2(null) }}>{t.name}</button>
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
              {others.length > 0 && (
                <div className="field">
                  <span className="lbl" id="l-trama2">También suma a (opcional)</span>
                  <div className="chips" role="group" aria-labelledby="l-trama2">
                    {others.map((t) => (
                      <button type="button" key={t.id} className="chip" data-color={t.color} aria-pressed={tramaId2 === t.id}
                        onClick={() => setTramaId2(tramaId2 === t.id ? null : t.id)}>{t.name}</button>
                    ))}
                  </div>
                  <p className="help">Si el hábito es prueba de dos identidades, cada voto cuenta en las dos tramas.</p>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2>{reduce ? <>¿Qué quieres <em>dejar?</em></> : <>¿Qué vas <em>a hacer?</em></>}</h2>
              {!habit && (
                <div className="field">
                  <div className="segm" role="group" aria-label="Tipo de hábito">
                    {([['build', 'Construir'], ['reduce', 'Dejar']] as const).map(([id, label]) => (
                      <button type="button" key={id} aria-pressed={kind === id} onClick={() => setKind(id)}>
                        {kind === id && <motion.i layoutId="tipo" className="thumb" transition={SPRING} />}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                <label htmlFor="h-name">{reduce ? 'Lo que vas a dejar' : 'El hábito'}</label>
                <input id="h-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={reduce ? 'Tabaco' : 'Ir a boxeo'} maxLength={60} autoComplete="off" aria-invalid={!!error} />
                {error && <p className="err" role="alert">{error}</p>}
                {reduce && <p className="help">Cada día dentro del tope y cada antojo resistido suman un voto. El nombre lo eliges tú: puede ser discreto.</p>}
              </div>
              {!reduce && (
                <div className="field">
                  <label htmlFor="h-min">Su versión de 2 minutos</label>
                  <input id="h-min" className="input" value={minVersion} onChange={(e) => setMinVersion(e.target.value)}
                    placeholder="Ponerme la ropa de entrenar" maxLength={60} autoComplete="off" />
                  <p className="help">Para los días malos. Presentarte cuenta igual que hacerlo completo: mantiene la racha y suma un voto.</p>
                </div>
              )}
            </>
          )}

          {step === 2 && reduce && (
            <>
              <h2>¿Cómo lo vas <em>a dejar?</em></h2>
              <div className="field">
                <div className="segm" role="group" aria-label="Forma de dejarlo">
                  {([[false, 'Poco a poco'], [true, 'De golpe']] as const).map(([id, label]) => (
                    <button type="button" key={label} aria-pressed={cold === id} onClick={() => { setCold(id); touchPlan() }}>
                      {cold === id && <motion.i layoutId="forma" className="thumb" transition={SPRING} />}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {cold ? (
                <p className="preview"><small>Desde hoy</small>El tope es cero. Cada día en cero es un voto, y cada antojo resistido también.</p>
              ) : (
                <>
                  <div className="field">
                    <span className="lbl">Hoy, en un día normal</span>
                    <Stepper value={startLimit} min={1} max={60} onChange={(v) => { setStartLimit(v); touchPlan() }}>al día</Stepper>
                  </div>
                  <div className="field">
                    <span className="lbl">Quiero llegar a cero en</span>
                    <Stepper value={weeks} min={1} max={26} onChange={(v) => { setWeeks(v); touchPlan() }}>{weeks === 1 ? 'semana' : 'semanas'}</Stepper>
                  </div>
                  {planTouched ? (
                    <ol className="plan">
                      {plan.stages.map((s) => <li key={s.from}><span>Desde el {formatShort(s.from)}</span><b>hasta {s.limit} al día</b></li>)}
                      <li className="zero"><span>Desde el {formatShort(plan.quitDate)}</span><b>cero</b></li>
                    </ol>
                  ) : (
                    <p className="help">Tu plan actual sigue igual. Cambia un número para rehacerlo desde hoy; los días ya pasados no cambian.</p>
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && !reduce && (
            <>
              <h2>¿Cada <em>cuánto?</em></h2>
              <div className="field">
                <div className="segm" role="group" aria-label="Ritmo">
                  {MODES.map((m) => (
                    <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                      {mode === m.id && <motion.i layoutId="ritmo" className="thumb" transition={SPRING} />}
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
                      : <p className="help">{days.length === 7 ? 'Todos los días.' : 'Solo aparece en los días que elijas.'} Si es varias veces al día, lo eliges en el paso siguiente.</p>}
                  </>
                ) : (
                  <>
                    <Stepper value={times[mode]} min={1} max={max} onChange={(v) => setTimes((t) => ({ ...t, [mode]: v }))}>
                      {times[mode] === 1 ? 'vez' : 'veces'} {mode === 'week' ? 'por semana' : 'por mes'}
                    </Stepper>
                    <p className="help">El día que sea. Si puedes fijar los días, suele funcionar mejor: decide de antemano cuándo.</p>
                  </>
                )}
                {habit && <p className="help">Si cambias el ritmo, rige desde hoy. Lo que ya hiciste no se reinterpreta.</p>}
              </div>
            </>
          )}

          {step === 3 && reduce && (
            <>
              <h2>¿Y cuando venga <em>el antojo?</em></h2>
              <p className="lead">Decidir ahora qué vas a hacer lo vuelve más fácil en el momento. Es opcional.</p>
              <div className="field">
                <label htmlFor="h-urge">Cuando venga el antojo</label>
                <div className="prefix">
                  <span>Voy a</span>
                  <input id="h-urge" className="input" value={urgePlan} onChange={(e) => setUrgePlan(e.target.value)}
                    placeholder="tomar agua y esperar 5 minutos" maxLength={60} autoComplete="off" />
                </div>
              </div>
            </>
          )}

          {step === 3 && !reduce && (
            <>
              <h2>¿Cuándo <em>y después de qué?</em></h2>
              {mode === 'days' && (
                <div className="field">
                  <span className="lbl" id="l-momento">¿En qué momento? Puedes elegir más de uno</span>
                  <div className="chips" role="group" aria-labelledby="l-momento">
                    {MOMENTS.map((m) => (
                      <button type="button" key={m.id} className="chip plain" aria-pressed={!anchor && slots[m.id].on}
                        onClick={() => { setAnchorId(null); setSlot(m.id, { on: anchor ? true : !slots[m.id].on }) }}>{m.label}</button>
                    ))}
                  </div>
                  {error && <p className="err" role="alert">{error}</p>}
                  {multi && <p className="help">Aparecerá {picked.length} veces al día. Cada vez suma un voto; con una ya cuenta el día para la racha.</p>}
                </div>
              )}

              {mode === 'days' && !multi && anchors.length > 0 && (
                <div className="field">
                  <span className="lbl" id="l-ancla">O justo después de otro hábito</span>
                  <div className="chips" role="group" aria-labelledby="l-ancla">
                    {anchors.filter((h) => !isMulti(h)).map((h) => (
                      <button type="button" key={h.id} className="chip plain" aria-pressed={anchorId === h.id}
                        onClick={() => setAnchorId(anchorId === h.id ? null : h.id)}>{h.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'days' && !anchor && picked.map((m) => (
                <div className="field slot" key={m.id}>
                  <label htmlFor={`h-cue-${m.id}`}>{multi ? `${m.label}: después de qué` : 'Después de qué (opcional)'}</label>
                  <div className="prefix">
                    <span>Después de</span>
                    <input id={`h-cue-${m.id}`} className="input" value={slots[m.id].cue} onChange={(e) => setSlot(m.id, { cue: e.target.value })}
                      placeholder={m.hint} maxLength={50} autoComplete="off" />
                  </div>
                  <TimeField value={slots[m.id].remindAt} onChange={(v) => setSlot(m.id, { remindAt: v })} fallback={DEFAULT_TIME[m.id]}
                    label={multi ? `Recordatorio de la ${m.label.toLowerCase()}` : 'Recordatorio'} />
                </div>
              ))}

              {mode === 'days' && anchor && (
                <div className="field">
                  <span className="lbl">Recordatorio</span>
                  <TimeField value={slots[anchor.moment].remindAt} onChange={(v) => setSlot(anchor.moment, { on: true, remindAt: v })}
                    fallback={DEFAULT_TIME[anchor.moment]} label="Recordatorio" />
                </div>
              )}

              {mode !== 'days' && (
                <>
                  <div className="field">
                    <label htmlFor="h-cue">Después de qué (opcional)</label>
                    <div className="prefix">
                      <span>Después de</span>
                      <input id="h-cue" className="input" value={cue} onChange={(e) => setCue(e.target.value)} placeholder="salir del trabajo"
                        maxLength={50} autoComplete="off" />
                    </div>
                  </div>
                  <div className="field">
                    <span className="lbl">Recordatorio</span>
                    <TimeField value={remindAt} onChange={setRemindAt} fallback="18:00" label="Recordatorio" />
                    <p className="help">Solo avisa cuando los días que quedan empiezan a apretar, no todos los días.</p>
                  </div>
                </>
              )}

              <div className="field">
                <label htmlFor="h-reward">Y después, una recompensa (opcional)</label>
                <div className="prefix">
                  <span>Me doy</span>
                  <input id="h-reward" className="input" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="un café tranquilo"
                    maxLength={50} autoComplete="off" />
                </div>
              </div>

              {(cueText || reward.trim()) && name.trim() && (
                <p className="preview">
                  <small>Tu plan</small>
                  {cueText ? `Después de ${cueText}, voy a ${lowerFirst(name.trim())}` : `Voy a ${lowerFirst(name.trim())}`}
                  {reward.trim() ? `, y después me doy ${lowerFirst(reward.trim())}.` : '.'}
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="wiz-nav">
        {step > 0 && <button type="button" className="btn quiet" onClick={() => { setTried(false); setStep(step - 1) }}>Atrás</button>}
        <button className="btn" type="submit" disabled={busy}>{!last ? 'Siguiente' : habit ? 'Guardar cambios' : reduce ? 'Crear plan' : 'Crear hábito'}</button>
      </div>
    </form>
  )
}
