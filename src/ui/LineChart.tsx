import { useEffect, useRef, useState } from 'react'
import { formatShort } from '../domain/dates'
import type { SeriesPoint } from '../domain/progress'

const H = 190
const PAD = { t: 22, r: 14, b: 26, l: 34 }

/** Paso "redondo" (1, 2, 5, 10…) para que el eje tenga pocas marcas legibles. */
function niceStep(span: number, target = 3): number {
  const raw = Math.max(1, span / target)
  const pow = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
}

/** Línea de votos acumulados. Tocar o pasar el dedo muestra el día. */
export function LineChart({ points }: { points: SeriesPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = points.length
  const first = points[0].total - points[0].added
  const last = points[n - 1].total
  // El área se lee como cantidad, así que el eje siempre parte de cero.
  const lo = 0
  const step = niceStep(last)
  const hi = Math.max(step, Math.ceil(last / step) * step)
  const ticks: number[] = []
  for (let t = lo; t <= hi; t += step) ticks.push(t)

  const x = (i: number) => PAD.l + (n === 1 ? 0.5 : i / (n - 1)) * (w - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)} ${y(lo)} L${x(0).toFixed(1)} ${y(lo)} Z`

  const pick = (e: React.PointerEvent) => {
    const box = wrap.current!.getBoundingClientRect()
    const ratio = (e.clientX - box.left - PAD.l) / (w - PAD.l - PAD.r)
    setHover(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))))
  }
  const at = hover === null ? null : points[hover]
  const sample = points.filter((_, i) => i === n - 1 || i % Math.max(1, Math.ceil(n / 7)) === 0)

  return (
    <div className="chart" ref={wrap}>
      <svg width={w} height={H} role="img" aria-label={`Votos acumulados: de ${first} a ${last} entre el ${formatShort(points[0].date)} y hoy`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end">{t}</text>
          </g>
        ))}
        <text className="tick" x={PAD.l} y={H - 6}>{formatShort(points[0].date)}</text>
        <text className="tick" x={w - PAD.r} y={H - 6} textAnchor="end">Hoy</text>
        <path className="area" d={area} />
        <path className="line" d={line} />
        {at && <line className="cross" x1={x(hover!)} x2={x(hover!)} y1={PAD.t - 8} y2={y(lo)} />}
        <circle className="dot" cx={x(hover ?? n - 1)} cy={y((at ?? points[n - 1]).total)} r="5" />
        {!at && <text className="end" x={x(n - 1)} y={y(last) - 11} textAnchor="end">{last}</text>}
        <rect x={PAD.l - 10} y={0} width={Math.max(0, w - PAD.l - PAD.r + 20)} height={H} fill="transparent" style={{ touchAction: 'pan-y' }}
          onPointerDown={pick} onPointerMove={pick} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)} />
      </svg>
      {at && (
        <div className="tip" style={{ left: Math.min(w - 132, Math.max(0, x(hover!) - 62)) }} role="status">
          <span>{formatShort(at.date)}</span>
          <b>{at.total} {at.total === 1 ? 'voto' : 'votos'}</b>
          <span>{at.added ? `+${at.added} ese día` : 'sin votos ese día'}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Votos acumulados por fecha</caption>
        <thead><tr><th>Fecha</th><th>Votos acumulados</th></tr></thead>
        <tbody>{sample.map((p) => <tr key={p.date}><td>{formatShort(p.date)}</td><td>{p.total}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
