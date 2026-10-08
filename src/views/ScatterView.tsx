/**
 * ScatterView — Scatter plot comparing all characters across two stats
 * at a chosen level, in a chosen class (or each character's best class).
 *
 * FW-specific additions over a basic scatter:
 * - Route selector controls which route's join level / auto-level penalty applies
 * - Per-character gains-only fallback (no base stats) shown as hollow points
 * - Tier filter, class filter for projection class
 * - Highlight one character by clicking legend or table row
 * - Hover tooltip shows character name, class, both stat values, and gains-only flag
 */
import { useState, useMemo, useCallback } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Label,
} from 'recharts'
import { useApp } from '../context/AppContext'
import {
  charMap, classMap, baseStatMap,
  mountGrowths, classPassiveGrowths,
  getJoinLevel, LORDS, LATER_GAME, recruitableOn,
} from '../data/loader'
import { classGrowths } from '../data/loader'
import { autoLevelGainsForChar, postJoinGrowths } from '../model/autolevel'
import { singleClassProjection, projectedStats } from '../model/projection'
import { STAT_KEYS, zeroStats, ROUTES } from '../model/types'
import type { StatBlock, Route, PlannerSettings } from '../model/types'
import { bestMountForClass } from '../model/mounts'
import { weightedScore, PRESET_OBJECTIVES } from '../model/growth'

// ─── Colour palette (Okabe-Ito, cycled) ──────────────────────────────────────

const PALETTE = [
  '#0072B2', '#E69F00', '#009E73', '#CC79A7',
  '#56B4E9', '#D55E00', '#F0E442', '#000000',
]

function charColor(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name)
  return PALETTE[idx % PALETTE.length]!
}

// ─── Tier order ───────────────────────────────────────────────────────────────

const TIER_ORDER: Record<string, number> = {
  Base: 0, Beginner: 1, Specialty: 2, Advanced: 3, Master: 4, Divine: 5,
}

// ─── Join level helper ────────────────────────────────────────────────────────

function joinLevelFor(name: string, route: Route, settings: PlannerSettings): number {
  if (LORDS.has(name)) return 1
  if (LATER_GAME.has(name)) return settings.part3StartLevel
  return getJoinLevel(name, route) ?? 1
}

// ─── Per-character projection ─────────────────────────────────────────────────

interface CharPoint {
  name: string
  className: string
  xVal: number
  yVal: number
  isGainsOnly: boolean
}

function computeCharStats(
  charName: string,
  className: string,
  targetLevel: number,
  route: Route,
  settings: PlannerSettings,
): { stats: StatBlock; isGainsOnly: boolean } {
  const charData = charMap.get(charName)
  if (!charData) return { stats: zeroStats(), isGainsOnly: true }

  const baseStatRow = baseStatMap.get(charName) ?? null
  const baseLevel = baseStatRow?.level ?? 1
  const joinLevel = joinLevelFor(charName, route, settings)
  const effectiveJoin = Math.max(baseLevel, Math.min(joinLevel, targetLevel))

  const autoGains = autoLevelGainsForChar(
    charData.growths, charData.baseGrowthsWithoutAbility, baseLevel, effectiveJoin, settings,
  )

  const classDef = classMap.get(className)
  if (!classDef) return { stats: autoGains, isGainsOnly: !baseStatRow }

  const personalGrowths = postJoinGrowths(
    charData.growths, charData.baseGrowthsWithoutAbility, settings,
  )

  const mountDef = bestMountForClass(
    classDef, mountGrowths, 5, PRESET_OBJECTIVES['Balanced']!, settings,
  )

  const { planGains } = singleClassProjection(
    personalGrowths,
    effectiveJoin,
    targetLevel,
    classDef,
    mountDef,
    5,
    classPassiveGrowths,
    settings,
  )

  const total = projectedStats(baseStatRow?.stats ?? null, baseLevel, autoGains, planGains)

  if (total) return { stats: total, isGainsOnly: false }

  const gainsOnly = zeroStats()
  for (const k of STAT_KEYS) gainsOnly[k] = autoGains[k] + planGains[k]
  return { stats: gainsOnly, isGainsOnly: true }
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ScatterTooltip({ active, payload, xStat, yStat }: {
  active?: boolean
  payload?: Array<{ payload: CharPoint }>
  xStat: string
  yStat: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]!.payload
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '.5rem .75rem', fontSize: 12, minWidth: 140,
    }}>
      <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>{d.name}</div>
      <div style={{ color: 'var(--text2)', marginBottom: '.3rem' }}>{d.className}</div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <span><strong>{xStat}:</strong> {d.xVal.toFixed(1)}</span>
        <span><strong>{yStat}:</strong> {d.yVal.toFixed(1)}</span>
      </div>
      {d.isGainsOnly && (
        <div style={{ color: 'var(--warn)', fontSize: 11, marginTop: '.25rem' }}>
          Gains only (no base stats)
        </div>
      )}
    </div>
  )
}

// ─── Custom dot (hollow = gains-only) ────────────────────────────────────────

