import { useState } from 'react'
import type { TodayItem } from '../domain/today'
import { rhythmText } from '../domain/tramas'

interface Props {
  item: TodayItem
  onMin: () => void
  onEdit: () => void
  onHistory: () => void
  /** Mover en la lista; falta si no hay hacia dónde. */
  onUp?: () => void
  onDown?: () => void
  onArchive: () => void
  onDelete: () => void
}

/** Opciones de un hábito: versión de 2 minutos, historial, editar, mover, archivar y eliminar. */
export function HabitMenu({ item, onMin, onEdit, onHistory, onUp, onDown, onArchive, onDelete }: Props) {
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
        <button className="row" onClick={onHistory}>Ver historial<small>Rachas, constancia y calendario para corregir días.</small></button>
        <button className="row" onClick={onEdit}>Editar hábito</button>
        {(onUp || onDown) && (
          <div className="pair">
            <button className="row" onClick={onUp} disabled={!onUp}>Subir</button>
            <button className="row" onClick={onDown} disabled={!onDown}>Bajar</button>
          </div>
        )}
        <button className="row" onClick={onArchive}>Archivar<small>Sale de Hoy, pero conserva sus votos. Se recupera desde Tramas.</small></button>
        <button className="row danger" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
          {confirming ? 'Sí, eliminar el hábito y sus votos' : 'Eliminar con sus votos'}
        </button>
      </div>
    </>
  )
}
