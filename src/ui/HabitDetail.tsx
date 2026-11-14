import { useMemo, useState } from 'react'
import { toggleLog } from '../db/db'
import type { useData } from '../db/hooks'
import { addMonths, formatMonth, fromISO, startOfMonth, weekdayMon, type ISODate } from '../domain/dates'
import { bestStreak, habitRate, monthGrid } from '../domain/progress'
import { limitOn, reduceState } from '../domain/reduce'
import { computeStreak } from '../domain/streaks'
import { rhythmText } from '../domain/tramas'
import type { Habit } from '../domain/types'

const UNIT = { days: ['día', 'días'], weeks: ['semana', 'semanas'], months: ['mes', 'meses'] } as const
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface Props {
  habit: Habit
  data: NonNullable<ReturnType<typeof useData>>
  today: ISODate
  onError: (msg: string) => void
}

/** Historial de un hábito: rachas, constancia y calendario. En el calendario se corrigen días pasados. */
export function HabitDetail({ habit, data, today, onError }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(today))
  const trama = data.tramas.find((t) => t.id === habit.tramaId)
  const reduce = habit.kind === 'reduce'
  const logs = useMemo(() => new Map(data.logs.filter((l) => l.habitId === habit.id).map((l) => [l.date, l.state])), [data.logs, habit.id])
  const done = useMemo(() => new Set(logs.keys()), [logs])
  const perDay = useMemo(() => {
    const m = new Map<ISODate, number>()
    for (const u of data.uses) if (u.habitId === habit.id) m.set(u.date, (m.get(u.date) ?? 0) + 1)
    return m
  }, [data.uses, habit.id])

  const tiles = useMemo(() => {
    if (reduce) {
      const s = reduceState(habit, data.uses, data.urges, today)
      return [[s.streak, `${UNIT.days[s.streak === 1 ? 0 : 1]} de racha`], [s.okDays.length, 'días dentro del tope'], [s.resistedTotal, 'antojos resistidos']] as const
    }
    const streak = computeStreak(habit, done, today)
    const u = UNIT[streak.unit]
    const best = bestStreak(habit, done, today)
    return [
      [streak.current, `${u[streak.current === 1 ? 0 : 1]} de racha`],
      [best, `${u[best === 1 ? 0 : 1]}, tu mejor racha`],
      [`${Math.round(habitRate(habit, done, today).ratio * 100)}%`, 'en los últimos 30 días'],
    ] as const
  }, [reduce, habit, data.uses, data.urges, done, today])

  const cellClass = (d: ISODate): string => {
    if (d > today) return 'future'
    if (d < habit.createdOn) return 'before'
    if (reduce) return d === today ? 'pending' : (perDay.get(d) ?? 0) <= (habit.plan ? limitOn(habit.plan, d) : 0) ? 'done' : 'over'
    if (logs.has(d)) return logs.get(d) === 'min' ? 'done min' : 'done'
    if (habit.rhythm.kind === 'days' && !habit.rhythm.days.includes(weekdayMon(d))) return 'off'
    return d === today ? 'pending' : habit.rhythm.kind === 'days' ? 'missed' : 'off'
  }

  return (
    <div data-color={trama?.color ?? 'teal'}>
      <h2>{habit.name}</h2>
      <p className="menu-sub">{[trama?.name, reduce ? 'Plan de reducción' : rhythmText(habit.rhythm)].filter(Boolean).join(' · ')}</p>

      <div className="tiles">
        {tiles.map(([n, label]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}
      </div>

      <div className="cal-head">
        <button className="icon-btn sm" aria-label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= startOfMonth(habit.createdOn)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <b aria-live="polite">{formatMonth(month)}</b>
        <button className="icon-btn sm" aria-label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= startOfMonth(today)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="cal" role="grid" aria-label={formatMonth(month)}>
        {DAY_LETTERS.map((l, i) => <span key={i} className="wd" aria-hidden="true">{l}</span>)}
        {monthGrid(month).map((d, i) => {
          if (!d) return <span key={i} />
          const cls = cellClass(d)
          const n = fromISO(d).getDate()
          const editable = !reduce && d <= today && d >= habit.createdOn
          const label = `${n}: ${cls.startsWith('done') ? (reduce ? 'dentro del tope' : 'hecho') : cls === 'over' ? 'sobre el tope' : cls === 'missed' ? 'fallado' : 'sin marcar'}`
          return editable ? (
            <button key={d} className={`${cls}${d === today ? ' today' : ''}`} aria-label={label} aria-pressed={logs.has(d)}
              onClick={() => toggleLog(habit.id, d).catch(() => onError('No se pudo guardar. Inténtalo de nuevo.'))}>{n}</button>
          ) : (
            <span key={d} className={`${cls}${d === today ? ' today' : ''}`} aria-label={label}>{reduce && d <= today && d >= habit.createdOn ? perDay.get(d) ?? 0 : n}</span>
          )
        })}
      </div>
      <p className="help" style={{ textAlign: 'center' }}>
        {reduce ? 'Cada día muestra cuántos fueron. En color, los días dentro del tope.' : 'Toca un día para corregirlo.'}
      </p>
    </div>
  )
}
