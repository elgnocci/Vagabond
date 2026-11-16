import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { exportAll, importAll, savePauses, saveReminders } from '../db/db'
import type { Data } from '../db/hooks'
import { clockNow, getDayEnd, setDayEnd } from '../day'
import { buildBackup, describeBackup, parseBackup, type Backup } from '../domain/backup'
import { formatDay, toISO, type ISODate } from '../domain/dates'
import { isPaused, togglePause } from '../domain/pauses'
import { planReminders } from '../domain/reminders'
import type { ReminderSettings } from '../domain/types'
import { canNotify, ensurePermission, saveFile } from '../notify'
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
  data: Data
  today: ISODate
  onError: (msg: string) => void
}

export function Settings({ data, today, onError }: Props) {
  const [theme, setThemeState] = useState(getTheme)
  const [pending, setPending] = useState<Backup | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dayEnd, setDayEndState] = useState(getDayEnd)
  const [upd, setUpdate] = useState<'idle' | 'checking' | 'none' | 'error' | { url: string }>('idle')
  const paused = isPaused(data.pauses, today)
  const backupDays = data.lastBackupAt ? Math.floor((Date.now() - data.lastBackupAt) / 86_400_000) : null
  const file = useRef<HTMLInputElement>(null)
  const r = data.reminders

  const update = (patch: Partial<ReminderSettings>) =>
    saveReminders({ ...r, ...patch }).catch(() => onError('No se pudo guardar. Inténtalo de nuevo.'))

  /** Al encender en Android se pide el permiso; si se niega, quedan apagados. */
  async function enable(v: boolean) {
    if (v && canNotify && !(await ensurePermission().catch(() => false))) {
      onError('Android no dio permiso para mostrar avisos. Actívalo en los ajustes del teléfono.')
      return
    }
    await update({ enabled: v })
  }

  const upcoming = useMemo(
    () => planReminders(data.habits, data.tramas, data.logs, r, today, clockNow(), 2, data.pauses).filter((x) => x.kind !== 'comeback').slice(0, 3),
    [data.habits, data.tramas, data.logs, data.pauses, r, today],
  )
  const withTime = data.habits.filter((h) => h.kind !== 'reduce' && (h.remindAt || h.slots?.some((x) => x.remindAt))).length

  /** Mira en GitHub si hay un APK más nuevo que el instalado. Solo se consulta al tocar el botón. */
  async function checkUpdate() {
    setUpdate('checking')
    try {
      const res = await fetch('https://api.github.com/repos/elgnocci/Vagabond/releases/tags/android')
      if (!res.ok) return setUpdate(res.status === 404 ? 'none' : 'error')
      const rel = (await res.json()) as { html_url: string; assets: { updated_at: string }[] }
      const newest = Math.max(0, ...rel.assets.map((a) => Date.parse(a.updated_at)))
      // Media hora de margen: el APK se publica unos minutos después de compilarse.
      setUpdate(newest > __BUILD_TIME__ + 30 * 60_000 ? { url: rel.html_url } : 'none')
    } catch {
      setUpdate('error')
    }
  }

  async function exportBackup() {
    try {
      const text = JSON.stringify(buildBackup(await exportAll(), new Date()))
      await saveFile(`vagabond-${toISO(new Date())}.json`, text, 'Respaldo de Vagabond')
      setNote('Respaldo creado. Guárdalo fuera del teléfono.')
    } catch (e) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if (!/abort|cancel/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`)) onError('No se pudo crear el respaldo.')
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
        <span className="lbl" id="l-dia">El día termina a las</span>
        <div className="segm" role="group" aria-labelledby="l-dia">
          {[0, 1, 2, 3, 4].map((h) => (
            <button key={h} type="button" aria-pressed={dayEnd === h} onClick={() => { setDayEnd(h); setDayEndState(h); window.dispatchEvent(new Event('vagabond-day-end')) }}>
              {dayEnd === h && <motion.i layoutId="diafin" className="thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span>{h}:00</span>
            </button>
          ))}
        </div>
        <p className="help">{dayEnd === 0 ? 'El día cambia a medianoche.' : `Lo que marques antes de las ${dayEnd}:00 cuenta para el día anterior.`}</p>
      </div>

      <div className="field">
        <span className="lbl">Pausa</span>
        <div className="rows">
          <div className="srow">
            <span><b>Estoy en pausa</b><small>Enfermedad o viaje: esos días no cuentan a favor ni en contra, y no hay avisos.</small></span>
            <Switch on={paused} label="Pausa" onChange={() => void savePauses(togglePause(data.pauses, today)).catch(() => onError('No se pudo guardar. Inténtalo de nuevo.'))} />
          </div>
        </div>
      </div>

      <div className="field">
        <span className="lbl">Recordatorios</span>
        <div className="rows">
          <div className="srow">
            <span><b>Avisarme</b><small>A la hora que le pongas a cada hábito.</small></span>
            <Switch on={r.enabled} label="Recordatorios" onChange={(v) => void enable(v)} />
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
            {!canNotify && <p className="help warn">En esta versión web los avisos no llegan con la app cerrada. Para recibirlos, instala la app para Android.</p>}
          </>
        )}
      </div>

      <div className="field">
        <span className="lbl">Respaldo</span>
        <p className={backupDays === null || backupDays > 30 ? 'help warn' : 'help'} style={{ marginTop: 0, marginBottom: 8 }}>
          Tus datos viven solo en este teléfono. {backupDays === null ? 'Todavía no has hecho ningún respaldo.' : backupDays === 0 ? 'Último respaldo: hoy.' : `Último respaldo: hace ${backupDays} ${backupDays === 1 ? 'día' : 'días'}.`}
        </p>
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

      <div className="field">
        <span className="lbl">Versión</span>
        {typeof upd === 'object' ? (
          <a className="btn block" href={upd.url} target="_blank" rel="noreferrer">Hay una versión nueva · Descargar</a>
        ) : (
          <button type="button" className="btn quiet block" disabled={upd === 'checking'} onClick={() => void checkUpdate()}>
            {upd === 'checking' ? 'Buscando…' : 'Buscar versión nueva'}
          </button>
        )}
        {upd === 'none' && <p className="help" role="status">Tienes la última versión publicada.</p>}
        {upd === 'error' && <p className="help warn" role="status">No se pudo consultar. Revisa tu conexión.</p>}
      </div>

      <p className="mono" style={{ textAlign: 'center', marginTop: 28 }}>Vagabond · versión {__APP_VERSION__}</p>
    </>
  )
}
