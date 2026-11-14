import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { exportAll, importAll, saveReminders } from '../db/db'
import type { useData } from '../db/hooks'
import { buildBackup, describeBackup, parseBackup, type Backup } from '../domain/backup'
import { formatDay, toISO, type ISODate } from '../domain/dates'
import { planReminders } from '../domain/reminders'
import type { ReminderSettings } from '../domain/types'
import { getTheme, setTheme, type Theme } from '../theme'

const THEMES: { id: Theme; label: string }[] = [{ id: 'system', label: 'Sistema' }, { id: 'dark', label: 'Oscuro' }, { id: 'light', label: 'Claro' }]

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}>
      <motion.i layout transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
    </button>
  )
}

interface Props {
  data: NonNullable<ReturnType<typeof useData>>
  today: ISODate
  /** Los avisos solo se entregan dentro de la app Android. */
  canNotify: boolean
  onError: (msg: string) => void
}

export function Settings({ data, today, canNotify, onError }: Props) {
  const [theme, setThemeState] = useState(getTheme)
  const [pending, setPending] = useState<Backup | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const r = data.reminders

  const update = (patch: Partial<ReminderSettings>) =>
    saveReminders({ ...r, ...patch }).catch(() => onError('No se pudo guardar. Inténtalo de nuevo.'))

  const upcoming = useMemo(() => {
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return planReminders(data.habits, data.tramas, data.logs, r, today, hhmm, 2).slice(0, 3)
  }, [data.habits, data.tramas, data.logs, r, today])
  const withTime = data.habits.filter((h) => h.remindAt && h.kind !== 'reduce' && h.rhythm.kind === 'days').length

  async function exportBackup() {
    try {
      const text = JSON.stringify(buildBackup(await exportAll(), new Date()))
      const name = `vagabond-${toISO(new Date())}.json`
      const blob = new File([text], name, { type: 'application/json' })
      // En el teléfono se ofrece compartir o guardar; en otros casos se descarga.
      if (navigator.canShare?.({ files: [blob] })) {
        await navigator.share({ files: [blob], title: 'Respaldo de Vagabond' })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        URL.revokeObjectURL(a.href)
      }
      setNote('Respaldo creado. Guárdalo fuera del teléfono.')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') onError('No se pudo crear el respaldo.')
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const res = parseBackup(await f.text())
    if (res.ok) setPending(res.backup)
    else onError(res.error)
  }

  async function restore() {
    if (!pending) return
    try {
      await importAll(pending)
      setNote('Respaldo restaurado.')
    } catch {
      onError('No se pudo restaurar. Tus datos quedaron como estaban.')
    }
    setPending(null)
  }

  return (
    <>
      <div className="field">
        <span className="lbl" id="l-tema">Tema</span>
        <div className="segm" role="group" aria-labelledby="l-tema">
          {THEMES.map((t) => (
            <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => { setTheme(t.id); setThemeState(t.id) }}>
              {theme === t.id && <motion.i layoutId="tema" className="thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="lbl">Recordatorios</span>
        <div className="rows">
          <div className="srow">
            <span><b>Avisarme</b><small>A la hora que le pongas a cada hábito.</small></span>
            <Switch on={r.enabled} label="Recordatorios" onChange={(v) => void update({ enabled: v })} />
          </div>
          {r.enabled && (
            <>
              <div className="srow">
                <span><b>Aviso de rescate</b><small>Uno al día, solo si a esa hora queda algo pendiente.</small></span>
                <Switch on={r.rescue} label="Aviso de rescate" onChange={(v) => void update({ rescue: v })} />
              </div>
              {r.rescue && (
                <label className="srow">
                  <span><b>Hora del rescate</b></span>
                  <input type="time" className="time" value={r.rescueAt} onChange={(e) => e.target.value && void update({ rescueAt: e.target.value })} />
                </label>
              )}
            </>
          )}
        </div>
        {r.enabled && (
          <>
            {upcoming.length > 0 ? (
              <ul className="upcoming" aria-label="Próximos avisos">
                {upcoming.map((u) => (
                  <li key={u.id}>
                    <span className="mono">{u.date === today ? 'Hoy' : formatDay(u.date).split(' ')[0]} {u.time}</span>
                    <b>{u.title}</b>
                    <span>{u.body}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">No hay avisos por delante. {withTime === 0 ? 'Ponle hora a un hábito al editarlo, en el último paso.' : ''}</p>
            )}
            {!canNotify && <p className="help warn">En esta versión web los avisos no llegan con la app cerrada. Van a funcionar en la app para Android.</p>}
          </>
        )}
      </div>

      <div className="field">
        <span className="lbl">Respaldo</span>
        <p className="help" style={{ marginTop: 0, marginBottom: 8 }}>Tus datos viven solo en este teléfono. Exporta un respaldo de vez en cuando.</p>
        {pending ? (
          <div className="confirm" role="alertdialog" aria-label="Confirmar restauración">
            <b>¿Reemplazar todo lo que hay en este teléfono?</b>
            <span>El respaldo trae {describeBackup(pending)}{pending.exportedAt ? `, del ${formatDay(toISO(new Date(pending.exportedAt))).toLowerCase()}` : ''}. Lo que tienes ahora se pierde.</span>
            <div className="wiz-nav" style={{ marginTop: 12 }}>
              <button type="button" className="btn quiet" onClick={() => setPending(null)}>Cancelar</button>
              <button type="button" className="btn" onClick={() => void restore()}>Sí, reemplazar</button>
            </div>
          </div>
        ) : (
          <div className="wiz-nav" style={{ marginTop: 0 }}>
            <button type="button" className="btn quiet" style={{ flex: 1 }} onClick={() => void exportBackup()}>Exportar</button>
            <button type="button" className="btn quiet" style={{ flex: 1 }} onClick={() => file.current?.click()}>Importar</button>
          </div>
        )}
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e)} />
        {note && <p className="help" role="status">{note}</p>}
      </div>

      <p className="mono" style={{ textAlign: 'center', marginTop: 28 }}>Vagabond · versión {__APP_VERSION__}</p>
    </>
  )
}
