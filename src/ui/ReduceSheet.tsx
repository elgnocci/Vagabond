import { useState } from 'react'
import { addDays, formatShort, type ISODate } from '../domain/dates'
import type { ReduceItem } from '../domain/today'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

interface Props {
  item: ReduceItem
  today: ISODate
  onEdit: () => void
  onDelete: () => void
}

/** Detalle de lo que se está dejando: números, plan por etapas y qué hacer ante el antojo. */
export function ReduceSheet({ item, today, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const { habit, trama, state: s } = item
  const plan = habit.plan
  const stages = plan?.stages ?? []
  const current = plan && !s.quit ? stages.filter((st) => st.from <= today).at(-1) ?? stages[0] : undefined

  return (
    <>
      <h2>{habit.name}</h2>
      <p className="menu-sub">
        {trama?.name}{plan && (s.quit ? ' · En cero' : ` · ${plural(s.daysToQuit, 'día', 'días')} para llegar a cero`)}
      </p>

      <div className="tiles">
        <div><b>{s.resistedTotal}</b><span>antojos resistidos</span></div>
        <div><b>{s.okDays.length}</b><span>días dentro del tope</span></div>
        <div><b>{s.streak}</b><span>de racha</span></div>
      </div>

      {habit.urgePlan && <p className="preview"><small>Cuando venga el antojo</small>Voy a {habit.urgePlan}.</p>}

      {plan && (
        <>
          <span className="lbl" style={{ display: 'block', marginTop: 20, fontSize: 13, fontWeight: 700 }}>Tu plan</span>
          <ol className="plan">
            {stages.map((st, i) => {
              const end = addDays(stages[i + 1]?.from ?? plan.quitDate, -1)
              return (
                <li key={st.from} className={st === current ? 'now' : end < today ? 'past' : undefined}>
                  <span>{formatShort(st.from)} – {formatShort(end)}</span>
                  <b>hasta {st.limit} al día</b>
                </li>
              )
            })}
            <li className={s.quit ? 'now zero' : 'zero'}><span>Desde el {formatShort(plan.quitDate)}</span><b>cero</b></li>
          </ol>
        </>
      )}

      <div className="menu">
        <button className="row" onClick={onEdit}>Editar plan</button>
        <button className="row danger" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
          {confirming ? 'Sí, eliminar el plan y sus votos' : 'Eliminar'}
        </button>
      </div>
    </>
  )
}
