import Dexie, { type EntityTable, type Table } from 'dexie'
import { toISO, type ISODate } from '../domain/dates'
import { TRAMA_COLORS, type Habit, type Log, type Moment, type Rhythm, type Trama, type TramaColor } from '../domain/types'

class VagabondDB extends Dexie {
  tramas!: EntityTable<Trama, 'id'>
  habits!: EntityTable<Habit, 'id'>
  logs!: Table<Log, [string, ISODate]>

  constructor() {
    super('vagabond')
    this.version(1).stores({
      tramas: 'id, order',
      habits: 'id, tramaId',
      logs: '[habitId+date], habitId, date',
    })
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
    for (const f of followers) await db.habits.update(f.id, { moment: fields.moment })
  })
}

/** Borra el hábito y sus votos. Los hábitos apilados sobre él quedan sueltos. */
export function deleteHabit(id: string) {
  return db.transaction('rw', db.habits, db.logs, async () => {
    await db.logs.where('habitId').equals(id).delete()
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

/** Votos que lleva la trama de un hábito. */
export async function tramaVotesOf(habitId: string): Promise<number> {
  const habit = await db.habits.get(habitId)
  if (!habit) return 0
  const ids = (await db.habits.where('tramaId').equals(habit.tramaId).toArray()).map((h) => h.id)
  return db.logs.where('habitId').anyOf(ids).count()
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

if (import.meta.env.DEV) (window as unknown as { __vagabond: unknown }).__vagabond = { db }
