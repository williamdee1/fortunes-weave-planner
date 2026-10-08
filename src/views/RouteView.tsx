import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import {
  charMap, recruitMap, joinMap, baseStatMap,
  recruitableOn, getJoinLevel,
  LORDS, LATER_GAME,
} from '../data/loader'
import {
  classGrowths, classPassiveGrowths, mountGrowths,
} from '../data/loader'
import { optimize } from '../model/optimizer'
import { autoLevelGainsForChar } from '../model/autolevel'
import { weightedScore, PRESET_OBJECTIVES } from '../model/growth'
import { STAT_KEYS, ROUTES } from '../model/types'
import type { Route, ObjectiveWeights } from '../model/types'

const ROUTE_COLORS: Record<Route, string> = {
  Cai: '#0072B2', Dietrich: '#E69F00', Theodora: '#009E73', Leda: '#CC79A7',
}

interface RosterRow {
  name: string
  joinLevelMin: number
  joinLevelMax: number
  joinChapterMin: number
  joinChapterMax: number
  recruitStatus: string
  extraCondition: string | null
  hasBaseStats: boolean
  isAuto: boolean
  paralogueGated: boolean
  calendarGated: boolean
  score: number
}

export function RouteView() {
  const { settings, activeRoute, setActiveRoute, openPlanner } = useApp()
  const [objectiveName, setObjectiveName] = useState('Physical attacker')
  const [filterAuto, setFilterAuto] = useState(false)
  const [filterHideGated, setFilterHideGated] = useState(false)
  const [sortKey, setSortKey] = useState<'name' | 'joinLevel' | 'score'>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [compareChar, setCompareChar] = useState('')

  const objective = (PRESET_OBJECTIVES[objectiveName] ?? PRESET_OBJECTIVES['Physical attacker']) as ObjectiveWeights

  // Build roster rows for the active route
  const rosterRows = useMemo<RosterRow[]>(() => {
    const route = activeRoute
    const chars = recruitableOn(route)
    const rows: RosterRow[] = []

    for (const name of chars) {
      const charData = charMap.get(name)
      if (!charData) continue

      const joinLevel = getJoinLevel(name, route)
      if (joinLevel === null) continue

      const joinEntry = joinMap.get(name)?.routes[route]
      const recruitEntry = recruitMap.get(name)?.routes[route]

      const joinLevelMax = joinEntry?.levelMax ?? joinLevel
      const joinChapterMin = joinEntry?.chapterMin ?? 1
      const joinChapterMax = joinEntry?.chapterMax ?? 1
      const isAuto = LORDS.has(name) || joinEntry?.isAuto === true
      const paralogueGated = joinEntry?.paralogueGated === true
      const calendarGated = joinEntry?.calendarGated === true
      const hasBaseStats = baseStatMap.has(name)

      let recruitStatus = 'Auto'
      let extraCondition: string | null = null
      if (recruitEntry && recruitEntry.type === 'normal') {
        recruitStatus = `Support ${recruitEntry.supportRequired} | Renown ${recruitEntry.renownRequired}`
        extraCondition = recruitEntry.extraCondition
      } else if (recruitEntry?.type === 'auto') {
        recruitStatus = `Auto (Ch ${recruitEntry.chapter ?? '?'})`
      }

      // Compute projected score via optimizer
      const baseLevel = baseStatMap.get(name)?.level ?? 1
      const personalGrowths = charData.growths
      const autoGains = autoLevelGainsForChar(
        personalGrowths,
        charData.baseGrowthsWithoutAbility,
        baseLevel,
        joinLevel,
        settings,
      )
      const autoScorePenalty = weightedScore(autoGains, objective)

      const plans = optimize({
        characterName: name,
        route,
        personalGrowths,
        joinLevel,
        targetLevel: settings.part1EndLevel,
        allClasses: classGrowths,
        allMounts: mountGrowths,
        passives: classPassiveGrowths,
        weights: objective,
        settings,
        defaultBond: 5,
        unlockedRoutes: new Set(),
      }, 1)

      const planScore = plans[0]?.totalScore ?? 0
      const score = planScore - autoScorePenalty

      rows.push({
        name,
        joinLevelMin: joinLevel,
        joinLevelMax,
        joinChapterMin,
        joinChapterMax,
        recruitStatus,
        extraCondition,
        hasBaseStats,
        isAuto,
        paralogueGated,
        calendarGated,
        score,
      })
    }

    return rows
  }, [activeRoute, objective, settings])

  // Filter + sort
  const displayed = useMemo(() => {
    let rows = rosterRows
    if (filterAuto) rows = rows.filter(r => r.isAuto)
    if (filterHideGated) rows = rows.filter(r => !r.paralogueGated && !r.calendarGated)

    rows = [...rows].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'joinLevel') { va = a.joinLevelMin; vb = b.joinLevelMin }
      else { va = a.score; vb = b.score }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return rows
  }, [rosterRows, filterAuto, filterHideGated, sortKey, sortDir])

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  function col(key: typeof sortKey, label: string) {
    return (
      <th onClick={() => handleSort(key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  const maxScore = Math.max(...displayed.map(r => r.score), 1)

  // Compare one character across all routes
  const compareRows = useMemo(() => {
    if (!compareChar) return null
    const charData = charMap.get(compareChar)
    if (!charData) return null

    return ROUTES.map(route => {
      const jl = getJoinLevel(compareChar, route)
      if (jl === null) return { route, available: false as const }
      const joinEntry = joinMap.get(compareChar)?.routes[route]
      const recruitEntry = recruitMap.get(compareChar)?.routes[route]

      const plans = optimize({
        characterName: compareChar,
        route,
        personalGrowths: charData.growths,
        joinLevel: jl,
        targetLevel: settings.part1EndLevel,
        allClasses: classGrowths,
        allMounts: mountGrowths,
        passives: classPassiveGrowths,
        weights: objective,
        settings,
        defaultBond: 5,
        unlockedRoutes: new Set(),
      }, 1)

      const plan = plans[0]
      const baseLevel = baseStatMap.get(compareChar)?.level ?? 1
      const autoGains = autoLevelGainsForChar(
        charData.growths,
        charData.baseGrowthsWithoutAbility,
        baseLevel,
        jl,
        settings,
      )

      return {
        route,
        available: true as const,
        joinLevel: jl,
        joinChapter: joinEntry ? `Ch ${joinEntry.chapterMin}${joinEntry.chapterMax !== joinEntry.chapterMin ? `–${joinEntry.chapterMax}` : ''}` : '—',
        isAuto: joinEntry?.isAuto ?? false,
        paralogueGated: joinEntry?.paralogueGated ?? false,
        calendarGated: joinEntry?.calendarGated ?? false,
        recruitStatus: recruitEntry?.type === 'normal'
          ? `Support ${recruitEntry.supportRequired} | Renown ${recruitEntry.renownRequired}`
          : 'Auto',
        score: plan ? plan.totalScore - weightedScore(autoGains, objective) : 0,
        planGains: plan?.planGains,
        autoGains,
        topPlan: plan,
      }
    })
  }, [compareChar, objective, settings])

  return (
    <div>
      {/* ── Route tabs ── */}
      <div className="route-tabs">
        {ROUTES.map(r => (
          <button
            key={r}
            className={`route-tab${activeRoute === r ? ' active' : ''}`}
            style={activeRoute === r ? { background: ROUTE_COLORS[r], borderColor: ROUTE_COLORS[r] } : {}}
            onClick={() => setActiveRoute(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <label className="flex items-center gap-2" style={{ fontSize: '.875rem' }}>
          Objective:
          <select value={objectiveName} onChange={e => setObjectiveName(e.target.value)}>
            {Object.keys(PRESET_OBJECTIVES).map(n => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ marginLeft: '.5rem' }}>
          <input type="checkbox" checked={filterAuto} onChange={e => setFilterAuto(e.target.checked)} />
          Auto-recruits only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filterHideGated} onChange={e => setFilterHideGated(e.target.checked)} />
          Hide paralogue/calendar-gated
        </label>
        <div style={{ marginLeft: 'auto', fontSize: '.8125rem', color: 'var(--text2)' }}>
          {displayed.length} recruitable
        </div>
      </div>

      {/* ── Roster table ── */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {col('name', 'Character')}
              <th>Join</th>
              <th>Requirements</th>
              <th>Flags</th>
              {col('score', `Score (${objectiveName})`)}
              <th style={{ width: 120 }}>Score bar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(row => (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                  {row.hasBaseStats && (
                    <span className="badge badge-ok" style={{ marginLeft: '.35rem' }}>base stats</span>
                  )}
                  {LATER_GAME.has(row.name) && (
                    <span className="badge badge-neutral" style={{ marginLeft: '.35rem' }}>Part III</span>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: '.8125rem' }}>
                  {row.isAuto ? (
                    <span className="badge badge-ok">Auto Ch {row.joinChapterMin}</span>
                  ) : (
                    <>
                      Ch {row.joinChapterMin}{row.joinChapterMax !== row.joinChapterMin ? `–${row.joinChapterMax}` : ''}
                      {' '}· Lv {row.joinLevelMin}{row.joinLevelMax !== row.joinLevelMin ? `–${row.joinLevelMax}` : ''}
                    </>
                  )}
                </td>
                <td style={{ fontSize: '.75rem', color: 'var(--text2)' }}>
                  <div>{row.recruitStatus}</div>
                  {row.extraCondition && (
                    <div style={{ color: 'var(--text3)' }}>{row.extraCondition.slice(0, 60)}{row.extraCondition.length > 60 ? '…' : ''}</div>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '.2rem', flexWrap: 'wrap' }}>
                    {row.paralogueGated && <span className="badge badge-warn">† paralogue</span>}
                    {row.calendarGated && <span className="badge badge-info">‡ calendar</span>}
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.score.toFixed(2)}
                </td>
                <td>
                  <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${Math.max(2, (row.score / maxScore) * 100)}%`,
                      background: ROUTE_COLORS[activeRoute],
                      transition: 'width .3s',
                    }} />
                  </div>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => openPlanner(row.name, activeRoute)}
                  >
                    Plan →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Compare routes panel ── */}
      <div className="card mt-4">
        <h2 style={{ marginBottom: '.6rem' }}>Compare routes for one character</h2>
        <div className="toolbar">
          <select
            value={compareChar}
            onChange={e => setCompareChar(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">Select character…</option>
            {[...charMap.keys()].sort().map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {compareChar && compareRows && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Join</th>
                  <th>Requirements</th>
                  <th>Score</th>
                  {STAT_KEYS.map(k => <th key={k}>{k}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(row => (
                  <tr key={row.route} style={!row.available ? { opacity: .4 } : {}}>
                    <td>
                      <span style={{ fontWeight: 600, color: ROUTE_COLORS[row.route] }}>
                        {row.route}
                      </span>
                    </td>
                    {!row.available ? (
                      <td colSpan={4 + STAT_KEYS.length} style={{ color: 'var(--text3)' }}>
                        Unrecruitable on this route
                      </td>
                    ) : (
                      <>
                        <td style={{ fontSize: '.8125rem' }}>
                          {row.isAuto ? <span className="badge badge-ok">Auto</span> : row.joinChapter}
                          {' '}· Lv {row.joinLevel}
                          {row.paralogueGated && <span className="badge badge-warn" style={{ marginLeft: '.2rem' }}>†</span>}
                          {row.calendarGated && <span className="badge badge-info" style={{ marginLeft: '.2rem' }}>‡</span>}
                        </td>
                        <td style={{ fontSize: '.75rem', color: 'var(--text2)' }}>
                          {row.recruitStatus}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <strong>{row.score.toFixed(2)}</strong>
                        </td>
                        {STAT_KEYS.map(k => {
                          const g = row.planGains?.[k] ?? 0
                          return (
                            <td key={k} style={{ textAlign: 'right', fontSize: '.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                              +{g.toFixed(1)}
                            </td>
                          )
                        })}
                        <td>
                          <button className="btn btn-ghost btn-xs"
                            onClick={() => openPlanner(compareChar, row.route)}>
                            Plan →
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!compareChar && (
          <p className="text-sm text-muted">
            Select a character to see their stats across all four routes side-by-side.
          </p>
        )}
      </div>
    </div>
  )
}
