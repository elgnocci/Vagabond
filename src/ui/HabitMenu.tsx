import { useState } from 'react'
import type { TodayItem } from '../domain/today'
import { rhythmText } from '../domain/tramas'

interface Props {
  item: TodayItem
  onMin: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Opciones de un hábito: versión de 2 minutos, editar y eliminar. */
export function HabitMenu({ item, onMin, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const { habit, trama, doneToday } = item
  return (
    <>
      <h2>{habit.name}</h2>
      <p className="menu-sub">{[trama?.name, rhythmText(habit.rhythm)].filter(Boolean).join(' · ')}</p>
      <div className="menu">
        {!doneToday && (habit.minVersion ? (
          <button className="row" onClick={onMin}>
            Hoy hice la versión de 2 minutos
            <small>{habit.minVersion}. Cuenta igual.</small>
          </button>
        ) : (
          <button className="row" onClick={onEdit}>
            Agregar versión de 2 minutos
            <small>Para los días malos: presentarte cuenta igual.</small>
          </button>
        ))}
        <button className="row" onClick={onEdit}>Editar hábito</button>
        <button className="row danger" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
          {confirming ? 'Sí, eliminar el hábito y sus votos' : 'Eliminar hábito'}
        </button>
      </div>
    </>
  )
}
