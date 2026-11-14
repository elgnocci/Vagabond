import { describe, expect, it } from 'vitest'
import { addDays, periodEnd, startOfWeek, weekdayMon } from './dates'
import { computeStreak } from './streaks'
import { buildToday, voteGrid } from './today'
import type { Habit, Log, Rhythm } from './types'

// 2024-01-01 fue lunes.
const MON = '2024-01-01'
const day = (n: number) => addDays(MON, n)
const set = (...ns: number[]) => new Set(ns.map(day))
const daily: Rhythm = { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }
const habit = (rhythm: Rhythm, createdOn = MON) => ({ rhythm, createdOn })

describe('fechas', () => {
  it('la semana parte el lunes', () => {
    expect(weekdayMon(MON)).toBe(0)
    expect(weekdayMon(day(6))).toBe(6)
    expect(startOfWeek(day(6))).toBe(MON)
    expect(startOfWeek(day(7))).toBe(day(7))
  })
  it('cruza meses y años, incluido febrero bisiesto', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01')
    expect(periodEnd('2024-02-01', 'month')).toBe('2024-02-29')
    expect(periodEnd('2023-02-01', 'month')).toBe('2023-02-28')
  })
})

describe('racha de días fijos', () => {
  it('cuenta días seguidos, incluido hoy si está marcado', () => {
    expect(computeStreak(habit(daily), set(0, 1, 2, 3), day(3)).current).toBe(4)
  })
  it('hoy pendiente no es un fallo', () => {
    const s = computeStreak(habit(daily), set(0, 1, 2), day(3))
    expect(s.current).toBe(3)
    expect(s.atRisk).toBe(false)
  })
  it('un fallo aislado no rompe la racha, pero no suma', () => {
    const s = computeStreak(habit(daily), set(0, 1, 3, 4), day(4))
    expect(s.current).toBe(4)
  })
  it('dos fallos seguidos cortan la racha', () => {
    const s = computeStreak(habit(daily), set(0, 1, 4, 5), day(5))
    expect(s.current).toBe(2)
  })
  it('tras fallar ayer, hoy queda en riesgo hasta marcarlo', () => {
    const before = computeStreak(habit(daily), set(0, 1, 2), day(4))
    expect(before).toMatchObject({ current: 3, missedLast: true, missedYesterday: true, atRisk: true })
    const after = computeStreak(habit(daily), set(0, 1, 2, 4), day(4))
    expect(after).toMatchObject({ current: 4, atRisk: false })
  })
  it('dos fallos seguidos y hoy pendiente: racha en cero', () => {
    expect(computeStreak(habit(daily), set(0, 1), day(4)).current).toBe(0)
  })
  it('solo cuentan los días programados', () => {
    const lmv: Rhythm = { kind: 'days', days: [0, 2, 4] }
    // lunes, miércoles, viernes y el lunes siguiente; hoy es martes.
    const s = computeStreak(habit(lmv), set(0, 2, 4, 7), day(8))
    expect(s).toMatchObject({ current: 4, atRisk: false, missedLast: false })
  })
  it('en días no seguidos, el fallo anterior no fue "ayer"', () => {
    const lmv: Rhythm = { kind: 'days', days: [0, 2, 4] }
    const s = computeStreak(habit(lmv), set(0), day(4)) // faltó el miércoles, hoy viernes
    expect(s).toMatchObject({ current: 1, missedLast: true, missedYesterday: false, atRisk: true })
  })
  it('no mira antes de la fecha de creación', () => {
    const s = computeStreak(habit(daily, day(10)), set(10, 11), day(11))
    expect(s).toMatchObject({ current: 2, missedLast: false })
  })
  it('hábito creado hoy: sin racha ni riesgo', () => {
    expect(computeStreak(habit(daily, day(3)), new Set(), day(3))).toMatchObject({ current: 0, atRisk: false })
  })
})

