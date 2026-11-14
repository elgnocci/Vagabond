import { describe, expect, it } from 'vitest'
import { addDays, periodEnd, startOfWeek, weekdayMon } from './dates'
import { computeStreak } from './streaks'
import { buildToday, voteGrid } from './today'
import { dependsOn, milestoneProgress, rhythmText, tramaStats } from './tramas'
import { buildPlan, collectVotes, limitOn, reduceState } from './reduce'
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
  it('un día dentro del tope vale; hoy no cuenta hasta que termina', () => {
    const s = reduceState(tabaco, [...use(0, 3), ...use(1, 1), ...use(2, 1)], [], day(2))
    expect(s.okDays).toEqual([MON, day(1)])
    expect(s.streak).toBe(2)
  })
  it('pasarse un día no rompe la racha; dos seguidos sí', () => {
    const one = reduceState(tabaco, use(2, 4), [], day(4))
    expect(one).toMatchObject({ streak: 3, atRisk: false })
    const two = reduceState(tabaco, [...use(2, 4), ...use(3, 4)], [], day(5))
    expect(two.streak).toBe(1)
  })
  it('tras pasarse ayer, hoy queda en riesgo; si hoy también, ya no', () => {
    expect(reduceState(tabaco, use(3, 4), [], day(4))).toMatchObject({ atRisk: true, over: false, streak: 3 })
    expect(reduceState(tabaco, [...use(3, 4), ...use(4, 4)], [], day(4))).toMatchObject({ atRisk: false, over: true, streak: 0 })
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

  it('suman hábitos cumplidos, antojos resistidos y días cerrados dentro del tope', () => {
    const logs: Log[] = [{ habitId: 'l', date: MON, state: 'full', at: 0 }]
    const uses: Use[] = Array.from({ length: 4 }, () => ({ habitId: 'x', date: day(1), at: 0 })) // martes se pasó
    const urges: Urge[] = [{ habitId: 'x', date: day(2), at: 0 }]
    const votes = collectVotes([tabaco, leer], logs, uses, urges, day(3))
    // 1 hábito + 1 antojo + lunes y miércoles dentro del tope
    expect(votes).toHaveLength(4)
    expect(votes.filter((v) => v.habitId === 'x').map((v) => v.date).sort()).toEqual([MON, day(2), day(2)])
  })
  it('pasarse hoy no quita votos ya ganados', () => {
    const before = collectVotes([tabaco], [], [], [], day(3)).length
    const uses: Use[] = Array.from({ length: 9 }, () => ({ habitId: 'x', date: day(3), at: 0 }))
    expect(collectVotes([tabaco], [], uses, [], day(3)).length).toBe(before)
  })
  it('lo que se deja aparece aparte y no entra en el avance del día', () => {
    const v = buildToday([tabaco, leer], [], [], day(1))
    expect(v.reduce.map((r) => r.habit.id)).toEqual(['x'])
    expect(v.sections.flatMap((s) => s.items).map((i) => i.habit.id)).toEqual(['l'])
    expect(v).toMatchObject({ total: 1, totalVotes: 1, hasHabits: true })
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
