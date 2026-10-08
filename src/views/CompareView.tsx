/**
 * CompareView — Bar chart comparing two characters in chosen classes at a given level.
 * Mirrors the FE Engage bar chart comparison tool.
 *
 * Stats shown = base + auto-level gains + gains from staying in the chosen class
 * from join level to target level. Characters without base stats show gains only.
 */
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useApp } from '../context/AppContext'
import {
  charMap, classMap, baseStatMap,
  mountGrowths, classPassiveGrowths,
  getJoinLevel, LORDS, LATER_GAME,
} from '../data/loader'
import { classGrowths } from '../data/loader'
import { autoLevelGainsForChar, postJoinGrowths } from '../model/autolevel'
import { singleClassProjection, projectedStats } from '../model/projection'
import { STAT_KEYS, zeroStats } from '../model/types'
import type { StatBlock } from '../model/types'
import { bestMountForClass } from '../model/mounts'
import { PRESET_OBJECTIVES } from '../model/growth'

const CHAR_COLORS = ['#2563eb', '#dc2626'] // blue, red

function joinLevelFor(name: string, route: typeof import('../model/types').ROUTES[number], part3StartLevel: number) {
  if (LORDS.has(name)) return name === route ? 1 : 1
  if (LATER_GAME.has(name)) return part3StartLevel
  return getJoinLevel(name, route) ?? 1
}

interface CharClassPair {
  charName: string
  className: string
}

