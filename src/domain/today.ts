import { addDays, diffDays, startOfWeek, weekdayMon, type ISODate } from './dates'
import { computeStreak, type StreakInfo } from './streaks'
import type { Habit, Log, Moment, Trama } from './types'

export type DotState = 'done' | 'missed' | 'off' | 'pending'
export type SectionId = Moment | 'week' | 'month'

export interface TodayItem {
  habit: Habit
  trama?: Trama
  doneToday: boolean
  /** Hoy se marcó la versión de 2 minutos. */
  minToday: boolean
  /** Va justo después de su hábito ancla en la lista de hoy. */
  linked: boolean
  anchorName?: string
  streak: StreakInfo
  /** Últimos 7 días, del más antiguo a hoy. */
  dots: DotState[]
}

export interface TodaySection {
  id: SectionId
  items: TodayItem[]
  done: number
  total: number
}

export interface TodayView {
  sections: TodaySection[]
  /** Avance del día: hábitos de días fijos que tocan hoy, más los de meta marcados hoy. */
  done: number
  total: number
  allDone: boolean
  totalVotes: number
  /** Día 1 = el día en que se creó el primer hábito. */
  dayNumber: number | null
  hasHabits: boolean
}

const ORDER: SectionId[] = ['morning', 'afternoon', 'night', 'week', 'month']

export function buildToday(habits: Habit[], tramas: Trama[], logs: Log[], today: ISODate): TodayView {
  const tramaById = new Map(tramas.map((t) => [t.id, t]))
  const habitById = new Map(habits.map((h) => [h.id, h]))
  const doneByHabit = new Map<string, Set<ISODate>>()
  const minToday = new Set<string>()
  for (const l of logs) {
    let set = doneByHabit.get(l.habitId)
    if (!set) doneByHabit.set(l.habitId, (set = new Set()))
    set.add(l.date)
    if (l.date === today && l.state === 'min') minToday.add(l.habitId)
  }

  const active = habits.filter((h) => !h.archived).sort((a, b) => a.createdAt - b.createdAt)
  const buckets = new Map<SectionId, TodayItem[]>()
  let done = 0
  let total = 0

  for (const habit of active) {
    const dates = doneByHabit.get(habit.id) ?? new Set<ISODate>()
    const doneToday = dates.has(today)
    const item: TodayItem = {
      habit,
      trama: tramaById.get(habit.tramaId),
      doneToday,
      minToday: minToday.has(habit.id),
      linked: false,
      anchorName: habit.anchorId ? habitById.get(habit.anchorId)?.name : undefined,
      streak: computeStreak(habit, dates, today),
      dots: weekDots(habit, dates, today),
    }
    let section: SectionId
    if (habit.rhythm.kind === 'days') {
      if (!habit.rhythm.days.includes(weekdayMon(today))) continue
      section = habit.moment
      total++
      if (doneToday) done++
    } else {
      section = habit.rhythm.period
      if (doneToday) {
        total++
        done++
      }
    }
    const list = buckets.get(section)
    if (list) list.push(item)
    else buckets.set(section, [item])
  }

  const sections = ORDER.filter((id) => buckets.has(id)).map((id) => {
    const isQuota = id === 'week' || id === 'month'
    const items = isQuota ? buckets.get(id)! : stackOrder(buckets.get(id)!)
    return {
      id,
      items,
      total: items.length,
      done: items.filter((i) => (isQuota ? i.streak.period?.met : i.doneToday)).length,
    }
  })

  const first = active.reduce<ISODate | null>((min, h) => (!min || h.createdOn < min ? h.createdOn : min), null)

  return {
    sections,
    done,
    total,
    allDone: total > 0 && done === total,
    totalVotes: logs.length,
    dayNumber: first ? diffDays(first, today) + 1 : null,
    hasHabits: active.length > 0,
  }
}

/** Pone cada hábito apilado justo después de su ancla, si el ancla también toca hoy en esta sección. */
function stackOrder(items: TodayItem[]): TodayItem[] {
  const ids = new Set(items.map((i) => i.habit.id))
  const children = new Map<string, TodayItem[]>()
  const roots: TodayItem[] = []
  for (const item of items) {
    const a = item.habit.anchorId
    if (a && a !== item.habit.id && ids.has(a)) children.set(a, [...(children.get(a) ?? []), item])
    else roots.push(item)
  }
  const out: TodayItem[] = []
  const seen = new Set<string>()
  const visit = (item: TodayItem, linked: boolean) => {
    if (seen.has(item.habit.id)) return
    seen.add(item.habit.id)
    out.push(linked ? { ...item, linked: true } : item)
    for (const child of children.get(item.habit.id) ?? []) visit(child, true)
  }
  roots.forEach((r) => visit(r, false))
  items.forEach((i) => visit(i, false)) // por si hubiera un ciclo en los datos
  return out
}

function weekDots(habit: Habit, dates: ReadonlySet<ISODate>, today: ISODate): DotState[] {
  const out: DotState[] = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    if (dates.has(d)) out.push('done')
    else if (d < habit.createdOn) out.push('off')
    else if (habit.rhythm.kind === 'quota') out.push(d === today ? 'pending' : 'off')
    else if (!habit.rhythm.days.includes(weekdayMon(d))) out.push('off')
    else out.push(d === today ? 'pending' : 'missed')
  }
  return out
}

export interface GridCell {
  date: ISODate
  /** 0 = sin votos … 3 = el máximo de la ventana. */
  level: 0 | 1 | 2 | 3
  isToday: boolean
  future: boolean
}

/** Matriz de votos: semanas completas de lunes a domingo, terminando en la semana actual. */
export function voteGrid(logs: Log[], today: ISODate, weeks = 5): GridCell[] {
  const counts = new Map<ISODate, number>()
  for (const l of logs) counts.set(l.date, (counts.get(l.date) ?? 0) + 1)
  const start = addDays(startOfWeek(today), -7 * (weeks - 1))
  const dates = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const max = Math.max(1, ...dates.map((d) => counts.get(d) ?? 0))
  return dates.map((date) => {
    const v = counts.get(date) ?? 0
    return {
      date,
      level: (v === 0 ? 0 : Math.max(1, Math.ceil((3 * v) / max))) as GridCell['level'],
      isToday: date === today,
      future: date > today,
    }
  })
}