interface DotProps {
  cx?: number
  cy?: number
  payload?: CharPoint
  allNames: string[]
  highlightChar: string | null
}

function CustomDot({ cx = 0, cy = 0, payload, allNames, highlightChar }: DotProps) {
  if (!payload) return null
  const color = charColor(payload.name, allNames)
  const isHighlighted = highlightChar === payload.name
  const r = isHighlighted ? 8 : 5
  if (payload.isGainsOnly) {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={isHighlighted ? 2.5 : 1.5} />
  }
  return <circle cx={cx} cy={cy} r={r} fill={color} stroke={isHighlighted ? '#fff' : 'none'} strokeWidth={isHighlighted ? 1.5 : 0} opacity={0.85} />
}

// ─── Main component ───────────────────────────────────────────────────────────

const TIER_KEYS = ['All', 'Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine'] as const

export function ScatterView() {
  const { settings } = useApp()

  const [xStat, setXStat] = useState<typeof STAT_KEYS[number]>('Spd')
  const [yStat, setYStat] = useState<typeof STAT_KEYS[number]>('Str')
  const [targetLevel, setTargetLevel] = useState(37)
  const [route, setRoute] = useState<Route>('Cai')
  const [tierFilter, setTierFilter] = useState<string>('All')
  const [classFilter, setClassFilter] = useState<string>('Best')
  const [showGainsOnly, setShowGainsOnly] = useState(true)
  const [highlightChar, setHighlightChar] = useState<string | null>(null)

  // Characters to show: lords + all recruitables on the selected route
  const charNames = useMemo(() => {
    const all = [...new Set(recruitableOn(route))]
    return all.filter(n => charMap.has(n)).sort()
  }, [route])

  // Classes available for the dropdown (optionally filtered by tier)
  const filteredClasses = useMemo(() => {
    let classes = classGrowths
    if (tierFilter !== 'All') classes = classes.filter(c => c.tier === tierFilter)
    return [...classes].sort((a, b) => {
      const td = (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0)
      return td !== 0 ? td : a.name.localeCompare(b.name)
    })
  }, [tierFilter])

  // Best class for a character under the active tier filter
  const bestClassForChar = useCallback((charName: string): string => {
    const charData = charMap.get(charName)
    if (!charData) return classGrowths[0]?.name ?? 'Commoner'
    let best = classGrowths[0]?.name ?? 'Commoner'
    let bestScore = -Infinity
    const eligible = tierFilter !== 'All'
      ? classGrowths.filter(c => c.tier === tierFilter)
      : classGrowths
    const joinLevel = joinLevelFor(charName, route, settings)
    const effectiveJoin = Math.min(joinLevel, targetLevel)
    const personal = postJoinGrowths(charData.growths, charData.baseGrowthsWithoutAbility, settings)
    for (const cls of eligible) {
      const classDef = classMap.get(cls.name)
      if (!classDef) continue
      const mDef = bestMountForClass(classDef, mountGrowths, 5, PRESET_OBJECTIVES['Balanced']!, settings)
      const { planGains } = singleClassProjection(
        personal, effectiveJoin, targetLevel,
        classDef, mDef, 5, classPassiveGrowths, settings,
      )
      const score = weightedScore(planGains, PRESET_OBJECTIVES['Balanced']!)
      if (score > bestScore) { bestScore = score; best = cls.name }
    }
    return best
  }, [tierFilter, route, targetLevel, settings])

  // Compute scatter data
  const points = useMemo((): CharPoint[] => {
    return charNames.flatMap(charName => {
      const cls = classFilter === 'Best' ? bestClassForChar(charName) : classFilter
      const { stats, isGainsOnly } = computeCharStats(charName, cls, targetLevel, route, settings)
      if (!showGainsOnly && isGainsOnly) return []
      return [{
        name: charName,
        className: cls,
        xVal: parseFloat(stats[xStat].toFixed(1)),
        yVal: parseFloat(stats[yStat].toFixed(1)),
        isGainsOnly,
      }]
    })
  }, [charNames, classFilter, xStat, yStat, targetLevel, route, settings, showGainsOnly, bestClassForChar])

  const hasGainsOnly = points.some(p => p.isGainsOnly)

  const toggleHighlight = (name: string) =>
    setHighlightChar(h => h === name ? null : name)

  return (
    <div>
      <h1 style={{ marginBottom: '.75rem' }}>Character Scatter</h1>

      {hasGainsOnly && showGainsOnly && (
        <div className="badge badge-warn" style={{ marginBottom: '.75rem', fontSize: '.8125rem' }}>
          Hollow points = gains-only (no confirmed base stats). Filled = absolute stats.
        </div>
      )}

      {/* ── Chart ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number" dataKey="xVal"
              tick={{ fontSize: 11, fill: 'var(--text3)' }}
              axisLine={false} tickLine={false}
            >
              <Label
                value={xStat} position="insideBottom" offset={-20}
                style={{ fontSize: 12, fill: 'var(--text2)' }}
              />
            </XAxis>
            <YAxis
              type="number" dataKey="yVal"
              tick={{ fontSize: 11, fill: 'var(--text3)' }}
              axisLine={false} tickLine={false} width={32}
            >
              <Label
                value={yStat} angle={-90} position="insideLeft" offset={16}
                style={{ fontSize: 12, fill: 'var(--text2)' }}
              />
            </YAxis>
            <Tooltip
              content={<ScatterTooltip xStat={xStat} yStat={yStat} />}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter
              data={points}
              shape={(props: unknown) => (
                <CustomDot
                  {...(props as DotProps)}
                  allNames={charNames}
                  highlightChar={highlightChar}
                />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* ── Controls ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
          gap: '.75rem 1.25rem',
          marginBottom: '1rem',
        }}>
          {/* Route */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              Route
            </label>
            <select value={route} onChange={e => setRoute(e.target.value as Route)} style={{ width: '100%' }}>
              {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* X-axis stat */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              X Axis
            </label>
            <select value={xStat} onChange={e => setXStat(e.target.value as typeof STAT_KEYS[number])} style={{ width: '100%' }}>
              {STAT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          {/* Y-axis stat */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              Y Axis
            </label>
            <select value={yStat} onChange={e => setYStat(e.target.value as typeof STAT_KEYS[number])} style={{ width: '100%' }}>
              {STAT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          {/* Tier filter */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              Tier Filter
            </label>
            <select
              value={tierFilter}
              onChange={e => { setTierFilter(e.target.value); setClassFilter('Best') }}
              style={{ width: '100%' }}
            >
              {TIER_KEYS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Class override */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              Class
            </label>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ width: '100%' }}>
              <option value="Best">Best (by tier)</option>
              {filteredClasses.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {/* Highlight character */}
          <div>
            <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
              Highlight
            </label>
            <select
              value={highlightChar ?? ''}
              onChange={e => setHighlightChar(e.target.value || null)}
              style={{ width: '100%' }}
            >
              <option value="">None</option>
              {charNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Level slider */}
        <div style={{ marginBottom: '1rem' }}>
          <label className="text-sm" style={{ display: 'block', marginBottom: '.35rem', fontWeight: 600, textAlign: 'center' }}>
            Target Level: {targetLevel}
          </label>
          <input
            type="range" min={1} max={99} step={1} value={targetLevel}
            onChange={e => setTargetLevel(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text3)' }}>
            <span>1</span><span>99</span>
          </div>
        </div>

        {/* Show gains-only toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
          <input
            type="checkbox" id="show-gains-only" checked={showGainsOnly}
            onChange={e => setShowGainsOnly(e.target.checked)}
          />
          <label htmlFor="show-gains-only" className="text-sm">
            Show characters without base stats (hollow points = gains only)
          </label>
        </div>

        {/* Colour legend */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}>
          <div className="text-sm" style={{ fontWeight: 600, marginBottom: '.4rem' }}>Legend</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem .5rem' }}>
            {charNames.map(n => {
              const pt = points.find(p => p.name === n)
              if (!pt) return null
              const color = charColor(n, charNames)
              return (
                <button
                  key={n}
                  onClick={() => toggleHighlight(n)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.3rem',
                    background: highlightChar === n ? 'var(--surface2)' : 'none',
                    border: '1px solid transparent',
                    borderColor: highlightChar === n ? 'var(--accent)' : 'transparent',
                    borderRadius: 3, cursor: 'pointer', padding: '.15rem .4rem',
                  }}
                >
                  <span style={{
                    display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                    background: pt.isGainsOnly ? 'none' : color,
                    border: pt.isGainsOnly ? `2px solid ${color}` : 'none',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '.75rem', color: 'var(--text2)' }}>{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Data table ── */}
      <div className="card">
        <div className="text-sm" style={{ fontWeight: 600, marginBottom: '.5rem' }}>
          {xStat} vs {yStat} at Level {targetLevel} — {route} route
          {classFilter !== 'Best' ? ` — ${classFilter}` : ''}
        </div>
        <div className="table-wrap">
          <table className="stat-proj-table">
            <thead>
              <tr>
                <th>Character</th>
                <th>Class</th>
                <th style={{ textAlign: 'right' }}>{xStat}</th>
                <th style={{ textAlign: 'right' }}>{yStat}</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {[...points]
                .sort((a, b) => b.yVal - a.yVal || b.xVal - a.xVal)
                .map(p => (
                  <tr
                    key={p.name}
                    style={{
                      cursor: 'pointer',
                      background: highlightChar === p.name ? 'var(--surface2)' : undefined,
                    }}
                    onClick={() => toggleHighlight(p.name)}
                  >
                    <td>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: p.isGainsOnly ? 'none' : charColor(p.name, charNames),
                        border: p.isGainsOnly ? `2px solid ${charColor(p.name, charNames)}` : 'none',
                        marginRight: '.4rem', verticalAlign: 'middle',
                      }} />
                      <strong>{p.name}</strong>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{p.className}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {p.xVal.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {p.yVal.toFixed(1)}
                    </td>
                    <td style={{ fontSize: '.75rem', color: p.isGainsOnly ? 'var(--warn)' : 'var(--text3)' }}>
                      {p.isGainsOnly ? 'gains only' : ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
