import { useMemo, useState } from 'react'
import { setDayUses, toggleLog } from '../db/db'
import type { Data } from '../db/hooks'
import { addMonths, formatMonth, formatShort, fromISO, startOfMonth, weekdayMon, type ISODate } from '../domain/dates'
import { isPaused } from '../domain/pauses'
import { bestStreak, habitRate, monthGrid } from '../domain/progress'
import { reduceDays, reduceState } from '../domain/reduce'
import { computeStreak, rhythmStart } from '../domain/streaks'
import { isMulti } from '../domain/today'
import { rhythmText } from '../domain/tramas'
import type { Habit } from '../domain/types'

const UNIT = { days: ['día', 'días'], weeks: ['semana', 'semanas'], months: ['mes', 'meses'] } as const
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface Props {
  habit: Habit
  data: Data
  today: ISODate
  onError: (msg: string) => void
}

/** Historial de un hábito: rachas, constancia y calendario. En el calendario se corrigen días pasados. */
export function HabitDetail({ habit, data, today, onError }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [picked, setPicked] = useState<ISODate | null>(null)
  const trama = data.tramas.find((t) => t.id === habit.tramaId)
  const trama2 = data.tramas.find((t) => t.id === habit.tramaId2)
  const reduce = habit.kind === 'reduce'
  const multi = isMulti(habit)
  const logs = useMemo(() => new Map(data.logs.filter((l) => l.habitId === habit.id).map((l) => [l.date, l])), [data.logs, habit.id])
  const done = useMemo(() => new Set(logs.keys()), [logs])
  const rd = useMemo(() => reduceDays(habit, data.uses, data.urges, data.closures, data.pauses), [habit, data])
  const fail = () => onError('No se pudo guardar. Inténtalo de nuevo.')

  const tiles = useMemo(() => {
    if (reduce) {
      const s = reduceState(habit, data.uses, data.urges, today, data.closures, data.pauses)
      return [[s.streak, `${UNIT.days[s.streak === 1 ? 0 : 1]} de racha`], [s.okDays.length, s.cold ? 'días en cero' : 'días dentro del tope'], [s.resistedTotal, 'antojos resistidos']] as const
    }
    const streak = computeStreak(habit, done, today, data.pauses)
    const u = UNIT[streak.unit]
    const best = bestStreak(habit, done, today, data.pauses)
    return [
      [streak.current, `${u[streak.current === 1 ? 0 : 1]} de racha`],
      [best, `${u[best === 1 ? 0 : 1]}, tu mejor racha`],
      [`${Math.round(habitRate(habit, done, today, 30, data.pauses).ratio * 100)}%`, 'en los últimos 30 días'],
    ] as const
  }, [reduce, habit, data, done, today])

  const start = rhythmStart(habit)
  const cellClass = (d: ISODate): string => {
    if (d > today) return 'future'
    if (d < habit.createdOn) return 'before'
    if (reduce) {
      const st = rd.status(d)
      return d === today ? 'pending' : st === 'ok' ? 'done' : st === 'over' ? 'over' : st === 'skip' ? 'off' : 'missed'
    }
    const log = logs.get(d)
    if (log) return log.state === 'min' || (multi && (log.slots?.length ?? 0) < habit.slots!.length) ? 'done min' : 'done'
    if (isPaused(data.pauses, d) || d < start) return 'off'
    if (habit.rhythm.kind === 'days' && !habit.rhythm.days.includes(weekdayMon(d))) return 'off'
    return d === today ? 'pending' : habit.rhythm.kind === 'days' ? 'missed' : 'off'
  }
  const LABEL: Record<string, string> = { done: reduce ? 'dentro del tope' : 'hecho', 'done min': 'hecho en parte', over: 'sobre el tope', missed: reduce ? 'sin registro' : 'fallado' }
  const pickedUsed = picked ? rd.used(picked) : 0

  return (
    <div data-color={trama?.color ?? 'teal'}>
      <h2>{habit.name}</h2>
      <p className="menu-sub">{[trama?.name, trama2?.name, reduce ? 'Plan de reducción' : rhythmText(habit.rhythm), multi ? `${habit.slots!.length} veces al día` : ''].filter(Boolean).join(' · ')}</p>

      <div className="tiles">
        {tiles.map(([n, label]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}
      </div>

      <div className="cal-head">
        <button className="icon-btn sm" aria-label="Mes anterior" onClick={() => { setMonth(addMonths(month, -1)); setPicked(null) }} disabled={month <= startOfMonth(habit.createdOn)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <b aria-live="polite">{formatMonth(month)}</b>
        <button className="icon-btn sm" aria-label="Mes siguiente" onClick={() => { setMonth(addMonths(month, 1)); setPicked(null) }} disabled={month >= startOfMonth(today)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="cal" role="grid" aria-label={formatMonth(month)}>
        {DAY_LETTERS.map((l, i) => <span key={i} className="wd" aria-hidden="true">{l}</span>)}
        {monthGrid(month).map((d, i) => {
          if (!d) return <span key={i} />
          const cls = cellClass(d)
          const n = fromISO(d).getDate()
          const inRange = d <= today && d >= habit.createdOn
          const label = `${n}: ${LABEL[cls] ?? 'sin marcar'}`
          const all = `${cls}${d === today ? ' today' : ''}${d === picked ? ' picked' : ''}`
          if (!inRange) return <span key={d} className={all} aria-label={label}>{n}</span>
          return reduce ? (
            <button key={d} className={all} aria-label={`${label}, ${rd.used(d)}`} aria-pressed={d === picked} onClick={() => setPicked(d === picked ? null : d)}>{rd.used(d)}</button>
          ) : (
            <button key={d} className={all} aria-label={label} aria-pressed={logs.has(d)} onClick={() => toggleLog(habit, d).catch(fail)}>{n}</button>
          )
        })}
      </div>

      {reduce && picked ? (
        <div className="day-edit">
          <span><b>{picked === today ? 'Hoy' : formatShort(picked)}</b><small>Tope: {rd.limit(picked)}</small></span>
          <div className="stepper">
            <button type="button" aria-label="Uno menos" disabled={pickedUsed <= 0} onClick={() => setDayUses(habit, picked, pickedUsed - 1).catch(fail)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
            <output aria-live="polite"><b>{pickedUsed}</b></output>
            <button type="button" aria-label="Uno más" onClick={() => setDayUses(habit, picked, pickedUsed + 1).catch(fail)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
          {rd.status(picked) === 'unknown' && picked !== today && (
            <button type="button" className="btn quiet" onClick={() => setDayUses(habit, picked, 0).catch(fail)}>Confirmar que fue cero</button>
          )}
        </div>
      ) : (
        <p className="help" style={{ textAlign: 'center' }}>
          {reduce ? 'Cada día muestra cuántos fueron. Toca uno para corregirlo. En gris, los días sin registro.' : 'Toca un día para corregirlo.'}
        </p>
      )}
    </div>
  )
}