describe('racha de veces por semana', () => {
  const twice: Rhythm = { kind: 'quota', period: 'week', times: 2 }

  it('cuenta semanas cumplidas; la actual suma cuando llega a la meta', () => {
    const logs = set(0, 3, 8, 10, 14)
    const mid = computeStreak(habit(twice), logs, day(15))
    expect(mid).toMatchObject({ current: 2, unit: 'weeks' })
    expect(mid.period).toMatchObject({ progress: 1, times: 2, met: false, needed: 1 })
    const met = computeStreak(habit(twice), new Set([...logs, day(15)]), day(15))
    expect(met.current).toBe(3)
    expect(met.period?.met).toBe(true)
  })
  it('una semana fallada se tolera; dos seguidas cortan', () => {
    const one = computeStreak(habit(twice), set(0, 1, 7, 8, 21, 22), day(22)) // falla semana 3
    expect(one.current).toBe(3)
    const two = computeStreak(habit(twice), set(0, 1, 28, 29), day(29)) // fallan semanas 2, 3 y 4
    expect(two.current).toBe(1)
  })
  it('la semana pasada fallada deja esta en riesgo', () => {
    const s = computeStreak(habit(twice), set(0, 1), day(14)) // semana 2 vacía, hoy lunes de la 3
    expect(s).toMatchObject({ missedLast: true, atRisk: true })
  })
  it('la semana de creación incompleta no cuenta como fallo', () => {
    const s = computeStreak(habit(twice, day(5)), set(5), day(7)) // creado sábado, hoy lunes
    expect(s).toMatchObject({ current: 0, missedLast: false, atRisk: false })
  })
  it('avisa cuando quedan justo los días necesarios', () => {
    const s = computeStreak(habit(twice), new Set(), day(5)) // sábado, faltan 2, quedan sábado y domingo
    expect(s.period).toMatchObject({ needed: 2, available: 2, tight: true, outOfReach: false })
    expect(s.atRisk).toBe(true)
  })
  it('si hoy ya está marcado, hoy no cuenta como día disponible', () => {
    const s = computeStreak(habit(twice), set(6), day(6)) // domingo marcado, falta 1 y no quedan días
    expect(s.period).toMatchObject({ needed: 1, available: 0, outOfReach: true })
    expect(s.atRisk).toBe(false)
  })
})

describe('racha de veces por mes', () => {
  const monthly: Rhythm = { kind: 'quota', period: 'month', times: 1 }
  it('cuenta meses cumplidos', () => {
    const done = new Set(['2024-01-20', '2024-02-03', '2024-03-30'])
    const s = computeStreak(habit(monthly), done, '2024-04-02')
    expect(s).toMatchObject({ current: 3, unit: 'months' })
    expect(s.period).toMatchObject({ progress: 0, met: false })
  })
})

describe('vista de hoy', () => {
  const trama = { id: 't', name: 'Cuidar mi cuerpo', color: 'teal' as const, order: 0, createdAt: 0 }
  const mk = (id: string, rhythm: Rhythm, moment: Habit['moment'] = 'morning'): Habit => ({
    id, tramaId: 't', name: id, moment, rhythm, createdOn: MON, createdAt: id.charCodeAt(0), archived: false,
  })
  const log = (habitId: string, n: number): Log => ({ habitId, date: day(n), state: 'full', at: 0 })

  it('agrupa por momento y deja fuera lo que no toca hoy', () => {
    const habits = [
      mk('a', daily, 'night'),
      mk('b', daily, 'morning'),
      mk('c', { kind: 'days', days: [0] }), // solo lunes
      mk('d', { kind: 'quota', period: 'week', times: 2 }),
    ]
    const v = buildToday(habits, [trama], [log('b', 1)], day(1)) // martes
    expect(v.sections.map((s) => s.id)).toEqual(['morning', 'night', 'week'])
    expect(v.sections[0].items.map((i) => i.habit.id)).toEqual(['b'])
    expect(v).toMatchObject({ done: 1, total: 2, allDone: false, totalVotes: 1, dayNumber: 2 })
  })
  it('un hábito de meta solo entra al avance del día cuando se marca hoy', () => {
    const habits = [mk('a', daily), mk('d', { kind: 'quota', period: 'week', times: 2 })]
    const v = buildToday(habits, [trama], [log('a', 1), log('d', 1)], day(1))
    expect(v).toMatchObject({ done: 2, total: 2, allDone: true })
  })
  it('sin hábitos no hay día ni avance', () => {
    expect(buildToday([], [], [], MON)).toMatchObject({ hasHabits: false, dayNumber: null, allDone: false })
  })
  it('los puntos de la semana distinguen hecho, fallado, pendiente y no programado', () => {
    const v = buildToday([mk('c', { kind: 'days', days: [0, 2, 4] })], [trama], [log('c', 0)], day(4))
    // desde el sábado anterior (antes de crear) hasta el viernes de hoy
    expect(v.sections[0].items[0].dots).toEqual(['off', 'off', 'done', 'off', 'missed', 'off', 'pending'])
  })
})

describe('matriz de votos', () => {
  it('son semanas completas, con hoy y los días futuros marcados', () => {
    const cells = voteGrid([], day(9), 5) // miércoles de la segunda semana
    expect(cells).toHaveLength(35)
    expect(weekdayMon(cells[0].date)).toBe(0)
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual([day(9)])
    expect(cells.filter((c) => c.future)).toHaveLength(4)
  })
  it('la intensidad es relativa al mejor día de la ventana', () => {
    const logs: Log[] = [
      ...['a', 'b', 'c', 'd'].map((h) => ({ habitId: h, date: day(8), state: 'full' as const, at: 0 })),
      { habitId: 'a', date: day(9), state: 'full', at: 0 },
    ]
    const cells = voteGrid(logs, day(9), 5)
    const at = (d: string) => cells.find((c) => c.date === d)!.level
    expect(at(day(8))).toBe(3)
    expect(at(day(9))).toBe(1)
    expect(at(day(7))).toBe(0)
  })
})
