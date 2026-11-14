import Dexie, { type EntityTable, type Table } from 'dexie'
import { toISO, type ISODate } from '../domain/dates'
import { TRAMA_COLORS, type Habit, type Log, type Moment, type Rhythm, type Trama } from '../domain/types'

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
  moment: Moment
  rhythm: Rhythm
}

async function resolveTrama(draft: HabitDraft): Promise<string> {
  if (draft.tramaId) return draft.tramaId
  const existing = await db.tramas.toArray()
  const used = new Set(existing.map((t) => t.color))
  const color = TRAMA_COLORS.find((c) => !used.has(c)) ?? TRAMA_COLORS[existing.length % TRAMA_COLORS.length]
  const id = crypto.randomUUID()
  await db.tramas.add({ id, name: draft.newTramaName.trim(), color, order: existing.length, createdAt: Date.now() })
  return id
}

export function createHabit(draft: HabitDraft) {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    const tramaId = await resolveTrama(draft)
    await db.habits.add({
      id: crypto.randomUUID(),
      tramaId,
      name: draft.name.trim(),
      moment: draft.moment,
      rhythm: draft.rhythm,
      createdOn: toISO(new Date()),
      createdAt: Date.now(),
      archived: false,
    })
  })
}

export function updateHabit(id: string, draft: HabitDraft) {
  return db.transaction('rw', db.tramas, db.habits, async () => {
    const tramaId = await resolveTrama(draft)
    await db.habits.update(id, { tramaId, name: draft.name.trim(), moment: draft.moment, rhythm: draft.rhythm })
  })
}

/** Borra el hábito y sus votos. */
export function deleteHabit(id: string) {
  return db.transaction('rw', db.habits, db.logs, async () => {
    await db.logs.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  })
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
