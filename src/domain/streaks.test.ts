import { describe, expect, it } from 'vitest'
import { addDays, periodEnd, startOfWeek, weekdayMon } from './dates'
import { computeStreak } from './streaks'
import { buildToday, voteGrid } from './today'
import { dependsOn, layoutConstellation, milestoneProgress, rhythmText, tramaStats } from './tramas'
import { buildBackup, describeBackup, parseBackup } from './backup'
import { buildChapter, buildChapters, type ChapterData } from './chapters'
import { formatPct, formatTimes, growthSeries, yearProjection, type GrowthData } from './growth'
import { activeDays, bestStreak, cumulativeSeries, habitRate, monthGrid, weekCompare } from './progress'
import { buildPlan, collectVotes, freezeDays, limitOn, reduceState } from './reduce'
import { planReminders } from './reminders'
import { dueLabel, groupTodos, todosForToday } from './todos'
import type { Habit, Log, Rhythm, Todo, Urge, Use } from './types'

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
    const s = computeStreak(habit(twice), set(0, 1), day(12)) // sábado de la 2ª semana, faltan 2, quedan sábado y domingo
    expect(s.period).toMatchObject({ needed: 2, available: 2, tight: true, outOfReach: false })
    expect(s.atRisk).toBe(true)
    // En la semana en que se creó el hábito todavía no se exige.
    expect(computeStreak(habit(twice), new Set(), day(5)).atRisk).toBe(false)
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


describe('apilamiento en la vista de hoy', () => {
  const base = { tramaId: 't', moment: 'morning' as const, rhythm: daily, createdOn: MON, archived: false }
  const a: Habit = { ...base, id: 'a', name: 'Dientes', createdAt: 1 }
  const b: Habit = { ...base, id: 'b', name: 'Leer', createdAt: 2 }
  const c: Habit = { ...base, id: 'c', name: 'Cama', createdAt: 3, anchorId: 'a' }
  const d: Habit = { ...base, id: 'd', name: 'Estirar', createdAt: 4, anchorId: 'c' }

  it('pone cada hábito justo después de su ancla, en cadena', () => {
    const v = buildToday([a, b, c, d], [], [], MON)
    expect(v.sections[0].items.map((i) => [i.habit.id, i.linked])).toEqual([
      ['a', false], ['c', true], ['d', true], ['b', false],
    ])
    expect(v.sections[0].items[1].anchorName).toBe('Dientes')
  })
  it('si el ancla no toca hoy, el hábito aparece suelto', () => {
    const onlyTue: Habit = { ...a, rhythm: { kind: 'days', days: [1] } }
    const v = buildToday([onlyTue, c], [], [], MON)
    expect(v.sections[0].items.map((i) => [i.habit.id, i.linked])).toEqual([['c', false]])
  })
  it('un ciclo en los datos no pierde hábitos', () => {
    const x: Habit = { ...a, anchorId: 'c' }
    const v = buildToday([x, c], [], [], MON)
    expect(v.sections[0].items.map((i) => i.habit.id).sort()).toEqual(['a', 'c'])
  })
  it('la versión de 2 minutos cuenta como hecho y mantiene la racha', () => {
    const logs: Log[] = [
      { habitId: 'a', date: MON, state: 'full', at: 0 },
      { habitId: 'a', date: day(1), state: 'min', at: 0 },
    ]
    const item = buildToday([a], [], logs, day(1)).sections[0].items[0]
    expect(item).toMatchObject({ doneToday: true, minToday: true })
    expect(item.streak.current).toBe(2)
  })
  it('detecta dependencias para no crear ciclos', () => {
    const byId = new Map([a, b, c, d].map((h) => [h.id, h]))
    expect(dependsOn(d, 'a', byId)).toBe(true)
    expect(dependsOn(a, 'a', byId)).toBe(true)
    expect(dependsOn(b, 'a', byId)).toBe(false)
  })
})

describe('tramas e hitos', () => {
  it('calcula el hito anterior, el siguiente y el avance', () => {
    expect(milestoneProgress(0)).toEqual({ prev: 0, next: 10, ratio: 0 })
    expect(milestoneProgress(10)).toEqual({ prev: 10, next: 25, ratio: 0 })
    expect(milestoneProgress(40)).toMatchObject({ prev: 25, next: 50, ratio: 0.6 })
    expect(milestoneProgress(5000)).toMatchObject({ prev: 1000, next: null, ratio: 1 })
  })
  it('suma los votos de cada trama a través de sus hábitos', () => {
    const t1 = { id: 't1', name: 'A', color: 'teal' as const, order: 0, createdAt: 0 }
    const t2 = { id: 't2', name: 'B', color: 'lila' as const, order: 1, createdAt: 0 }
    const h = (id: string, tramaId: string): Habit => ({
      id, tramaId, name: id, moment: 'morning', rhythm: daily, createdOn: MON, createdAt: 0, archived: false,
    })
    const logs: Log[] = [['x', 0], ['x', 1], ['y', 0], ['huérfano', 0]].map(([habitId, n]) => ({
      habitId: habitId as string, date: day(n as number), state: 'full', at: 0,
    }))
    const stats = tramaStats([t1, t2], [h('x', 't1'), h('y', 't1')], logs)
    expect(stats.map((s) => [s.votes, s.habits.length])).toEqual([[3, 2], [0, 0]])
  })
  it('describe el ritmo en palabras', () => {
    expect(rhythmText(daily)).toBe('Todos los días')
    expect(rhythmText({ kind: 'days', days: [0, 2, 4] })).toBe('L · M · V')
    expect(rhythmText({ kind: 'quota', period: 'week', times: 2 })).toBe('2 veces por semana')
    expect(rhythmText({ kind: 'quota', period: 'month', times: 1 })).toBe('1 vez por mes')
  })
})

