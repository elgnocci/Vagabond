import { addDays, diffDays, formatShort, startOfWeek, weekdayMon, toISO, type ISODate } from './dates'
import { isPaused } from './pauses'
import { collectVotes, reduceDays } from './reduce'
import { computeStreak, rhythmStart } from './streaks'
import { tramaStats } from './tramas'
import type { Closure, Habit, Log, Pause, Todo, Trama, Urge, Use } from './types'

export interface ChapterData {
  habits: Habit[]
  tramas: Trama[]
  logs: Log[]
  uses: Use[]
  urges: Urge[]
  closures: Closure[]
  pauses: Pause[]
  todos: Todo[]
}

export interface Chapter {
  /** Capítulo 1 = la semana en que se creó el primer hábito. */
  number: number
  start: ISODate
  end: ISODate
  title: string
  /** "9 – 15 nov" */
  range: string
  votes: number
  lines: string[]
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Resumen escrito de una semana cerrada (lunes a domingo). */
export function buildChapter(data: ChapterData, start: ISODate, number: number): Chapter {
  const end = addDays(start, 6)
  const inWeek = (d: ISODate) => d >= start && d <= end
  const prevStart = addDays(start, -7)
  const live = data.habits
  const votes = collectVotes(live, data.logs, data.uses, data.urges, addDays(end, 1), data.closures, data.pauses)
  const week = votes.filter((v) => inWeek(v.date))
  const before = votes.filter((v) => v.date >= prevStart && v.date < start).length
  const days = new Set(week.map((v) => v.date)).size
  const lines: string[] = []

  if (week.length === 0) {
    const paused = isPaused(data.pauses, start) || isPaused(data.pauses, end)
    return {
      number, start, end, votes: 0, range: `${formatShort(start)} – ${formatShort(end)}`,
      title: paused ? 'Una pausa' : 'Una semana en blanco',
      lines: [paused ? 'Estuviste en pausa. La trama te esperó.' : 'No hubo votos esta semana. No hace falta recuperarla: basta con uno hoy.'],
    }
  }

  const diff = week.length - before
  lines.push(
    `Sumaste ${n(week.length, 'voto', 'votos')} en ${n(days, 'día', 'días')}` +
      (before > 0 && diff !== 0 ? `, ${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'} que la semana anterior.` : '.'),
  )

  const perTrama = tramaStats(data.tramas, live, week).filter((t) => t.votes > 0).sort((a, b) => b.votes - a.votes)
  if (perTrama.length > 1) lines.push(perTrama.map((t) => `${t.trama.name}: ${t.votes}`).join(' · ') + '.')

  // Caídas y regresos: un día programado sin hacer, y si el siguiente programado se cumplió.
  let misses = 0
  let returns = 0
  let topStreak: { name: string; value: number } | null = null
  const nudges: string[] = []
  for (const h of live) {
    if (h.kind === 'reduce' || h.createdOn > end) continue
    const mine = data.logs.filter((l) => l.habitId === h.id)
    const done = new Set(mine.map((l) => l.date))
    if (h.rhythm.kind === 'days') {
      const from = rhythmStart(h)
      const due = (d: ISODate) => h.rhythm.kind === 'days' && h.rhythm.days.includes(weekdayMon(d)) && d >= from && !isPaused(data.pauses, d)
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!due(d) || done.has(d)) continue
        misses++
        for (let x = addDays(d, 1); x <= addDays(d, 7); x = addDays(x, 1)) {
          if (!due(x)) continue
          if (done.has(x)) returns++
          break
        }
      }
      const streak = computeStreak(h, done, end, data.pauses).current
      if (!h.archived && streak >= 3 && (!topStreak || streak > topStreak.value)) topStreak = { name: h.name, value: streak }
    }
    const weekLogs = mine.filter((l) => inWeek(l.date))
    const mins = weekLogs.filter((l) => l.state === 'min').length
    if (!h.archived && weekLogs.length >= 4 && mins >= weekLogs.length - 1) {
      nudges.push(`${h.name}: ${mins} de ${weekLogs.length} veces fue la versión de 2 minutos. Ya sabes presentarte; cuando quieras, sube un paso.`)
    }
  }
  if (misses > 0) {
    lines.push(
      returns === misses
        ? `Fallaste ${n(misses, 'vez', 'veces')} y todas volviste a la siguiente. Eso es no fallar dos veces.`
        : returns > 0
          ? `Fallaste ${n(misses, 'vez', 'veces')} y volviste a la siguiente en ${returns}.`
          : `Fallaste ${n(misses, 'vez', 'veces')}. La próxima semana, que ninguna caída sean dos.`,
    )
  }
  if (topStreak) lines.push(`${topStreak.name} cerró la semana con ${topStreak.value} días de racha.`)

  for (const h of live) {
    if (h.kind !== 'reduce' || h.archived || h.createdOn > end) continue
    const rd = reduceDays(h, data.uses, data.urges, data.closures, data.pauses)
    let ok = 0
    let known = 0
    for (let d = start < h.createdOn ? h.createdOn : start; d <= end; d = addDays(d, 1)) {
      const st = rd.status(d)
      if (st === 'ok' || st === 'over') known++
      if (st === 'ok') ok++
    }
    const resisted = data.urges.filter((u) => u.habitId === h.id && inWeek(u.date)).length
    if (known > 0 || resisted > 0) {
      lines.push(`${h.name}: ${n(ok, 'día', 'días')} dentro del tope de ${known} registrados` + (resisted ? `, y ${n(resisted, 'antojo resistido', 'antojos resistidos')}.` : '.'))
    }
  }
  lines.push(...nudges)

  const closed = data.todos.filter((t) => t.done && t.doneAt && inWeek(toISO(new Date(t.doneAt)))).length
  if (closed > 0) lines.push(`Cerraste ${n(closed, 'pendiente', 'pendientes')}.`)

  const title =
    misses > 0 && returns === misses ? 'Caer y volver'
    : before > 0 && week.length >= before * 1.25 ? 'La semana en que subiste'
    : before > 0 && week.length <= before * 0.6 ? 'Una semana más lenta'
    : perTrama[0] ? `La semana de ${perTrama[0].trama.name}`
    : 'Una semana más'

  return { number, start, end, votes: week.length, title, range: `${formatShort(start)} – ${formatShort(end)}`, lines }
}

/** Capítulos de las semanas ya cerradas, del más nuevo al más viejo. */
export function buildChapters(data: ChapterData, today: ISODate, max = 8): Chapter[] {
  const first = data.habits.reduce<ISODate | null>((min, h) => (!min || h.createdOn < min ? h.createdOn : min), null)
  if (!first) return []
  const firstWeek = startOfWeek(first)
  const out: Chapter[] = []
  for (let s = addDays(startOfWeek(today), -7); s >= firstWeek && out.length < max; s = addDays(s, -7)) {
    out.push(buildChapter(data, s, diffDays(firstWeek, s) / 7 + 1))
  }
  return out
}
