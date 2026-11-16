import Dexie, { type EntityTable, type Table } from 'dexie'
import { todayISO } from '../day'
import type { ISODate } from '../domain/dates'
import type { Backup, BackupData } from '../domain/backup'
import { collectVotes, freezeDays, limitOn } from '../domain/reduce'
import { computeStreak } from '../domain/streaks'
import { habitOrder, isMulti } from '../domain/today'
import {
  TRAMA_COLORS, type Closure, type Habit, type Log, type Meta, type Moment, type Pause, type ReducePlan, type ReminderSettings, type Rhythm,
  type Slot, type Trama, type Todo, type TramaColor, type Urge, type Use,
} from '../domain/types'

class VagabondDB extends Dexie {
  tramas!: EntityTable<Trama, 'id'>
  habits!: EntityTable<Habit, 'id'>
  logs!: Table<Log, [string, ISODate]>
  uses!: EntityTable<Use, 'id'>
  urges!: EntityTable<Urge, 'id'>
  todos!: EntityTable<Todo, 'id'>
  meta!: EntityTable<Meta, 'key'>
  closures!: Table<Closure, [string, ISODate]>

  constructor() {
    super('vagabond')
    this.version(1).stores({
      tramas: 'id, order',
      habits: 'id, tramaId',
      logs: '[habitId+date], habitId, date',
    })
    this.version(2).stores({
      uses: '++id, habitId, date',
      urges: '++id, habitId, date',
    })
    this.version(3).stores({ todos: 'id' })
    this.version(4).stores({ meta: 'key' })
    this.version(5).stores({ closures: '[habitId+date], habitId' })
  }
}

export const db = new VagabondDB()

export interface HabitDraft {
  name: string
  /** Trama existente, o nombre de una nueva. */
  tramaId: string | null
  newTramaName: string
  newTramaIdentity: string
  moment: Moment
  rhythm: Rhythm
  minVersion: string
  cue: string
  anchorId: string | null
  kind: 'build' | 'reduce'
  /** Solo para lo que se quiere dejar. `null` al editar significa conservar el plan actual. */
  plan: ReducePlan | null
  urgePlan: string
  /** "HH:MM" o vacío. */
  remindAt: string
  /** Segunda trama, o null. */
  tramaId2: string | null
  /** Momentos del día. Con dos o más, el hábito se hace varias veces al día. */
  slots: Slot[]
  reward: string
}

export interface TramaDraft {
  name: string
  identity: string
  color: TramaColor
}

const clean = (s: string) => s.trim() || undefined

async function nextColor(): Promise<{ color: TramaColor; order: number }> {
  const existing = await db.tramas.toArray()
  const used = new Set(existing.map((t) => t.color))
  return {
    color: TRAMA_COLORS.find((c) => !used.has(c)) ?? TRAMA_COLORS[existing.length % TRAMA_COLORS.length],
    order: existing.reduce((max, t) => Math.max(max, t.order + 1), 0),
  }
}

/** Campos del hábito que salen del asistente. Si hay ancla, hereda su momento del día. */
async function habitFields(draft: HabitDraft, tramaId: string) {
  const tramaId2 = draft.tramaId2 && draft.tramaId2 !== tramaId ? draft.tramaId2 : undefined
  if (draft.kind === 'reduce') {
    return {
      tramaId, tramaId2, name: draft.name.trim(), kind: 'reduce' as const, urgePlan: clean(draft.urgePlan),
      ...(draft.plan ? { plan: draft.plan } : {}),
    }
  }
  const days = draft.rhythm.kind === 'days'
  const slots = days ? draft.slots.map((s) => ({ moment: s.moment, cue: clean(s.cue ?? ''), remindAt: clean(s.remindAt ?? '') })) : []
  const multi = slots.length > 1
  const anchor = !multi && draft.anchorId ? await db.habits.get(draft.anchorId) : undefined
  return {
    tramaId,
    tramaId2,
    name: draft.name.trim(),
    moment: anchor?.moment ?? slots[0]?.moment ?? draft.moment,
    rhythm: draft.rhythm,
    minVersion: clean(draft.minVersion),
    reward: clean(draft.reward),
    slots: multi ? slots : undefined,
    cue: multi || anchor ? undefined : clean(slots[0]?.cue ?? draft.cue),
    remindAt: multi ? undefined : clean(slots[0]?.remindAt ?? draft.remindAt),
    anchorId: anchor?.id,
  }
}