describe('plan de reducción', () => {
  it('baja el tope por semanas hasta la fecha final', () => {
    const plan = buildPlan(6, 4, MON)
    expect(plan.stages).toEqual([
      { from: MON, limit: 6 }, { from: day(7), limit: 5 }, { from: day(14), limit: 3 }, { from: day(21), limit: 2 },
    ])
    expect(plan.quitDate).toBe(day(28))
  })
  it('nunca baja de 1 antes de la fecha final y junta etapas iguales', () => {
    const plan = buildPlan(2, 6, MON)
    expect(plan.stages.map((s) => s.limit)).toEqual([2, 1])
    expect(plan.stages[1].from).toBe(day(14))
  })
  it('el tope del día sale de la etapa vigente y es cero desde la fecha final', () => {
    const plan = buildPlan(6, 4, MON)
    expect([0, 6, 7, 20, 21, 27, 28, 100].map((n) => limitOn(plan, day(n)))).toEqual([6, 6, 5, 3, 2, 2, 0, 0])
  })
})

describe('estado del tabaco', () => {
  const tabaco = { id: 'x', createdOn: MON, plan: buildPlan(3, 2, MON) } // tope 3, luego 2, cero el día 14
  const use = (n: number, times = 1): Use[] => Array.from({ length: times }, () => ({ habitId: 'x', date: day(n), at: 0 }))
  const urge = (n: number): Urge => ({ habitId: 'x', date: day(n), at: 0 })

  it('cuenta lo de hoy contra el tope', () => {
    const s = reduceState(tabaco, use(2, 2), [urge(2), urge(1)], day(2))
    expect(s).toMatchObject({ limit: 3, used: 2, over: false, resistedToday: 1, resistedTotal: 2 })
  })
  const ok = (...ns: number[]): Use[] => ns.flatMap((n) => use(n)) // un cigarro: día registrado y dentro del tope

  it('un día dentro del tope vale; hoy no cuenta hasta que termina', () => {
    const s = reduceState(tabaco, [...use(0, 3), ...use(1, 1), ...use(2, 1)], [], day(2))
    expect(s.okDays).toEqual([MON, day(1)])
    expect(s.streak).toBe(2)
  })
  it('un día sin registros no es un logro: no vota y cuenta como fallo de la racha', () => {
    const s = reduceState(tabaco, ok(0, 1), [], day(5)) // días 2, 3 y 4 sin abrir la app
    expect(s.okDays).toEqual([MON, day(1)])
    expect(s).toMatchObject({ streak: 0, needsConfirm: true })
  })
  it('un día sin registros vale si se confirma, y un antojo resistido también lo registra', () => {
    const closures = [{ habitId: 'x', date: day(1), limit: 3, ok: true }, { habitId: 'x', date: day(2), limit: 3, ok: false }]
    const s = reduceState(tabaco, ok(0), [urge(3)], day(4), closures)
    expect(s.okDays).toEqual([MON, day(1), day(3)])
    expect(s).toMatchObject({ streak: 3, needsConfirm: false })
  })
  it('pasarse un día no rompe la racha; dos seguidos sí', () => {
    const one = reduceState(tabaco, [...ok(0, 1, 3), ...use(2, 4)], [], day(4))
    expect(one).toMatchObject({ streak: 3, atRisk: false })
    const two = reduceState(tabaco, [...ok(0, 1, 4), ...use(2, 4), ...use(3, 4)], [], day(5))
    expect(two.streak).toBe(1)
  })
  it('tras pasarse ayer, hoy queda en riesgo; si hoy también, ya no', () => {
    expect(reduceState(tabaco, [...ok(0, 1, 2), ...use(3, 4)], [], day(4))).toMatchObject({ atRisk: true, over: false, streak: 3 })
    expect(reduceState(tabaco, [...ok(0, 1, 2), ...use(3, 4), ...use(4, 4)], [], day(4))).toMatchObject({ atRisk: false, over: true, streak: 0 })
  })
  it('un cierre guardado no cambia aunque después cambie el plan', () => {
    const uses = [...use(0, 3), ...use(1, 3)]
    const frozen = freezeDays(tabaco, uses, [], [], day(2))
    expect(frozen).toEqual([{ habitId: 'x', date: MON, limit: 3, ok: true }, { habitId: 'x', date: day(1), limit: 3, ok: true }])
    const stricter = { ...tabaco, plan: buildPlan(1, 1, day(2)) } // plan nuevo: tope 1
    expect(reduceState(stricter, uses, [], day(2)).okDays).toEqual([])
    expect(reduceState(stricter, uses, [], day(2), frozen).okDays).toEqual([MON, day(1)])
  })
  it('dejarlo de golpe: tope cero desde el primer día', () => {
    const cold = { id: 'x', createdOn: MON, plan: buildPlan(5, 0, MON) }
    expect(cold.plan).toEqual({ stages: [], quitDate: MON })
    const s = reduceState(cold, [], [urge(0), urge(1)], day(2))
    expect(s).toMatchObject({ limit: 0, cold: true, quit: true, streak: 2, over: false })
    expect(reduceState(cold, use(2), [], day(2)).over).toBe(true)
  })
  it('los días en pausa sin registros no cuentan ni rompen', () => {
    const s = reduceState(tabaco, ok(0, 1), [], day(6), [], [{ from: day(2), to: day(5) }])
    expect(s).toMatchObject({ streak: 2, needsConfirm: false })
    expect(s.okDays).toEqual([MON, day(1)])
  })
  it('desde la fecha final el tope es cero', () => {
    const s = reduceState(tabaco, use(14), [], day(14))
    expect(s).toMatchObject({ limit: 0, quit: true, over: true, daysToQuit: 0 })
    expect(reduceState(tabaco, [], [], day(10)).daysToQuit).toBe(4)
  })
})

