import './styles/globals.css'
import { AppProvider, useApp } from './context/AppContext'
import { RouteView } from './views/RouteView'
import { PlannerView } from './views/PlannerView'
import { ClassBrowserView } from './views/ClassBrowserView'
import { SettingsView } from './views/SettingsView'
import { DataIssuesView } from './views/DataIssuesView'
import type { ViewName } from './context/AppContext'

const NAV: { key: ViewName; label: string }[] = [
  { key: 'roster',  label: 'Route Roster' },
  { key: 'planner', label: 'Character Planner' },
  { key: 'classes', label: 'Class Browser' },
  { key: 'settings', label: 'Settings' },
  { key: 'issues',  label: 'Data Issues' },
]

function Shell() {
  const { activeView, setActiveView } = useApp()

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="brand">Fortune's Weave Planner</span>
        {NAV.map(n => (
          <button
            key={n.key}
            className={`nav-tab${activeView === n.key ? ' active' : ''}`}
            onClick={() => setActiveView(n.key)}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <div className="view-container">
        {activeView === 'roster'   && <RouteView />}
        {activeView === 'planner'  && <PlannerView />}
        {activeView === 'classes'  && <ClassBrowserView />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'issues'   && <DataIssuesView />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