async function resolveTrama(draft: HabitDraft): Promise<string> {
  if (draft.tramaId) return draft.tramaId
  const { color, order } = await nextColor()
  const id = crypto.randomUUID()
  await db.tramas.add({
    id, name: draft.newTramaName.trim(), identity: clean(draft.newTramaIdentity), color, order, createdAt: Date.now(),
  })
  return id
}

export function createHabit(draft: HabitDraft) {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    const tramaId = await resolveTrama(draft)
    await db.habits.add({
      id: crypto.randomUUID(),
      moment: 'morning',
      rhythm: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] },
      ...(await habitFields(draft, tramaId)),
      createdOn: todayISO(),
      createdAt: Date.now(),
      archived: false,
    })
  })
}

export function updateHabit(id: string, draft: HabitDraft) {
  return db.transaction('rw', [db.tramas, db.habits, db.logs, db.uses, db.urges, db.closures], async () => {
    const old = await db.habits.get(id)
    if (!old) return
    const today = todayISO()
    const tramaId = await resolveTrama(draft)
    const fields = await habitFields(draft, tramaId)
    const extra: Partial<Habit> = {}

    if (old.kind === 'reduce') {
      // Antes de cambiar el plan, los días ya pasados quedan fijos con el tope que tenían.
      if (draft.plan) {
        const [uses, urges, closures] = await Promise.all([
          db.uses.where('habitId').equals(id).toArray(), db.urges.where('habitId').equals(id).toArray(), db.closures.where('habitId').equals(id).toArray(),
        ])
        await db.closures.bulkPut(freezeDays(old, uses, urges, closures, today))
      }
    } else if ('rhythm' in fields && JSON.stringify(fields.rhythm) !== JSON.stringify(old.rhythm)) {
      // El ritmo nuevo rige desde hoy. La racha que traía se conserva si la unidad es la misma.
      const done = new Set((await db.logs.where('habitId').equals(id).toArray()).map((l) => l.date))
      const before = computeStreak(old, done, today)
      const unit = (r: Rhythm) => (r.kind === 'days' ? 'days' : r.period)
      extra.rhythmSince = today
      extra.streakCarry = unit(old.rhythm) === unit(fields.rhythm as Rhythm) ? before.current - (done.has(today) ? 1 : 0) : 0
    }

    await db.habits.update(id, { ...fields, ...extra })
    // Los hábitos apilados sobre este lo siguen si cambió de momento.
    if ('moment' in fields) await db.habits.filter((h) => h.anchorId === id).modify({ moment: fields.moment })
  })
}

/** Borra el hábito y sus votos. Los hábitos apilados sobre él quedan sueltos. */
export function deleteHabit(id: string) {
  return db.transaction('rw', [db.habits, db.logs, db.uses, db.urges, db.closures], async () => {
    await db.closures.where('habitId').equals(id).delete()
    await db.logs.where('habitId').equals(id).delete()
    await db.uses.where('habitId').equals(id).delete()
    await db.urges.where('habitId').equals(id).delete()
    await db.habits.delete(id)
    await db.habits.filter((h) => h.anchorId === id).modify({ anchorId: undefined })
  })
}

export async function createTrama(draft: TramaDraft) {
  const { order } = await nextColor()
  await db.tramas.add({
    id: crypto.randomUUID(), name: draft.name.trim(), identity: clean(draft.identity), color: draft.color, order, createdAt: Date.now(),
  })
}

export function updateTrama(id: string, draft: TramaDraft) {
  return db.tramas.update(id, { name: draft.name.trim(), identity: clean(draft.identity), color: draft.color })
}

/** Archivar saca el hábito de Hoy pero conserva sus votos. */
export function archiveHabit(id: string, archived: boolean) {
  return db.habits.update(id, { archived })
}

