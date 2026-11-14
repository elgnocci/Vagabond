import { Component, useEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useData, useToday } from './db/hooks'
import { planReminders } from './domain/reminders'
import { canNotify, syncReminders } from './notify'
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
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      void syncReminders(planReminders(data.habits, data.tramas, data.logs, data.reminders, today, hhmm, 7)).catch(() => {})
    }, 600)
    return () => window.clearTimeout(id)
  }, [data, today])
  return null
}

export function App() {
  const [tab, setTab] = useState<TabId>('hoy')
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
