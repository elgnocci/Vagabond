import { useEffect, useMemo, useRef, useState } from 'react'
import { layoutConstellation, type TramaStats } from '../domain/tramas'

interface Props {
  stats: TramaStats[]
  votesOf: (habitId: string) => number
  /** Hábitos con al menos un voto hoy: sus nodos se ven encendidos. */
  lit: ReadonlySet<string>
  onHabit: (habitId: string) => void
  onTrama: (tramaId: string) => void
}

/**
 * El mapa de quién estás siendo: cada trama es una constelación y cada hábito, un nodo
 * que crece con sus votos. Las líneas unen hábitos de una trama, apilamientos y tramas compartidas.
 */
export function Constellation({ stats, votesOf, lit, onHabit, onTrama }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(350)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const c = useMemo(() => layoutConstellation(stats, votesOf, w), [stats, votesOf, w])
  const at = new Map(c.nodes.map((n) => [n.habit.id, n]))

  return (
    <div className="sky" ref={wrap} style={{ height: c.height }}>
      <svg width={w} height={c.height} aria-hidden="true">
        {c.edges.map((e) => {
          const a = at.get(e.a)!, b = at.get(e.b)!
          const on = lit.has(e.a) && lit.has(e.b)
          return <line key={`${e.a}-${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={on ? 'edge on' : 'edge'} data-color={e.color} />
        })}
        {c.bridges.map((br) => {
          const n = at.get(br.habitId)!
          return <path key={`br-${br.habitId}`} className="bridge" data-color={br.color}
            d={`M${n.x} ${n.y} C ${br.x - 6} ${n.y + 30}, ${br.x - 6} ${br.y - 70}, ${br.x} ${br.y}`} />
        })}
        {c.stacks.map((st) => {
          const a = at.get(st.a)!, b = at.get(st.b)!
          const c1 = { x: a.x + (b.x - a.x) * 0.15, y: a.y + (b.y - a.y) * 0.6 }
          const c2 = { x: a.x + (b.x - a.x) * 0.85, y: a.y + (b.y - a.y) * 0.4 }
          const mx = (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, my = (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8
          return (
            <g key={`st-${st.a}-${st.b}`}>
              <path className="stack" d={`M${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`} />
              <circle className="stack-dot" cx={mx} cy={my} r="3" />
            </g>
          )
        })}
      </svg>

      {c.bands.map((b) => (
        <button key={b.trama.id} type="button" className="band" data-color={b.trama.color} style={{ top: b.y }} onClick={() => onTrama(b.trama.id)}>
          <i />{b.trama.name}<small>{b.votes} {b.votes === 1 ? 'voto' : 'votos'}</small>
        </button>
      ))}
      {c.nodes.map((n) => {
        const on = lit.has(n.habit.id)
        return (
          <button key={n.habit.id} type="button" data-color={n.color}
            className={['star', on ? 'on' : '', n.habit.kind === 'reduce' ? 'quit' : ''].filter(Boolean).join(' ')}
            style={{ left: n.x, top: n.y, '--r': `${n.r}px` } as React.CSSProperties}
            aria-label={`${n.habit.name}: ${n.votes} ${n.votes === 1 ? 'voto' : 'votos'}${on ? ', con voto hoy' : ''}. Ver historial.`}
            onClick={() => onHabit(n.habit.id)}>
            <span className="o">{n.votes}</span>
            <span className="nm">{n.habit.name}</span>
          </button>
        )
      })}
    </div>
  )
}