/** Intercambia la posición de dos hábitos en la lista. */
export function swapHabits(a: string, b: string) {
  return db.transaction('rw', db.habits, async () => {
    const all = (await db.habits.toArray()).sort(habitOrder)
    const ia = all.findIndex((h) => h.id === a)
    const ib = all.findIndex((h) => h.id === b)
    if (ia < 0 || ib < 0) return
    ;[all[ia], all[ib]] = [all[ib], all[ia]]
    await Promise.all(all.map((h, order) => (h.order === order ? null : db.habits.update(h.id, { order }))))
  })
}

/** Solo se puede borrar una trama sin hábitos. Devuelve false si todavía tiene. */
export function deleteTrama(id: string): Promise<boolean> {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    if (await db.habits.where('tramaId').equals(id).count()) return false
    await db.habits.filter((h) => h.tramaId2 === id).modify({ tramaId2: undefined })
    await db.tramas.delete(id)
    return true
  })
}

/** Marca con la versión de 2 minutos. En hábitos de varias veces al día, marca ese momento. */
export function logMin(habit: Habit, date: ISODate, slot?: Moment) {
  return db.transaction('rw', db.logs, async () => {
    const old = await db.logs.get([habit.id, date])
    const slots = isMulti(habit) && slot ? [...new Set([...(old?.slots ?? []), slot])] : undefined
    await db.logs.put({ habitId: habit.id, date, state: 'min', at: Date.now(), slots })
  })
}

/**
 * Marca o desmarca un día; en hábitos de varias veces al día, ese momento.
 * Devuelve true si quedó marcado.
 */
export function toggleLog(habit: Habit, date: ISODate, slot?: Moment): Promise<boolean> {
  return db.transaction('rw', db.logs, async () => {
    const key: [string, ISODate] = [habit.id, date]
    const old = await db.logs.get(key)
    if (isMulti(habit) && slot) {
      const had = old?.slots ?? []
      const slots = had.includes(slot) ? had.filter((m) => m !== slot) : [...had, slot]
      if (slots.length === 0) await db.logs.delete(key)
      else await db.logs.put({ habitId: habit.id, date, state: old?.state === 'min' && had.includes(slot) ? 'full' : old?.state ?? 'full', at: Date.now(), slots })
      return slots.includes(slot)
    }
    if (old) {
      await db.logs.delete(key)
      return false
    }
    // Desde el calendario, un hábito de varias veces al día se marca completo.
    const slots = isMulti(habit) ? habit.slots!.map((s) => s.moment) : undefined
    await db.logs.put({ habitId: habit.id, date, state: 'full', at: Date.now(), slots })
    return true
  })
}

/** Marca como hecho sin desmarcar si ya lo estaba. Se usa desde el botón "Hecho" de un aviso. */
export function markDone(habitId: string, date: ISODate, slot?: Moment) {
  return db.transaction('rw', db.habits, db.logs, async () => {
    const habit = await db.habits.get(habitId)
    if (!habit) return
    const old = await db.logs.get([habitId, date])
    if (isMulti(habit) && slot) {
      if (old?.slots?.includes(slot)) return
      await db.logs.put({ habitId, date, state: old?.state ?? 'full', at: Date.now(), slots: [...(old?.slots ?? []), slot] })
    } else if (!old) {
      await db.logs.put({ habitId, date, state: 'full', at: Date.now(), slots: isMulti(habit) ? [habit.slots![0].moment] : undefined })
    }
  })
}

/** Confirma cómo terminó un día sin registros de algo que se está dejando. */
export async function confirmDay(habit: Habit, date: ISODate, ok: boolean) {
  await db.closures.put({ habitId: habit.id, date, limit: habit.plan ? limitOn(habit.plan, date) : 0, ok })
}

export function unconfirmDay(habitId: string, date: ISODate) {
  return db.closures.delete([habitId, date])
}

/** Corrige cuántos fueron en un día pasado y deja ese día cerrado. */
export function setDayUses(habit: Habit, date: ISODate, count: number) {
  return db.transaction('rw', db.uses, db.closures, async () => {
    const rows = await db.uses.where('habitId').equals(habit.id).filter((u) => u.date === date).toArray()
    if (rows.length > count) await db.uses.bulkDelete(rows.slice(count).map((u) => u.id!))
    for (let i = rows.length; i < count; i++) await db.uses.add({ habitId: habit.id, date, at: Date.now() })
    const old = await db.closures.get([habit.id, date])
    const limit = old?.limit ?? (habit.plan ? limitOn(habit.plan, date) : 0)
    await db.closures.put({ habitId: habit.id, date, limit, ok: count <= limit })
  })
}

