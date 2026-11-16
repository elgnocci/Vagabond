import { addDays, diffDays, startOfWeek, weekdayMon, type ISODate } from './dates'
import { isPaused } from './pauses'
import { collectVotes, reduceState, type ReduceState } from './reduce'
import { computeStreak, rhythmStart, type StreakInfo } from './streaks'
import type { Closure, Habit, Log, Moment, Pause, Slot, Trama, Urge, Use } from './types'

export type DotState = 'done' | 'missed' | 'off' | 'pending'
export type SectionId = Moment | 'week' | 'month'

/** Los momentos de un hábito: los de `slots` si tiene varios, o el único de `moment`. */
export function slotsOf(habit: Habit): Slot[] {
  return habit.slots && habit.slots.length > 1
    ? habit.slots
    : [{ moment: habit.slots?.[0]?.moment ?? habit.moment, cue: habit.slots?.[0]?.cue ?? habit.cue, remindAt: habit.slots?.[0]?.remindAt ?? habit.remindAt }]
}

export const isMulti = (habit: Habit) => !!habit.slots && habit.slots.length > 1

/** Momentos ya hechos en un registro. Un hábito de una vez al día tiene hecho su único momento. */
export function doneSlots(habit: Habit, log: Log | undefined): Moment[] {
  if (!log) return []
  return isMulti(habit) ? log.slots ?? [] : [slotsOf(habit)[0].moment]
}

export interface TodayItem {
  /** Único por tarjeta: el hábito, más el momento si tiene varios al día. */
  key: string
  habit: Habit
  trama?: Trama
  /** El momento de esta tarjeta, solo en hábitos de varias veces al día. */
  slot?: Moment
  /** Señal de esta tarjeta ("después de…"). */
  cue?: string
  /** En hábitos de varias veces al día: cuántas van hoy y cuántas son. */
  multi?: { done: number; total: number }
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

export interface ReduceItem {
  habit: Habit
  trama?: Trama
  state: ReduceState
}

export interface TodayView {
  sections: TodaySection[]
  /** Lo que se está dejando (tabaco). No entra en el avance del día. */
  reduce: ReduceItem[]
  /** Avance del día: cada momento que toca hoy, más los hábitos de meta marcados hoy. */
  done: number
  total: number
  allDone: boolean
  totalVotes: number
  /** Día 1 = el día en que se creó el primer hábito. */
  dayNumber: number | null
  hasHabits: boolean
  /** Hoy está en pausa: no se exige nada. */
  paused: boolean
}

export interface TodayExtra {
  closures?: Closure[]
  pauses?: Pause[]
}

const ORDER: SectionId[] = ['morning', 'afternoon', 'night', 'week', 'month']

export const habitOrder = (a: Habit, b: Habit) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)