export function CompareView() {
  const { settings } = useApp()

  const [pair, setPair] = useState<[CharClassPair, CharClassPair]>([
    { charName: 'Cai',  className: 'Myrmidon' },
    { charName: 'Leda', className: 'Dancer'   },
  ])
  const [targetLevel, setTargetLevel] = useState(37)

  const charNames = useMemo(() => [...charMap.keys()].sort(), [])

  function updateChar(idx: 0 | 1, charName: string) {
    const firstClass = classGrowths[0]?.name ?? 'Commoner'
    setPair(p => {
      const next = [...p] as typeof pair
      next[idx] = { charName, className: firstClass }
      return next
    })
  }

  function updateClass(idx: 0 | 1, className: string) {
    setPair(p => {
      const next = [...p] as typeof pair
      next[idx] = { ...next[idx]!, className }
      return next
    })
  }

  // Compute stats for one slot
  function computeSlot(slot: CharClassPair, label: string): { stats: StatBlock; isGainsOnly: boolean; label: string } {
    const charData = charMap.get(slot.charName)
    if (!charData) return { stats: zeroStats(), isGainsOnly: true, label }

    const baseStatRow = baseStatMap.get(slot.charName) ?? null
    const baseLevel = baseStatRow?.level ?? 1
    const joinLevel = joinLevelFor(slot.charName, 'Cai', settings.part3StartLevel)
    const effectiveJoin = Math.max(baseLevel, Math.min(joinLevel, targetLevel))

    const personalGrowths = postJoinGrowths(charData.growths, charData.baseGrowthsWithoutAbility, settings)

    const autoGains = autoLevelGainsForChar(
      charData.growths, charData.baseGrowthsWithoutAbility, baseLevel, effectiveJoin, settings,
    )

    const classDef = classMap.get(slot.className)
    if (!classDef) return { stats: autoGains, isGainsOnly: !baseStatRow, label }

    const mountDef = bestMountForClass(
      classDef, mountGrowths, 5,
      PRESET_OBJECTIVES['Balanced']!, settings,
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

    if (total) {
      return { stats: total, isGainsOnly: false, label }
    }
    // Gains only: autolevel + plan gains
    const gainsOnly = zeroStats()
    for (const k of STAT_KEYS) gainsOnly[k] = autoGains[k] + planGains[k]
    return { stats: gainsOnly, isGainsOnly: true, label }
  }

  const slots = useMemo(() => {
    // Build display labels (append class if same character)
    const [s0, s1] = pair
    const sameName = s0!.charName === s1!.charName
    const label0 = sameName ? `${s0!.charName} (${s0!.className})` : s0!.charName
    const label1 = sameName ? `${s1!.charName} (${s1!.className})` : s1!.charName
    return [
      computeSlot(s0!, label0),
      computeSlot(s1!, label1),
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, targetLevel, settings])

  const chartData = useMemo(() => {
    return STAT_KEYS.map(k => ({
      stat: k,
      [slots[0]!.label]: parseFloat(slots[0]!.stats[k].toFixed(1)),
      [slots[1]!.label]: parseFloat(slots[1]!.stats[k].toFixed(1)),
    }))
  }, [slots])

  const gainsOnly = slots[0]!.isGainsOnly || slots[1]!.isGainsOnly

  // Group classes by tier for optgroups
  const classByTier = useMemo(() => {
    const groups: Record<string, typeof classGrowths> = {}
    for (const c of classGrowths) {
      if (!groups[c.tier]) groups[c.tier] = []
      groups[c.tier]!.push(c)
    }
    const ordered: Record<string, typeof classGrowths> = {}
    for (const t of ['Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine']) {
      if (groups[t]) ordered[t] = groups[t]!.sort((a, b) => a.name.localeCompare(b.name))
    }
    return ordered
  }, [])

  const minLevel = useMemo(() => {
    const j0 = joinLevelFor(pair[0]!.charName, 'Cai', settings.part3StartLevel)
    const j1 = joinLevelFor(pair[1]!.charName, 'Cai', settings.part3StartLevel)
    return Math.max(1, Math.min(j0, j1))
  }, [pair, settings])

  const title = `${slots[0]!.label} (${pair[0]!.className}) vs. ${slots[1]!.label} (${pair[1]!.className}) at Level ${targetLevel}`

  return (
    <div>
      <h1 style={{ marginBottom: '.75rem' }}>Character Comparison</h1>

      {gainsOnly && (
        <div className="badge badge-warn" style={{ marginBottom: '.75rem', fontSize: '.8125rem' }}>
          One or both characters lack confirmed base stats — showing growth gains from join level, not absolute stats.
        </div>
      )}

      {/* ── Chart ── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', fontSize: '.875rem', color: 'var(--text2)', marginBottom: '.5rem' }}>
          {title}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: -8 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="stat" tick={{ fontSize: 12, fill: 'var(--text2)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              cursor={{ fill: 'var(--surface2)' }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey={slots[0]!.label} fill={CHAR_COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey={slots[1]!.label} fill={CHAR_COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Controls ── */}
      <div className="card">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem 2rem',
        }}>
          {([0, 1] as const).map(idx => (
            <div key={idx}>
              <div style={{ marginBottom: '.5rem' }}>
                <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
                  Character {idx + 1}
                </label>
                <select
                  value={pair[idx]!.charName}
                  onChange={e => updateChar(idx, e.target.value)}
                  style={{ width: '100%' }}
                >
                  {charNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: '.2rem', fontWeight: 600 }}>
                  Class {idx + 1}
                </label>
                <select
                  value={pair[idx]!.className}
                  onChange={e => updateClass(idx, e.target.value)}
                  style={{ width: '100%' }}
                >
                  {Object.entries(classByTier).map(([tier, classes]) => (
                    <optgroup key={tier} label={tier}>
                      {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              {/* Personal growths mini display */}
              {charMap.get(pair[idx]!.charName) && (
                <div style={{ marginTop: '.5rem', display: 'flex', flexWrap: 'wrap', gap: '.2rem' }}>
                  {STAT_KEYS.map(k => {
                    const g = charMap.get(pair[idx]!.charName)!.growths[k]
                    return (
                      <span key={k} style={{
                        fontSize: '.7rem', padding: '.05rem .35rem', borderRadius: 3,
                        background: 'var(--surface2)', color: 'var(--text2)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {k} {g}%
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Level slider */}
        <div style={{ marginTop: '1.25rem' }}>
          <label className="text-sm" style={{ display: 'block', marginBottom: '.35rem', fontWeight: 600, textAlign: 'center' }}>
            Target Level: {targetLevel}
          </label>
          <input
            type="range"
            min={minLevel}
            max={99}
            step={1}
            value={targetLevel}
            onChange={e => setTargetLevel(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text3)' }}>
            <span>{minLevel}</span>
            <span>99</span>
          </div>
        </div>

        {/* Stats table */}
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="stat-proj-table">
            <thead>
              <tr>
                <th>Stat</th>
                <th style={{ color: CHAR_COLORS[0] }}>{slots[0]!.label}</th>
                <th style={{ color: CHAR_COLORS[1] }}>{slots[1]!.label}</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {STAT_KEYS.map(k => {
                const v0 = slots[0]!.stats[k]
                const v1 = slots[1]!.stats[k]
                const delta = v0 - v1
                return (
                  <tr key={k}>
                    <td><strong>{k}</strong></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: CHAR_COLORS[0], fontWeight: 600 }}>
                      {v0.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: CHAR_COLORS[1], fontWeight: 600 }}>
                      {v1.toFixed(1)}
                    </td>
                    <td style={{
                      textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: delta > 0.05 ? CHAR_COLORS[0] : delta < -0.05 ? CHAR_COLORS[1] : 'var(--text3)',
                      fontWeight: Math.abs(delta) > 0.05 ? 600 : 400,
                    }}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