/** Registra una vez consumida (un cigarro). Devuelve su id, para poder deshacer. */
export function addUse(habitId: string, date: ISODate): Promise<number> {
  return db.uses.add({ habitId, date, at: Date.now() }) as Promise<number>
}

export function removeUse(id: number) {
  return db.uses.delete(id)
}

/** Registra un antojo resistido. Devuelve su id, para poder deshacer. */
export function addUrge(habitId: string, date: ISODate): Promise<number> {
  return db.urges.add({ habitId, date, at: Date.now() }) as Promise<number>
}

export function removeUrge(id: number) {
  return db.urges.delete(id)
}

/** Votos que llevan las tramas de un hábito (una o dos), leídos directo de la base. */
export async function tramaVotesOf(habitId: string, today: ISODate): Promise<{ tramaId: string; votes: number }[]> {
  const [habits, logs, uses, urges, closures] = await Promise.all([
    db.habits.toArray(), db.logs.toArray(), db.uses.toArray(), db.urges.toArray(), db.closures.toArray(),
  ])
  const habit = habits.find((h) => h.id === habitId)
  if (!habit) return []
  const votes = collectVotes(habits, logs, uses, urges, today, closures)
  return [habit.tramaId, habit.tramaId2].filter((t): t is string => !!t).map((tramaId) => {
    const ids = new Set(habits.filter((h) => h.tramaId === tramaId || h.tramaId2 === tramaId).map((h) => h.id))
    return { tramaId, votes: votes.filter((v) => ids.has(v.habitId)).length }
  })
}

export interface TodoDraft {
  title: string
  due: ISODate | null
}

export function createTodo(draft: TodoDraft) {
  return db.todos.add({ id: crypto.randomUUID(), title: draft.title.trim(), due: draft.due ?? undefined, done: false, createdAt: Date.now() })
}

export function updateTodo(id: string, draft: TodoDraft) {
  return db.todos.update(id, { title: draft.title.trim(), due: draft.due ?? undefined })
}

export function setTodoDone(id: string, done: boolean) {
  return db.todos.update(id, { done, doneAt: done ? Date.now() : undefined })
}

export function deleteTodo(id: string) {
  return db.todos.delete(id)
}

export function clearDoneTodos() {
  return db.todos.filter((t) => t.done).delete()
}

export function saveReminders(value: ReminderSettings) {
  return db.meta.put({ key: 'reminders', value })
}

export function savePauses(value: Pause[]) {
  return db.meta.put({ key: 'pauses', value })
}

const ALL = () => [db.tramas, db.habits, db.logs, db.uses, db.urges, db.todos, db.meta, db.closures]

export async function exportAll(): Promise<BackupData> {
  const [tramas, habits, logs, uses, urges, todos, meta, closures] = await Promise.all(ALL().map((t) => t.toArray()))
  await db.meta.put({ key: 'lastBackupAt', value: Date.now() })
  return { tramas, habits, logs, uses, urges, todos, meta, closures } as BackupData
}

/** Reemplaza todo lo que hay en el teléfono por el contenido del respaldo. Todo o nada. */
export function importAll(backup: Backup) {
  const d = backup.data
  return db.transaction('rw', ALL(), async () => {
    await Promise.all(ALL().map((t) => t.clear()))
    await db.tramas.bulkAdd(d.tramas)
    await db.habits.bulkAdd(d.habits)
    await db.logs.bulkAdd(d.logs)
    // Los ids de estas dos tablas son automáticos: se vuelven a generar.
    await db.uses.bulkAdd(d.uses.map(({ id: _id, ...u }) => u))
    await db.urges.bulkAdd(d.urges.map(({ id: _id, ...u }) => u))
    await db.todos.bulkAdd(d.todos)
    await db.meta.bulkAdd(d.meta)
    await db.closures.bulkAdd(d.closures)
  })
}

if (import.meta.env.DEV) (window as unknown as { __vagabond: unknown }).__vagabond = { db }
