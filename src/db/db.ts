import Dexie, { type EntityTable, type Table } from 'dexie'
import { toISO, type ISODate } from '../domain/dates'
import { collectVotes } from '../domain/reduce'
import {
  TRAMA_COLORS, type Habit, type Log, type Moment, type ReducePlan, type Rhythm, type Trama, type Todo, type TramaColor, type Urge, type Use,
} from '../domain/types'

class VagabondDB extends Dexie {
  tramas!: EntityTable<Trama, 'id'>
  habits!: EntityTable<Habit, 'id'>
  logs!: Table<Log, [string, ISODate]>
  uses!: EntityTable<Use, 'id'>
  urges!: EntityTable<Urge, 'id'>
  todos!: EntityTable<Todo, 'id'>

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
  if (draft.kind === 'reduce') {
    return {
      tramaId, name: draft.name.trim(), kind: 'reduce' as const, urgePlan: clean(draft.urgePlan),
      ...(draft.plan ? { plan: draft.plan } : {}),
    }
  }
  const anchor = draft.anchorId ? await db.habits.get(draft.anchorId) : undefined
  return {
    tramaId,
    name: draft.name.trim(),
    moment: anchor?.moment ?? draft.moment,
    rhythm: draft.rhythm,
    minVersion: clean(draft.minVersion),
    cue: anchor ? undefined : clean(draft.cue),
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
      createdOn: toISO(new Date()),
      createdAt: Date.now(),
      archived: false,
    })
  })
}

export function updateHabit(id: string, draft: HabitDraft) {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    const tramaId = await resolveTrama(draft)
    const fields = await habitFields(draft, tramaId)
    await db.habits.update(id, fields)
    // Los hábitos apilados sobre este lo siguen si cambió de momento.
    const followers = await db.habits.filter((h) => h.anchorId === id).toArray()
    if ('moment' in fields) for (const f of followers) await db.habits.update(f.id, { moment: fields.moment })
  })
}

/** Borra el hábito y sus votos. Los hábitos apilados sobre él quedan sueltos. */
export function deleteHabit(id: string) {
  return db.transaction('rw', db.habits, db.logs, db.uses, db.urges, async () => {
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

/** Solo se puede borrar una trama sin hábitos. Devuelve false si todavía tiene. */
export function deleteTrama(id: string): Promise<boolean> {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    if (await db.habits.where('tramaId').equals(id).count()) return false
    await db.tramas.delete(id)
    return true
  })
}

/** Marca hoy con la versión de 2 minutos. */
export function logMin(habitId: string, date: ISODate) {
  return db.logs.put({ habitId, date, state: 'min', at: Date.now() })
}

/** Marca o desmarca un día. Devuelve true si quedó marcado. */
export function toggleLog(habitId: string, date: ISODate): Promise<boolean> {
  return db.transaction('rw', db.logs, async () => {
    const key: [string, ISODate] = [habitId, date]
    if (await db.logs.get(key)) {
      await db.logs.delete(key)
      return false
    }
    await db.logs.put({ habitId, date, state: 'full', at: Date.now() })
    return true
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

/** Votos que lleva la trama de un hábito, leídos directo de la base. */
export async function tramaVotesOf(habitId: string, today: ISODate): Promise<number> {
  const [habits, logs, uses, urges] = await Promise.all([db.habits.toArray(), db.logs.toArray(), db.uses.toArray(), db.urges.toArray()])
  const tramaId = habits.find((h) => h.id === habitId)?.tramaId
  const ids = new Set(habits.filter((h) => h.tramaId === tramaId).map((h) => h.id))
  return collectVotes(habits, logs, uses, urges, today).filter((v) => ids.has(v.habitId)).length
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

if (import.meta.env.DEV) (window as unknown as { __vagabond: unknown }).__vagabond = { db }
