import React, { createContext, useContext, useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { DEFAULT_SETTINGS } from '../model/types'
import type { PlannerSettings, Route, ClassSegment } from '../model/types'

// ─── Plan type ───────────────────────────────────────────────────────────────

export interface StoredPlan {
  characterName: string
  route: Route
  joinLevel: number
  baseLevel: number
  segments: ClassSegment[]
  mountBond: number
}

export type ViewName = 'roster' | 'planner' | 'classes' | 'settings' | 'issues'

// ─── Context shape ───────────────────────────────────────────────────────────

interface AppContextValue {
  settings: PlannerSettings
  updateSettings: (patch: Partial<PlannerSettings>) => void

  plans: Record<string, StoredPlan>
  setPlan: (key: string, plan: StoredPlan) => void
  getPlan: (key: string) => StoredPlan | undefined

  activeView: ViewName
  setActiveView: (v: ViewName) => void

  activeRoute: Route
  setActiveRoute: (r: Route) => void

  selectedChar: string | null
  openPlanner: (charName: string, route: Route) => void

  exportData: () => void
  importData: (json: string) => boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useLocalStorage<PlannerSettings>('fw:settings', DEFAULT_SETTINGS)
  const [plans, setPlans] = useLocalStorage<Record<string, StoredPlan>>('fw:plans', {})
  const [activeView, setActiveView] = useLocalStorage<ViewName>('fw:view', 'roster')
  const [activeRoute, setActiveRoute] = useLocalStorage<Route>('fw:route', 'Cai')
  const [selectedChar, setSelectedChar] = useLocalStorage<string | null>('fw:char', null)

  const updateSettings = useCallback((patch: Partial<PlannerSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [setSettings])

  const setPlan = useCallback((key: string, plan: StoredPlan) => {
    setPlans(prev => ({ ...prev, [key]: plan }))
  }, [setPlans])

  const getPlan = useCallback((key: string) => {
    return plans[key]
  }, [plans])

  const openPlanner = useCallback((charName: string, route: Route) => {
    setSelectedChar(charName)
    setActiveRoute(route)
    setActiveView('planner')
  }, [setSelectedChar, setActiveRoute, setActiveView])

  const exportData = useCallback(() => {
    const data = JSON.stringify({ settings, plans }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fortunes-weave-plans-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [settings, plans])

  const importData = useCallback((json: string): boolean => {
    try {
      const data = JSON.parse(json) as { settings?: PlannerSettings; plans?: Record<string, StoredPlan> }
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings })
      if (data.plans) setPlans(data.plans)
      return true
    } catch {
      return false
    }
  }, [setSettings, setPlans])

  return (
    <AppContext.Provider value={{
      settings, updateSettings,
      plans, setPlan, getPlan,
      activeView, setActiveView,
      activeRoute, setActiveRoute,
      selectedChar, openPlanner,
      exportData, importData,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
