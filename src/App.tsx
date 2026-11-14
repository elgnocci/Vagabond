import { Component, useState, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
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

export function App() {
  const [tab, setTab] = useState<TabId>('hoy')
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Boundary>{tab === 'hoy' ? <Hoy onGo={setTab} /> : tab === 'tramas' ? <Tramas /> : tab === 'pendientes' ? <Pendientes /> : <Progreso />}</Boundary>
        <TabBar current={tab} onChange={setTab} />
      </div>
    </MotionConfig>
  )
}