describe('votos', () => {
  const base = { tramaId: 't', name: 'x', moment: 'morning' as const, rhythm: daily, createdOn: MON, createdAt: 0, archived: false }
  const tabaco: Habit = { ...base, id: 'x', kind: 'reduce', plan: buildPlan(3, 2, MON) }
  const leer: Habit = { ...base, id: 'l' }

  it('un hábito de varias veces al día suma un voto por cada vez', () => {
    const logs: Log[] = [{ habitId: 'l', date: MON, state: 'full', at: 0, slots: ['morning', 'night'] }, { habitId: 'l', date: day(1), state: 'full', at: 0 }]
    expect(collectVotes([leer], logs, [], [], day(2))).toHaveLength(3)
  })
  it('suman hábitos cumplidos, antojos resistidos y días cerrados dentro del tope', () => {
    const logs: Log[] = [{ habitId: 'l', date: MON, state: 'full', at: 0 }]
    const uses: Use[] = Array.from({ length: 4 }, () => ({ habitId: 'x', date: day(1), at: 0 })) // martes se pasó
    const urges: Urge[] = [{ habitId: 'x', date: day(2), at: 0 }]
    const closures = [{ habitId: 'x', date: MON, limit: 3, ok: true }] // el lunes se confirmó
    const votes = collectVotes([tabaco, leer], logs, uses, urges, day(3), closures)
    // 1 hábito + 1 antojo + lunes (confirmado) y miércoles (registrado) dentro del tope
    expect(votes).toHaveLength(4)
    expect(votes.filter((v) => v.habitId === 'x').map((v) => v.date).sort()).toEqual([MON, day(2), day(2)])
    // Sin confirmar, el lunes no vota.
    expect(collectVotes([tabaco, leer], logs, uses, urges, day(3))).toHaveLength(3)
  })
  it('pasarse hoy no quita votos ya ganados', () => {
    const past: Use[] = [0, 1, 2].map((n) => ({ habitId: 'x', date: day(n), at: 0 }))
    const before = collectVotes([tabaco], [], past, [], day(3)).length
    expect(before).toBe(3)
    const uses: Use[] = [...past, ...Array.from({ length: 9 }, () => ({ habitId: 'x', date: day(3), at: 0 }))]
    expect(collectVotes([tabaco], [], uses, [], day(3)).length).toBe(before)
  })
  it('lo que se deja aparece aparte y no entra en el avance del día', () => {
    const v = buildToday([tabaco, leer], [], [], day(1))
    expect(v.reduce.map((r) => r.habit.id)).toEqual(['x'])
    expect(v.sections.flatMap((s) => s.items).map((i) => i.habit.id)).toEqual(['l'])
    expect(v).toMatchObject({ total: 1, totalVotes: 0, hasHabits: true })
    expect(v.reduce[0].state.needsConfirm).toBe(true)
  })
})

describe('pendientes', () => {
  const todo = (id: string, due?: number, done = false, doneAt?: number): Todo => ({
    id, title: id, due: due === undefined ? undefined : day(due), done, doneAt, createdAt: id.charCodeAt(0),
  })
  const all = [todo('a', 5), todo('b', 3), todo('c'), todo('d', 1), todo('e', 3), todo('f', 2, true, 10), todo('g', undefined, true, 20), todo('h', 30)]

  it('agrupa en atrasados, hoy, próximos, sin fecha y hechos, ordenados', () => {
    const g = groupTodos(all, day(3))
    expect(g.overdue.map((t) => t.id)).toEqual(['d'])
    expect(g.today.map((t) => t.id)).toEqual(['b', 'e'])
    expect(g.upcoming.map((t) => t.id)).toEqual(['a', 'h'])
    expect(g.undated.map((t) => t.id)).toEqual(['c'])
    expect(g.done.map((t) => t.id)).toEqual(['g', 'f'])
  })
  it('en Hoy van los atrasados, los de hoy y los de la próxima semana', () => {
    expect(todosForToday(all, day(3)).map((t) => t.id)).toEqual(['d', 'b', 'e', 'a'])
  })
  it('nombra la fecha según lo cerca que está', () => {
    const label = (n: number) => dueLabel(day(n), day(3)) // hoy es jueves 4 de enero
    expect([3, 4, 2].map(label)).toEqual(['Hoy', 'Mañana', 'Ayer'])
    expect(label(8)).toBe('Martes 9')
    expect(label(10)).toBe('11 ene')
    expect(label(0)).toBe('1 ene')
  })
})

