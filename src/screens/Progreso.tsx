import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useData, useToast, useToday } from '../db/hooks'
import { buildChapters, type Chapter } from '../domain/chapters'
import { addDays, type ISODate } from '../domain/dates'
import { formatPct, formatTimes, growthSeries, yearProjection } from '../domain/growth'
import { activeDays, bestStreak, cumulativeSeries, habitRate, reduceRate, weekCompare } from '../domain/progress'
import { collectVotes, reduceState } from '../domain/reduce'
import { computeStreak } from '../domain/streaks'
import { tramaStats } from '../domain/tramas'
import { ChapterSheet } from '../ui/ChapterSheet'
import { GrowthChart } from '../ui/GrowthChart'
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
  const [chapter, setChapter] = useState<{ open: boolean; c?: Chapter }>({ open: false })
  const [toast, setToast] = useToast()

  const m = useMemo(() => {
    if (!data) return undefined
    const votes = collectVotes(data.habits, data.logs, data.uses, data.urges, today, data.closures, data.pauses)
    const habits = data.habits.filter((h) => !h.archived)
    const first = habits.reduce<ISODate>((min, h) => (h.createdOn < min ? h.createdOn : min), today)
    const doneOf = (id: string) => new Set(data.logs.filter((l) => l.habitId === id).map((l) => l.date))

    const rows = habits.map((h) => {
      const trama = data.tramas.find((t) => t.id === h.tramaId)
      if (h.kind === 'reduce') {
        const s = reduceState(h, data.uses, data.urges, today, data.closures, data.pauses)
        return { habit: h, trama, rate: reduceRate(h, data.uses, data.urges, data.closures, today, data.pauses), streak: plural(s.streak, 'día', 'días'), best: 0, daily: false }
      }
      const done = doneOf(h.id)
      const s = computeStreak(h, done, today, data.pauses)
      const unit = s.unit === 'days' ? ['día', 'días'] : s.unit === 'weeks' ? ['sem', 'sem'] : ['mes', 'meses']
      return {
        habit: h, trama, rate: habitRate(h, done, today, 30, data.pauses), streak: plural(s.current, unit[0], unit[1]),
        best: h.rhythm.kind === 'days' ? bestStreak(h, done, today, data.pauses) : 0, daily: h.rhythm.kind === 'days',
      }
    })
    const top = rows.filter((r) => r.daily).sort((a, b) => b.best - a.best)[0]

    return {
      votes, first, rows, top,
      week: weekCompare(votes, today),
      active: activeDays(votes),
      tramas: tramaStats(data.tramas, data.habits, votes),
      chapters: buildChapters(data, today, 8),
      growth: growthSeries(data, today),
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

          {m.growth.length > 0 && (() => {
            const now = m.growth[m.growth.length - 1]
            const year = yearProjection(m.growth, today)
            return (
              <section className="panel" aria-labelledby="c-uno">
                <div className="panel-h"><h2 id="c-uno">Tu 1% diario</h2><span className="mono">{formatPct(now.value)} desde el día 1</span></div>
                <div className="grow-n">{formatTimes(now.value)}</div>
                <p className="grow-s">
                  {year === null
                    ? 'Con una semana de días cerrados te muestro hacia dónde vas.'
                    : <>A tu ritmo del último mes, en un año serías <b>{formatTimes(year)}</b> quien eres hoy.</>}
                </p>
                <GrowthChart series={m.growth} today={today} />
                <p className="help">Cada día suma hasta 1% según lo que cumpliste, y un día en blanco resta 1%. Los días se multiplican: 1% diario durante un año es ×37,8.</p>
              </section>
            )
          })()}

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

          {m.chapters.length > 0 && (
            <>
              <div className="sec-h"><h2>Capítulos</h2><span>uno por semana</span></div>
              <div className="chapters">
                {m.chapters.map((c) => (
                  <motion.button key={c.start} className="chap" whileTap={{ scale: 0.97 }} onClick={() => setChapter({ open: true, c })}>
                    <small className="mono">Cap. {c.number} · {c.range}</small>
                    <b>{c.title}</b>
                    <span>{c.votes} {c.votes === 1 ? 'voto' : 'votos'}</span>
                  </motion.button>
                ))}
              </div>
            </>
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

      <Sheet open={chapter.open && !!chapter.c} label="Capítulo de la semana" onClose={() => setChapter((c) => ({ ...c, open: false }))}>
        {chapter.c && <ChapterSheet chapter={chapter.c} />}
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
