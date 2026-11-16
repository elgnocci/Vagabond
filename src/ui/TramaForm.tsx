import { useState } from 'react'
import type { TramaDraft } from '../db/db'
import { TRAMA_COLORS, type Trama, type TramaColor } from '../domain/types'

const COLOR_NAMES: Record<TramaColor, string> = { teal: 'Turquesa', lila: 'Lila', rosa: 'Rosa', lima: 'Lima', cielo: 'Cielo' }

interface Props {
  trama?: Trama
  suggested: TramaColor
  canDelete: boolean
  onSubmit: (draft: TramaDraft) => Promise<void>
  onDelete?: () => Promise<void>
}

export function TramaForm({ trama, suggested, canDelete, onSubmit, onDelete }: Props) {
  const [name, setName] = useState(trama?.name ?? '')
  const [identity, setIdentity] = useState(trama?.identity ?? '')
  const [color, setColor] = useState<TramaColor>(trama?.color ?? suggested)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const error = tried && !name.trim() ? 'Ponle un nombre a la trama.' : null

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (name.trim()) void onSubmit({ name, identity, color }) }}>
      <div className="field">
        <label htmlFor="t-name">Nombre</label>
        <input id="t-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuidar mi cuerpo"
          maxLength={40} autoComplete="off" aria-invalid={!!error} />
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="field">
        <label htmlFor="t-id">Quién quieres ser</label>
        <div className="prefix">
          <span>Soy alguien que</span>
          <input id="t-id" className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="no falta a entrenar"
            maxLength={60} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <span className="lbl" id="l-color">Color</span>
        <div className="swatches" role="group" aria-labelledby="l-color">
          {TRAMA_COLORS.map((c) => (
            <button type="button" key={c} data-color={c} aria-pressed={color === c} aria-label={COLOR_NAMES[c]} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        <button className="btn block" type="submit">{trama ? 'Guardar cambios' : 'Crear trama'}</button>
        {trama && onDelete && (canDelete ? (
          <button className="btn block ghost" type="button" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
            {confirming ? 'Sí, eliminar la trama' : 'Eliminar trama'}
          </button>
        ) : (
          <p className="note">Para eliminar esta trama, primero mueve o elimina sus hábitos.</p>
        ))}
      </div>
    </form>
  )
}