describe('progreso', () => {
  const v = (...ns: number[]) => ns.map((n) => ({ date: day(n) }))

  it('acumula votos día a día, partiendo de lo anterior al rango', () => {
    const s = cumulativeSeries(v(0, 0, 1, 3, 3, 3), day(1), day(4))
    expect(s.map((p) => [p.total, p.added])).toEqual([[3, 1], [3, 0], [6, 3], [6, 0]])
    expect(s[0].date).toBe(day(1))
  })
  it('compara esta semana con la anterior', () => {
    expect(weekCompare(v(0, 1, 6, 7, 8, 8, 20), day(9))).toEqual({ thisWeek: 3, lastWeek: 3 })
  })
  it('cuenta días con al menos un voto', () => {
    expect(activeDays(v(0, 0, 1, 5))).toBe(3)
  })
  it('constancia de días fijos: hecho sobre lo que tocaba, sin castigar hoy pendiente', () => {
    const h: Habit = { id: 'h', tramaId: 't', name: 'h', moment: 'morning', rhythm: { kind: 'days', days: [0, 2, 4] }, createdOn: MON, createdAt: 0, archived: false }
    // lunes y viernes hechos, miércoles fallado; hoy es el lunes siguiente, pendiente
    expect(habitRate(h, set(0, 4), day(7))).toEqual({ done: 2, expected: 3, ratio: 2 / 3 })
    expect(habitRate(h, set(0, 4, 7), day(7))).toMatchObject({ done: 3, expected: 4 })
  })
  it('constancia de meta semanal: veces hechas sobre las esperadas en el período', () => {
    const h: Habit = { id: 'h', tramaId: 't', name: 'h', moment: 'morning', rhythm: { kind: 'quota', period: 'week', times: 2 }, createdOn: MON, createdAt: 0, archived: false }
    expect(habitRate(h, set(0, 3, 8), day(13))).toEqual({ done: 3, expected: 4, ratio: 0.75 })
  })
  it('encuentra la mejor racha aunque ya se haya roto', () => {
    const done = set(0, 1, 2, 3, 4, 9, 10)
    expect(computeStreak(habit(daily), done, day(10)).current).toBe(2)
    expect(bestStreak(habit(daily), done, day(10))).toBe(5)
  })
  it('mejor racha de un hábito semanal, en semanas', () => {
    const twice: Rhythm = { kind: 'quota', period: 'week', times: 2 }
    expect(bestStreak(habit(twice), set(0, 1, 7, 8, 14, 15, 42, 43), day(44))).toBe(3)
  })
  it('arma el mes en filas de lunes a domingo', () => {
    const feb = monthGrid('2024-02-01') // parte un jueves, 29 días
    expect(feb).toHaveLength(35)
    expect(feb.slice(0, 4)).toEqual([null, null, null, '2024-02-01'])
    expect(feb.filter(Boolean)).toHaveLength(29)
    expect(monthGrid(MON)[0]).toBe(MON)
  })
})

