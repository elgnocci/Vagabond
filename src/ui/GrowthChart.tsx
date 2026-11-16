import { useEffect, useRef, useState } from 'react'
import { formatShort, type ISODate } from '../domain/dates'
import { formatPct, formatTimes, type GrowthDay } from '../domain/growth'

const H = 190
const PAD = { t: 18, r: 46, b: 26, l: 8 }

/** Tu curva compuesta frente a la de sumar 1% todos los días. Tocar muestra el día. */
export function GrowthChart({ series, today }: { series: GrowthDay[]; today: ISODate }) {
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

  // El punto de partida (×1, la víspera del primer día) va primero para que ambas curvas nazcan juntas.
  const pts = [{ value: 1, ideal: 1 }, ...series]
  const n = pts.length
  const last = series[series.length - 1]
  const lo = Math.min(1, ...series.map((s) => s.value))
  const hi = Math.max(1.01, last.ideal, ...series.map((s) => s.value))
  const span = hi - lo || 1
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * Math.max(0, w - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
  const path = (key: 'value' | 'ideal') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')

  const pick = (e: React.PointerEvent) => {
    const box = wrap.current!.getBoundingClientRect()
    const ratio = (e.clientX - box.left - PAD.l) / Math.max(1, w - PAD.l - PAD.r)
    setHover(Math.min(series.length - 1, Math.max(0, Math.round(ratio * (n - 1)) - 1)))
  }
  const at = hover === null ? null : series[hover]
  // Si las dos etiquetas del final quedan encimadas, la de la referencia se corre.
  const yMine = y(last.value)
  const yIdeal = Math.abs(y(last.ideal) - yMine) < 14 ? yMine + (last.ideal >= last.value ? -14 : 14) : y(last.ideal)
  const sample = series.filter((_, i) => i === series.length - 1 || i % Math.max(1, Math.ceil(series.length / 7)) === 0)

  return (
    <div className="chart growth" ref={wrap}>
      <div className="legend" aria-hidden="true">
        <span><i className="mine" />Tu curva</span>
        <span><i className="ideal" />1% cada día</span>
      </div>
      <svg width={w} height={H} role="img"
        aria-label={`Tu curva del 1% diario va en ${formatTimes(last.value)}; sumando 1% todos los días iría en ${formatTimes(last.ideal)}.`}>
        <line className="grid-l" x1={PAD.l} x2={w - PAD.r} y1={y(1)} y2={y(1)} />
        <text className="tick" x={PAD.l} y={H - 6}>{formatShort(series[0].date)}</text>
        <text className="tick" x={w - PAD.r} y={H - 6} textAnchor="end">{last.date === today ? 'Hoy' : formatShort(last.date)}</text>
        <path className="ref" d={path('ideal')} />
        <path className="line" d={path('value')} />
        {at && <line className="cross" x1={x(hover! + 1)} x2={x(hover! + 1)} y1={PAD.t - 6} y2={H - PAD.b} />}
        <circle className="dot" cx={x(hover === null ? n - 1 : hover + 1)} cy={y((at ?? last).value)} r="5" />
        {!at && (
          <>
            <text className="end" x={w - PAD.r + 8} y={yMine + 4}>{formatTimes(last.value)}</text>
            <text className="end ref-l" x={w - PAD.r + 8} y={yIdeal + 4}>{formatTimes(last.ideal)}</text>
          </>
        )}
        <rect x={0} y={0} width={Math.max(0, w - PAD.r + 10)} height={H} fill="transparent" style={{ touchAction: 'pan-y' }}
          onPointerDown={pick} onPointerMove={pick} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)} />
      </svg>
      {at && (
        <div className="tip" style={{ left: Math.min(w - 150, Math.max(0, x(hover! + 1) - 70)), width: 150, top: 22 }} role="status">
          <span>{formatShort(at.date)}</span>
          <b>{formatTimes(at.value)}</b>
          <span>{at.total === 0 ? 'Día sin nada que contar' : `${at.done} de ${at.total} · ${formatPct(at.factor)} ese día`}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>El 1% diario por fecha</caption>
        <thead><tr><th>Fecha</th><th>Tu curva</th><th>1% cada día</th></tr></thead>
        <tbody>{sample.map((p) => <tr key={p.date}><td>{formatShort(p.date)}</td><td>{formatTimes(p.value)}</td><td>{formatTimes(p.ideal)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
