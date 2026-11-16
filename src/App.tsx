import { Component, useEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useData, useToday } from './db/hooks'
import { planReminders } from './domain/reminders'
import { pushBack } from './back'
import { markDone } from './db/db'
import { clockNow } from './day'
import { canNotify, initNative, syncReminders } from './notify'
import { Hoy } from './screens/Hoy'
import { Pendientes } from './screens/Pendientes'
import { Progreso } from './screens/Progreso'
import { Tramas } from './screens/Tramas'
import { TabBar, type TabId } from './ui/TabBar'
import { ErrorState } from './ui/States'

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <ErrorState /> : this.props.children
  }
}

/** Mantiene los avisos del teléfono al día: los rehace cada vez que cambia algo. */
function ReminderSync() {
  const data = useData()
  const today = useToday()
  useEffect(() => {
    if (!canNotify || !data) return
    const id = window.setTimeout(() => {
      // Un mes por delante: si la app deja de abrirse, los avisos no se apagan a la semana.
      const plan = planReminders(data.habits, data.tramas, data.logs, data.reminders, today, clockNow(), 30, data.pauses)
      void syncReminders(plan).catch(() => {})
    }, 600)
    return () => window.clearTimeout(id)
  }, [data, today])
  return null
}

export function App() {
  const [tab, setTab] = useState<TabId>('hoy')

  useEffect(() => {
    void initNative({ onDone: (habitId, date, slot) => void markDone(habitId, date, slot).catch(() => {}) }).catch(() => {})
  }, [])
  // Con el botón atrás del teléfono, desde otra pestaña se vuelve a Hoy.
  useEffect(() => (tab === 'hoy' ? undefined : pushBack(() => setTab('hoy'))), [tab])
  return (
    <MotionConfig reducedMotion="user">
      <ReminderSync />
      <div className="app">
        <Boundary>{tab === 'hoy' ? <Hoy onGo={setTab} /> : tab === 'tramas' ? <Tramas /> : tab === 'pendientes' ? <Pendientes /> : <Progreso />}</Boundary>
        <TabBar current={tab} onChange={setTab} />
      </div>
    </MotionConfig>
  )
}