describe('recordatorios', () => {
  const trama = { id: 't', name: 'Cuidar mi cuerpo', color: 'teal' as const, order: 0, createdAt: 0 }
  const base = { tramaId: 't', moment: 'morning' as const, rhythm: daily, createdOn: MON, archived: false }
  const dientes: Habit = { ...base, id: 'd', name: 'Lavarme los dientes', createdAt: 1, remindAt: '08:00', cue: 'desayunar' }
  const leer: Habit = { ...base, id: 'l', name: 'Leer', createdAt: 2, remindAt: '21:00', minVersion: 'Leer una página' }
  const cama: Habit = { ...base, id: 'c', name: 'Hacer la cama', createdAt: 3 } // sin hora propia
  const on = { enabled: true, rescue: true, rescueAt: '20:30' }
  const log = (habitId: string, n: number): Log => ({ habitId, date: day(n), state: 'full', at: 0 })
  const noComeback = (rs: ReturnType<typeof planReminders>) => rs.filter((r) => r.kind !== 'comeback')
  const plan = (logs: Log[], now: string, settings = on, days = 1) =>
    noComeback(planReminders([dientes, leer, cama], [trama], logs, settings, day(3), now, days))

  it('apagados no programan nada', () => {
    expect(plan([], '07:00', { ...on, enabled: false })).toEqual([])
  })
  it('programa cada hábito a su hora y un rescate, en orden', () => {
    const r = plan([log('d', 2), log('l', 2), log('c', 2)], '07:00')
    expect(r.map((x) => [x.time, x.kind])).toEqual([['08:00', 'habit'], ['20:30', 'rescue'], ['21:00', 'habit']])
    expect(r[0].title).toBe('Lavarme los dientes, después de desayunar')
    expect(r[0].body).toBe('Un voto más por Cuidar mi cuerpo.')
    expect(r[1].title).toBe('Te quedan 3 por hoy')
    expect(r[2].body).toBe('Si hoy cuesta, basta con esto: leer una página.')
  })
  it('hoy se salta lo ya cumplido y las horas que ya pasaron', () => {
    const r = plan([log('d', 3), log('d', 2), log('l', 2), log('c', 2)], '12:00')
    expect(r.map((x) => x.kind + x.time)).toEqual(['rescue20:30', 'habit21:00'])
    expect(r[0].title).toBe('Te quedan 2 por hoy')
  })
  it('sin nada pendiente no hay rescate; con uno, lo nombra', () => {
    const allDone = [log('d', 3), log('l', 3), log('c', 3)]
    expect(plan(allDone, '12:00')).toEqual([])
    expect(plan(allDone.slice(0, 2), '12:00')[0].title).toBe('Te queda hacer la cama')
  })
  it('si ayer se falló, el aviso lo dice', () => {
    const r = plan([log('d', 1), log('l', 1), log('l', 2), log('c', 2)], '07:00') // dientes faltó ayer
    expect(r[0].body).toBe('Ayer faltaste. Hoy es el que cuenta.')
    expect(r.find((x) => x.kind === 'rescue')!.body).toBe('Lavarme los dientes: ayer faltaste. Hoy es el que cuenta.')
  })
  it('para los días siguientes asume todo pendiente y respeta los días programados', () => {
    const lmv: Habit = { ...dientes, rhythm: { kind: 'days', days: [0, 2, 4] } } // hoy es jueves
    const r = noComeback(planReminders([lmv], [trama], [], { ...on, rescue: false }, day(3), '23:00', 5))
    expect(r.map((x) => x.date)).toEqual([day(4), day(7)])
    expect(new Set(r.map((x) => x.id)).size).toBe(2)
  })
  it('lo que se está dejando no genera avisos', () => {
    const tabaco: Habit = { ...base, id: 'x', name: 'Tabaco', createdAt: 9, kind: 'reduce', remindAt: '10:00' }
    expect(planReminders([tabaco], [trama], [], on, day(3), '07:00', 2)).toEqual([])
  })
  it('un hábito de varias veces al día avisa por cada momento pendiente', () => {
    const tres: Habit = { ...base, id: 'd', name: 'Dientes', createdAt: 1, slots: [
      { moment: 'morning', cue: 'desayunar', remindAt: '08:00' }, { moment: 'afternoon', remindAt: '14:00' }, { moment: 'night', cue: 'cenar', remindAt: '22:00' },
    ] }
    const logs: Log[] = [{ habitId: 'd', date: day(3), state: 'full', at: 0, slots: ['morning'] }, { habitId: 'd', date: day(2), state: 'full', at: 0, slots: ['night'] }]
    const r = noComeback(planReminders([tres], [trama], logs, on, day(3), '07:00', 1))
    expect(r.map((x) => [x.time, x.kind, x.slot])).toEqual([['14:00', 'habit', 'afternoon'], ['20:30', 'rescue', undefined], ['22:00', 'habit', 'night']])
    expect(r[1].title).toBe('Te quedan 2 por hoy')
    expect(r[2].title).toBe('Dientes, después de cenar')
    expect(new Set(r.map((x) => x.id)).size).toBe(3)
  })
  it('un hábito con meta semanal avisa solo cuando los días empiezan a apretar', () => {
    const boxeo: Habit = { ...base, id: 'b', name: 'Boxeo', createdAt: 8, rhythm: { kind: 'quota', period: 'week', times: 2 }, remindAt: '18:00' }
    // Hoy es jueves 4; faltan 2. Avisa desde el viernes (quedan 3 días) hasta el domingo.
    const r = noComeback(planReminders([boxeo], [trama], [], { ...on, rescue: false }, day(3), '07:00', 4))
    expect(r.map((x) => x.date)).toEqual([day(4), day(5), day(6)])
    expect(r[0].body).toBe('Te faltan 2 veces esta semana.')
    expect(r[1].body).toBe('Quedan 2 días y te faltan 2 esta semana.')
    // Con la meta cumplida no avisa.
    const done = [log('b', 0), log('b', 1)]
    expect(noComeback(planReminders([boxeo], [trama], done, { ...on, rescue: false }, day(3), '07:00', 4))).toEqual([])
  })
  it('en pausa no hay avisos', () => {
    const r = noComeback(planReminders([dientes], [trama], [], on, day(3), '07:00', 3, [{ from: day(3), to: day(4) }]))
    expect(r.map((x) => x.date)).toEqual([day(5), day(5)])
  })
  it('deja dos avisos de regreso, a los 3 y a los 7 días, por si la app no se vuelve a abrir', () => {
    const r = planReminders([dientes], [trama], [], on, day(3), '07:00', 1).filter((x) => x.kind === 'comeback')
    expect(r.map((x) => [x.date, x.time])).toEqual([[day(6), '19:00'], [day(10), '19:00']])
  })
})

