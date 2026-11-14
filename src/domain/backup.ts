import type { Habit, Log, Meta, Todo, Trama, Urge, Use } from './types'

export interface BackupData {
  tramas: Trama[]
  habits: Habit[]
  logs: Log[]
  uses: Use[]
  urges: Urge[]
  todos: Todo[]
  meta: Meta[]
}

export interface Backup {
  app: 'vagabond'
  version: 1
  exportedAt: string
  data: BackupData
}

const TABLES: (keyof BackupData)[] = ['tramas', 'habits', 'logs', 'uses', 'urges', 'todos', 'meta']

export function buildBackup(data: BackupData, now: Date): Backup {
  return { app: 'vagabond', version: 1, exportedAt: now.toISOString(), data }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string' && v.length > 0

/** Lee un respaldo. Devuelve el respaldo o un mensaje de error para mostrar. */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no es un respaldo de Vagabond.' }
  }
  if (!isObj(raw) || raw.app !== 'vagabond' || !isObj(raw.data)) return { ok: false, error: 'El archivo no es un respaldo de Vagabond.' }
  if (raw.version !== 1) return { ok: false, error: 'Este respaldo es de una versión más nueva de Vagabond.' }

  const data = raw.data
  const out = {} as Record<keyof BackupData, unknown[]>
  for (const t of TABLES) {
    const rows = data[t] ?? []
    if (!Array.isArray(rows) || !rows.every(isObj)) return { ok: false, error: 'El respaldo está dañado.' }
    out[t] = rows
  }
  const tramaIds = new Set(out.tramas.map((t) => (t as Record<string, unknown>).id))
  const habitIds = new Set(out.habits.map((h) => (h as Record<string, unknown>).id))
  const ok =
    out.tramas.every((t) => { const r = t as Record<string, unknown>; return str(r.id) && str(r.name) && str(r.color) }) &&
    out.habits.every((h) => { const r = h as Record<string, unknown>; return str(r.id) && str(r.name) && tramaIds.has(r.tramaId) && isObj(r.rhythm) && str(r.createdOn) }) &&
    [...out.logs, ...out.uses, ...out.urges].every((l) => { const r = l as Record<string, unknown>; return habitIds.has(r.habitId) && str(r.date) }) &&
    out.todos.every((t) => { const r = t as Record<string, unknown>; return str(r.id) && str(r.title) }) &&
    out.meta.every((m) => str((m as Record<string, unknown>).key))
  if (!ok) return { ok: false, error: 'El respaldo está dañado.' }

  return { ok: true, backup: { app: 'vagabond', version: 1, exportedAt: String(raw.exportedAt ?? ''), data: out as unknown as BackupData } }
}

/** "3 tramas, 5 hábitos y 214 registros" */
export function describeBackup(b: Backup): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const records = b.data.logs.length + b.data.uses.length + b.data.urges.length
  return `${n(b.data.tramas.length, 'trama', 'tramas')}, ${n(b.data.habits.length, 'hábito', 'hábitos')} y ${n(records, 'registro', 'registros')}`
}
