export type TabId = 'hoy' | 'tramas' | 'pendientes' | 'progreso'

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'hoy', label: 'Hoy', icon: <circle cx="12" cy="12" r="5.5" fill="currentColor" /> },
  {
    id: 'tramas', label: 'Tramas',
    icon: <path {...stroke} d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.500 21H19" />,
  },
  {
    id: 'pendientes', label: 'Pendientes',
    icon: <><rect {...stroke} x="4" y="4" width="16" height="16" rx="5" /><path {...stroke} d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  },
  { id: 'progreso', label: 'Progreso', icon: <path {...stroke} d="M4 18l5-6 4 3 7-9" /> },
]

export function TabBar({ current, onChange }: { current: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabs" aria-label="Secciones">
      {TABS.map((t) => (
        <button key={t.id} aria-current={current === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