describe('respaldo', () => {
  const data = {
    tramas: [{ id: 't', name: 'A', color: 'teal' as const, order: 0, createdAt: 0 }],
    habits: [{ id: 'h', tramaId: 't', name: 'H', moment: 'morning' as const, rhythm: daily, createdOn: MON, createdAt: 0, archived: false }],
    logs: [{ habitId: 'h', date: MON, state: 'full' as const, at: 0 }],
    uses: [], urges: [], todos: [{ id: 'p', title: 'Dentista', done: false, createdAt: 0 }], meta: [{ key: 'reminders', value: { enabled: true } }],
    closures: [{ habitId: 'h', date: MON, limit: 3, ok: true }],
  }
  const text = JSON.stringify(buildBackup(data, new Date('2024-01-05T10:00:00Z')))

  it('lo que se exporta se puede volver a leer igual', () => {
    const r = parseBackup(text)
    expect(r.ok && r.backup.data).toEqual(data)
    expect(r.ok && describeBackup(r.backup)).toBe('1 trama, 1 hábito y 1 registro')
  })
  it('rechaza archivos que no son un respaldo', () => {
    expect(parseBackup('hola')).toEqual({ ok: false, error: 'El archivo no es un respaldo de Vagabond.' })
    expect(parseBackup('{"app":"otra","data":{}}')).toMatchObject({ ok: false })
    expect(parseBackup('[1,2]')).toMatchObject({ ok: false })
  })
  it('rechaza versiones futuras y datos incoherentes', () => {
    expect(parseBackup(text.replace('"version":1', '"version":2'))).toEqual({ ok: false, error: 'Este respaldo es de una versión más nueva de Vagabond.' })
    const orphan = JSON.stringify(buildBackup({ ...data, logs: [{ habitId: 'no-existe', date: MON, state: 'full', at: 0 }] }, new Date()))
    expect(parseBackup(orphan)).toEqual({ ok: false, error: 'El respaldo está dañado.' })
    const noTrama = JSON.stringify(buildBackup({ ...data, tramas: [] }, new Date()))
    expect(parseBackup(noTrama)).toMatchObject({ ok: false })
  })
  it('acepta respaldos sin las tablas más nuevas', () => {
    const old = JSON.parse(text)
    delete old.data.todos
    delete old.data.meta
    delete old.data.closures
    const r2 = parseBackup(JSON.stringify(old))
    expect(r2.ok && [r2.backup.data.todos, r2.backup.data.closures]).toEqual([[], []])
  })
})


describe('pausas y cambios de ritmo', () => {
  it('los días en pausa no rompen la racha ni suman', () => {
    const pauses = [{ from: day(3), to: day(8) }]
    expect(computeStreak(habit(daily), set(0, 1, 2), day(9)).current).toBe(0)
    expect(computeStreak(habit(daily), set(0, 1, 2), day(9), pauses)).toMatchObject({ current: 3, atRisk: false, missedLast: false })
    expect(computeStreak(habit(daily), set(0, 1, 2, 5), day(9), pauses).current).toBe(4)
  })
  it('con pausa abierta, hoy no está pendiente', () => {
    const s = computeStreak(habit(daily), set(0), day(3), [{ from: day(2) }])
    expect(s).toMatchObject({ current: 1, atRisk: false })
  })
  it('una semana con pausa no cuenta como semana fallada', () => {
    const twice: Rhythm = { kind: 'quota', period: 'week', times: 2 }
    const done = set(0, 1, 7, 8, 28, 29) // semanas 1 y 2 cumplidas, 3 y 4 vacías, 5 cumplida
    expect(computeStreak(habit(twice), done, day(29)).current).toBe(1)
    expect(computeStreak(habit(twice), done, day(29), [{ from: day(14), to: day(27) }]).current).toBe(3)
  })
  it('cambiar el ritmo rige desde ese día y conserva la racha que se traía', () => {
    // Era diario con 5 días seguidos; el día 5 pasa a lunes, miércoles y viernes.
    const h = { rhythm: { kind: 'days', days: [0, 2, 4] } as Rhythm, createdOn: MON, rhythmSince: day(5), streakCarry: 5 }
    // El martes de la semana anterior no se reinterpreta como "no programado".
    expect(computeStreak(h, set(0, 1, 2, 3, 4), day(6)).current).toBe(5)
    expect(computeStreak(h, set(0, 1, 2, 3, 4, 7), day(7)).current).toBe(6)
    // Dos fallos seguidos con el ritmo nuevo: la racha traída también se pierde.
    expect(computeStreak(h, set(0, 1, 2, 3, 4), day(11)).current).toBe(0)
  })
})