export function buildToday(
  habits: Habit[], tramas: Trama[], logs: Log[], today: ISODate, uses: Use[] = [], urges: Urge[] = [],
  { closures = [], pauses = [] }: TodayExtra = {},
): TodayView {
  const tramaById = new Map(tramas.map((t) => [t.id, t]))
  const habitById = new Map(habits.map((h) => [h.id, h]))
  const doneByHabit = new Map<string, Set<ISODate>>()
  const todayLog = new Map<string, Log>()
  for (const l of logs) {
    let set = doneByHabit.get(l.habitId)
    if (!set) doneByHabit.set(l.habitId, (set = new Set()))
    set.add(l.date)
    if (l.date === today) todayLog.set(l.habitId, l)
  }

  const paused = isPaused(pauses, today)
  const active = habits.filter((h) => !h.archived).sort(habitOrder)
  const buckets = new Map<SectionId, TodayItem[]>()
  const reduce: ReduceItem[] = []
  let done = 0
  let total = 0
  const push = (section: SectionId, item: TodayItem) => {
    const list = buckets.get(section)
    if (list) list.push(item)
    else buckets.set(section, [item])
  }

  for (const habit of active) {
    const trama = tramaById.get(habit.tramaId)
    if (habit.kind === 'reduce') {
      reduce.push({ habit, trama, state: reduceState(habit, uses, urges, today, closures, pauses) })
      continue
    }
    const dates = doneByHabit.get(habit.id) ?? new Set<ISODate>()
    const log = todayLog.get(habit.id)
    const base = {
      habit,
      trama,
      linked: false,
      anchorName: habit.anchorId ? habitById.get(habit.anchorId)?.name : undefined,
      streak: computeStreak(habit, dates, today, pauses),
      dots: weekDots(habit, dates, today, pauses),
    }

    if (habit.rhythm.kind === 'quota') {
      const doneToday = !!log
      // En pausa, lo que tiene meta semanal o mensual solo aparece si ya se marcó hoy.
      if (paused && !doneToday) continue
      if (doneToday) {
        total++
        done++
      }
      push(habit.rhythm.period, { ...base, key: habit.id, cue: habit.cue, doneToday, minToday: log?.state === 'min' })
      continue
    }

    const scheduled = habit.rhythm.days.includes(weekdayMon(today)) && today >= rhythmStart(habit)
    if (!scheduled || (paused && !log)) continue
    const slots = slotsOf(habit)
    const made = doneSlots(habit, log)
    const multi = slots.length > 1 ? { done: made.length, total: slots.length } : undefined
    for (const slot of slots) {
      const doneToday = made.includes(slot.moment)
      total++
      if (doneToday) done++
      push(slot.moment, {
        ...base,
        key: multi ? `${habit.id}:${slot.moment}` : habit.id,
        slot: multi ? slot.moment : undefined,
        cue: slot.cue,
        multi,
        doneToday,
        minToday: doneToday && log?.state === 'min',
        // El aviso de "ayer faltaste" va solo en el primer momento pendiente, para no repetirlo.
        streak: multi && made.length > 0 ? { ...base.streak, atRisk: false } : base.streak,
      })
    }
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
    reduce,
    done,
    total,
    allDone: total > 0 && done === total,
    totalVotes: collectVotes(habits, logs, uses, urges, today, closures, pauses).length,
    dayNumber: first ? diffDays(first, today) + 1 : null,
    hasHabits: active.length > 0,
    paused,
  }
}

/** Pone cada hábito apilado justo después de su ancla, si el ancla también toca hoy en esta sección. */
function stackOrder(items: TodayItem[]): TodayItem[] {
  const firstOf = new Map<string, string>() // hábito → clave de su primera tarjeta en la sección
  for (const i of items) if (!firstOf.has(i.habit.id)) firstOf.set(i.habit.id, i.key)
  const children = new Map<string, TodayItem[]>()
  const roots: TodayItem[] = []
  for (const item of items) {
    const a = item.habit.anchorId
    const anchorKey = a && a !== item.habit.id ? firstOf.get(a) : undefined
    if (anchorKey) children.set(anchorKey, [...(children.get(anchorKey) ?? []), item])
    else roots.push(item)
  }
  const out: TodayItem[] = []
  const seen = new Set<string>()
  const visit = (item: TodayItem, linked: boolean) => {
    if (seen.has(item.key)) return
    seen.add(item.key)
    out.push(linked ? { ...item, linked: true } : item)
    for (const child of children.get(item.key) ?? []) visit(child, true)
  }
  roots.forEach((r) => visit(r, false))
  items.forEach((i) => visit(i, false)) // por si hubiera un ciclo en los datos
  return out
}

function weekDots(habit: Habit, dates: ReadonlySet<ISODate>, today: ISODate, pauses: readonly Pause[]): DotState[] {
  const out: DotState[] = []
  const start = rhythmStart(habit)
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    if (dates.has(d)) out.push('done')
    else if (d < habit.createdOn || d < start || isPaused(pauses, d)) out.push('off')
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
export function voteGrid(votes: { date: ISODate }[], today: ISODate, weeks = 5): GridCell[] {
  const counts = new Map<ISODate, number>()
  for (const l of votes) counts.set(l.date, (counts.get(l.date) ?? 0) + 1)
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

/** El momento del día según la hora del reloj. */
export function momentAt(hour: number): Moment {
  return hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'night'
}
