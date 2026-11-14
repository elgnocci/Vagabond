import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useData, useToast, useToday } from '../db/hooks'
import { addDays, type ISODate } from '../domain/dates'
import { activeDays, bestStreak, cumulativeSeries, habitRate, reduceRate, weekCompare } from '../domain/progress'
import { collectVotes, reduceState } from '../domain/reduce'
import { computeStreak } from '../domain/streaks'
import { tramaStats } from '../domain/tramas'
import { HabitDetail } from '../ui/HabitDetail'
import { LineChart } from '../ui/LineChart'
import { Sheet } from '../ui/Sheet'
import { LoadingState } from '../ui/States'

type Range = '30' | '90' | 'all'
const RANGES: { id: Range; label: string }[] = [{ id: '30', label: '30 días' }, { id: '90', label: '90 días' }, { id: 'all', label: 'Todo' }]
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function Progreso() {
  const data = useData()
  const today = useToday()
  const [range, setRange] = useState<Range>('30')
  const [open, setOpen] = useState<{ open: boolean; id?: string }>({ open: false })
  const [toast, setToast] = useToast()

  const m = useMemo(() => {
    if (!data) return undefined
    const votes = collectVotes(data.habits, data.logs, data.uses, data.urges, today)
    const habits = data.habits.filter((h) => !h.archived)
    const first = habits.reduce<ISODate>((min, h) => (h.createdOn < min ? h.createdOn : min), today)
    const doneOf = (id: string) => new Set(data.logs.filter((l) => l.habitId === id).map((l) => l.date))

    const rows = habits.map((h) => {
      const trama = data.tramas.find((t) => t.id === h.tramaId)
      if (h.kind === 'reduce') {
        const s = reduceState(h, data.uses, data.urges, today)
        return { habit: h, trama, rate: reduceRate(h, data.uses, today), streak: plural(s.streak, 'día', 'días'), best: 0, daily: false }
      }
      const done = doneOf(h.id)
      const s = computeStreak(h, done, today)
      const unit = s.unit === 'days' ? ['día', 'días'] : s.unit === 'weeks' ? ['sem', 'sem'] : ['mes', 'meses']
      return {
        habit: h, trama, rate: habitRate(h, done, today), streak: plural(s.current, unit[0], unit[1]),
        best: h.rhythm.kind === 'days' ? bestStreak(h, done, today) : 0, daily: h.rhythm.kind === 'days',
      }
    })
    const top = rows.filter((r) => r.daily).sort((a, b) => b.best - a.best)[0]

    return {
      votes, first, rows, top,
      week: weekCompare(votes, today),
      active: activeDays(votes),
      tramas: tramaStats(data.tramas, data.habits, votes),
    }
  }, [data, today])

  const series = useMemo(() => {
    if (!m) return []
    const wanted = range === 'all' ? m.first : addDays(today, range === '30' ? -29 : -89)
    // Al menos una semana de eje, aunque la app sea nueva.
    const from = range === 'all' && wanted > addDays(today, -6) ? addDays(today, -6) : wanted
    return cumulativeSeries(m.votes, from, today)
  }, [m, range, today])

  const current = data?.habits.find((h) => h.id === open.id)
  const diff = m ? m.week.thisWeek - m.week.lastWeek : 0
  const maxTrama = m ? Math.max(1, ...m.tramas.map((t) => t.votes)) : 1

  return (
    <main className="screen">
      <header className="head"><h1 className="mono">Progreso</h1></header>
      <p className="title">Tu historia hasta hoy</p>

      {!m ? (
        <LoadingState />
      ) : m.votes.length === 0 ? (
        <div className="state" style={{ paddingTop: '8vh' }}>
          <h2>La historia aún no empieza.</h2>
          <p>Cuando sumes tu primer voto, aquí vas a ver cómo se acumulan: uno por cada vez que elegiste ser quien quieres ser.</p>
        </div>
      ) : (
        <>
          <div className="tiles" style={{ marginTop: 0 }}>
            <div className="on-bg"><b>{m.week.thisWeek}</b><span>votos esta semana{diff !== 0 && m.week.lastWeek > 0 ? `, ${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'} que la pasada` : ''}</span></div>
            <div className="on-bg"><b>{m.active}</b><span>{m.active === 1 ? 'día' : 'días'} con al menos un voto</span></div>
            <div className="on-bg"><b>{m.top?.best ?? 0}</b><span>{m.top && m.top.best > 0 ? `días, tu mejor racha: ${m.top.habit.name}` : 'días de mejor racha'}</span></div>
          </div>

          <section className="panel" aria-labelledby="c-acum">
            <div className="panel-h">
              <h2 id="c-acum">Votos acumulados</h2>
              <div className="segm sm" role="group" aria-label="Período">
                {RANGES.map((r) => (
                  <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                    {range === r.id && <motion.i layoutId="rango" className="thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <LineChart points={series} />
          </section>

          {m.tramas.length > 0 && (
            <section className="panel" aria-labelledby="c-tramas">
              <div className="panel-h"><h2 id="c-tramas">Votos por trama</h2></div>
              {m.tramas.map((t) => (
                <div className="hbar" key={t.trama.id} data-color={t.trama.color}>
                  <div><span>{t.trama.name}</span><b>{t.votes}</b></div>
                  <i><motion.u initial={false} animate={{ scaleX: t.votes / maxTrama }} transition={{ type: 'spring', stiffness: 160, damping: 26 }} /></i>
                </div>
              ))}
            </section>
          )}

          <div className="sec-h"><h2>Constancia, últimos 30 días</h2></div>
          {m.rows.map((r) => (
            <motion.button key={r.habit.id} className="rate" data-color={r.trama?.color ?? 'teal'} whileTap={{ scale: 0.98 }}
              onClick={() => setOpen({ open: true, id: r.habit.id })} aria-label={`${r.habit.name}: ${Math.round(r.rate.ratio * 100)} por ciento, racha de ${r.streak}. Ver historial.`}>
              <span className="top"><b>{r.habit.name}</b><span>{r.rate.expected ? `${Math.round(r.rate.ratio * 100)}%` : 'Nuevo'}</span></span>
              <i><u style={{ transform: `scaleX(${r.rate.ratio})` }} /></i>
              <span className="bot"><span>{r.rate.expected ? `${r.rate.done} de ${r.rate.expected}` : 'Aún sin días cerrados'}</span><span>Racha: {r.streak}</span></span>
            </motion.button>
          ))}
        </>
      )}

      <Sheet open={open.open && !!current} label="Historial del hábito" onClose={() => setOpen((o) => ({ ...o, open: false }))}>
        {current && data && <HabitDetail key={current.id} habit={current} data={data} today={today} onError={setToast} />}
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="alert" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