describe('varias veces al día', () => {
  const trama = { id: 't', name: 'Cuidar mi cuerpo', color: 'teal' as const, order: 0, createdAt: 0 }
  const dientes: Habit = {
    id: 'd', tramaId: 't', name: 'Dientes', moment: 'morning', rhythm: daily, createdOn: MON, createdAt: 1, archived: false,
    slots: [{ moment: 'morning', cue: 'desayunar' }, { moment: 'afternoon', cue: 'almorzar' }, { moment: 'night' }],
  }
  const cama: Habit = { id: 'c', tramaId: 't', name: 'Cama', moment: 'morning', rhythm: daily, createdOn: MON, createdAt: 2, archived: false, anchorId: 'd' }

  it('aparece una vez en cada momento, y cada una cuenta en el avance del día', () => {
    const logs: Log[] = [{ habitId: 'd', date: day(1), state: 'full', at: 0, slots: ['morning'] }]
    const v = buildToday([dientes, cama], [trama], logs, day(1))
    expect(v.sections.map((s) => [s.id, s.items.map((i) => i.key), s.done])).toEqual([
      ['morning', ['d:morning', 'c'], 1], ['afternoon', ['d:afternoon'], 0], ['night', ['d:night'], 0],
    ])
    expect(v).toMatchObject({ done: 1, total: 4, totalVotes: 1 })
    const [first] = v.sections[0].items
    expect(first).toMatchObject({ doneToday: true, cue: 'desayunar', slot: 'morning', multi: { done: 1, total: 3 } })
    expect(v.sections[0].items[1].linked).toBe(true)
  })
  it('con al menos una vez el día cuenta para la racha', () => {
    const logs: Log[] = [
      { habitId: 'd', date: MON, state: 'full', at: 0, slots: ['morning', 'night'] },
      { habitId: 'd', date: day(1), state: 'full', at: 0, slots: ['afternoon'] },
    ]
    const item = buildToday([dientes], [trama], logs, day(1)).sections[1].items[0]
    expect(item.streak.current).toBe(2)
    expect(item.doneToday).toBe(true)
  })
  it('en pausa no se exige nada, pero lo ya marcado sigue visible', () => {
    const logs: Log[] = [{ habitId: 'c', date: day(1), state: 'full', at: 0 }]
    const v = buildToday([dientes, cama], [trama], logs, day(1), [], [], { pauses: [{ from: day(1) }] })
    expect(v.paused).toBe(true)
    expect(v.sections.flatMap((s) => s.items).map((i) => i.key)).toEqual(['c'])
  })
  it('el orden manual manda sobre la fecha de creación', () => {
    const a: Habit = { ...cama, id: 'a', anchorId: undefined, order: 5 }
    const b: Habit = { ...cama, id: 'b', anchorId: undefined, createdAt: 99, order: 1 }
    expect(buildToday([a, b], [trama], [], MON).sections[0].items.map((i) => i.key)).toEqual(['b', 'a'])
  })
})

describe('tramas dobles y constelación', () => {
  const t1 = { id: 't1', name: 'Vida sana', color: 'teal' as const, order: 0, createdAt: 0 }
  const t2 = { id: 't2', name: 'Dueño de mí', color: 'lila' as const, order: 1, createdAt: 1 }
  const h = (id: string, extra: Partial<Habit> = {}): Habit => ({
    id, tramaId: 't1', name: id, moment: 'morning', rhythm: daily, createdOn: MON, createdAt: id.charCodeAt(0), archived: false, ...extra,
  })
  const habits = [h('a'), h('b', { tramaId2: 't2' }), h('c', { tramaId: 't2', anchorId: 'a' })]
  const votes = [{ habitId: 'a' }, { habitId: 'b' }, { habitId: 'b' }, { habitId: 'c' }]

  it('un hábito en dos tramas suma a las dos, y una sola vez al total', () => {
    const stats = tramaStats([t1, t2], habits, votes)
    expect(stats.map((s) => [s.trama.id, s.votes, s.habits.map((x) => x.id)])).toEqual([['t1', 3, ['a', 'b']], ['t2', 3, ['b', 'c']]])
    expect(votes).toHaveLength(4)
  })
  it('la constelación es estable: los mismos datos dan las mismas posiciones', () => {
    const stats = tramaStats([t1, t2], habits, votes)
    const count = (id: string) => votes.filter((v) => v.habitId === id).length
    const one = layoutConstellation(stats, count, 350)
    expect(layoutConstellation(stats, count, 350)).toEqual(one)
    expect(one.nodes.map((n) => n.habit.id)).toEqual(['a', 'b', 'c']) // cada hábito una sola vez, en su trama principal
    expect(one.edges).toEqual([{ a: 'a', b: 'b', color: 'teal' }])
    expect(one.stacks).toEqual([{ a: 'a', b: 'c' }])
    expect(one.bridges.map((b) => [b.habitId, b.color])).toEqual([['b', 'lila']])
    for (const n of one.nodes) expect(n.x - n.r >= 0 && n.x + n.r <= 350 && n.r >= 20).toBe(true)
    const [a, b] = one.nodes
    expect(b.r).toBeGreaterThan(a.r) // más votos, nodo más grande
  })
})

describe('capítulos semanales', () => {
  const trama = { id: 't', name: 'Cuidar mi cuerpo', color: 'teal' as const, order: 0, createdAt: 0 }
  const leer: Habit = { id: 'l', tramaId: 't', name: 'Leer', moment: 'night', rhythm: daily, createdOn: MON, createdAt: 1, archived: false }
  const log = (n: number, state: 'full' | 'min' = 'full'): Log => ({ habitId: 'l', date: day(n), state, at: 0 })
  const data = (logs: Log[]): ChapterData => ({ habits: [leer], tramas: [trama], logs, uses: [], urges: [], closures: [], pauses: [], todos: [] })

  it('numera las semanas cerradas desde la primera, de la más nueva a la más vieja', () => {
    const c = buildChapters(data([log(0), log(8)]), day(15))
    expect(c.map((x) => [x.number, x.start, x.votes])).toEqual([[2, day(7), 1], [1, MON, 1]])
    expect(buildChapters(data([]), day(3))).toEqual([]) // la semana en curso todavía no es capítulo
  })
  it('cuenta votos, caídas y regresos', () => {
    // Semana 2: falla martes y viernes, y vuelve al día siguiente las dos veces.
    const c = buildChapter(data([0, 1, 2, 7, 9, 10, 12, 13].map((d) => log(d))), day(7), 2)
    expect(c.votes).toBe(5)
    expect(c.title).toBe('Caer y volver')
    expect(c.lines[0]).toBe('Sumaste 5 votos en 5 días, 2 más que la semana anterior.')
    expect(c.lines[1]).toBe('Fallaste 2 veces y todas volviste a la siguiente. Eso es no fallar dos veces.')
  })
  it('una semana sin votos lo dice sin castigar', () => {
    const c = buildChapter(data([log(0)]), day(7), 2)
    expect(c).toMatchObject({ votes: 0, title: 'Una semana en blanco' })
  })
  it('sugiere subir un paso cuando casi todo fue la versión de 2 minutos', () => {
    const c = buildChapter(data([0, 1, 2, 3, 4].map((d) => log(d, 'min'))), MON, 1)
    expect(c.lines.some((l) => l.startsWith('Leer: 5 de 5 veces fue la versión de 2 minutos.'))).toBe(true)
  })
})

describe('el 1% diario', () => {
  const base = { tramaId: 't', moment: 'morning' as const, rhythm: daily, createdOn: MON, archived: false }
  const a: Habit = { ...base, id: 'a', name: 'A', createdAt: 1 }
  const b: Habit = { ...base, id: 'b', name: 'B', createdAt: 2 }
  const log = (habitId: string, n: number): Log => ({ habitId, date: day(n), state: 'full', at: 0 })
  const data = (habits: Habit[], logs: Log[], extra: Partial<GrowthData> = {}): GrowthData => ({ habits, logs, uses: [], urges: [], closures: [], pauses: [], ...extra })
  const factors = (s: ReturnType<typeof growthSeries>) => s.map((d) => +d.factor.toFixed(4))

  it('un día cumplido suma 1%, uno a medias suma la mitad y uno en blanco resta 1%', () => {
    const s = growthSeries(data([a, b], [log('a', 0), log('b', 0), log('a', 1)]), day(3))
    expect(factors(s)).toEqual([1.01, 1.005, 0.99, 1]) // hoy pendiente no resta
    expect(s[2].value).toBeCloseTo(1.01 * 1.005 * 0.99, 10)
    expect(s[3]).toMatchObject({ done: 0, total: 2 })
  })
  it('los días se multiplican: 30 días seguidos son más que 30%', () => {
    const logs = Array.from({ length: 30 }, (_, n) => log('a', n))
    const s = growthSeries(data([a], logs), day(30))
    expect(s[29].value).toBeCloseTo(Math.pow(1.01, 30), 10)
    expect(s[29].value).toBeGreaterThan(1.3)
    expect(s[29].ideal).toBeCloseTo(s[29].value, 10)
  })
  it('hoy puede sumar antes de terminar', () => {
    expect(factors(growthSeries(data([a, b], [log('a', 0)]), MON))).toEqual([1.005])
  })
  it('los días sin nada programado y los días en pausa no mueven la curva', () => {
    const lmv: Habit = { ...a, rhythm: { kind: 'days', days: [0, 2, 4] } }
    expect(factors(growthSeries(data([lmv], [log('a', 0)]), day(2)))).toEqual([1.01, 1, 1])
    const paused = growthSeries(data([a], [log('a', 0)], { pauses: [{ from: day(1), to: day(2) }] }), day(4))
    expect(factors(paused)).toEqual([1.01, 1, 1, 0.99, 1])
  })
  it('varias veces al día cuenta en proporción, y el tabaco solo los días con registro', () => {
    const tres: Habit = { ...a, slots: [{ moment: 'morning' }, { moment: 'afternoon' }, { moment: 'night' }] }
    const logs: Log[] = [{ habitId: 'a', date: MON, state: 'full', at: 0, slots: ['morning', 'night'] }]
    expect(growthSeries(data([tres], logs), day(1))[0]).toMatchObject({ done: 2, total: 3 })
    const tabaco: Habit = { ...base, id: 'x', name: 'Tabaco', createdAt: 3, kind: 'reduce', plan: buildPlan(3, 2, MON) }
    const uses: Use[] = [{ habitId: 'x', date: MON, at: 0 }, ...Array.from({ length: 5 }, () => ({ habitId: 'x', date: day(1), at: 0 }))]
    // lunes dentro del tope, martes sobre el tope, miércoles sin registro
    expect(factors(growthSeries(data([tabaco], [], { uses }), day(3)))).toEqual([1.01, 0.99, 1, 1])
  })
  it('proyecta un año a partir del ritmo reciente, con al menos una semana de datos', () => {
    const logs = Array.from({ length: 10 }, (_, n) => log('a', n))
    const s = growthSeries(data([a], logs), day(10))
    expect(yearProjection(s, day(10))).toBeCloseTo(Math.pow(1.01, 365), 6) // ≈ 37,8
    expect(yearProjection(s.slice(0, 5), day(4))).toBeNull()
    expect(formatTimes(37.78)).toBe('×37,8')
    expect(formatTimes(1.234)).toBe('×1,23')
    expect([formatPct(1.032), formatPct(0.99)]).toEqual(['+3,2%', '−1,0%'])
  })
})
