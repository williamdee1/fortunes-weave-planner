import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import type { StoredPlan } from '../context/AppContext'
import {
  charMap, classMap, mountMap, baseStatMap,
  recruitMap, joinMap, classGrowths, mountGrowths,
  classPassiveGrowths, getJoinLevel, isRecruitable,
  LORDS, LATER_GAME,
} from '../data/loader'
import { optimize } from '../model/optimizer'
import { expectedStats } from '../model/growth'
import { postJoinGrowths } from '../model/autolevel'
import { isEligible } from '../model/eligibility'
import { weightedScore, PRESET_OBJECTIVES, suggestObjective } from '../model/growth'
import { STAT_KEYS, ROUTES, zeroStats } from '../model/types'
import type { Route, ClassSegment, ObjectiveWeights, StatBlock } from '../model/types'
import { GrowthChart } from '../components/GrowthChart'
import { Tooltip } from '../components/Tooltip'
import type { OptimizedPlan } from '../model/optimizer'

const STAT_COLORS: Record<string, string> = {
  HP: '#56B4E9', Str: '#E69F00', Mag: '#CC79A7', Spd: '#009E73',
  Dex: '#D55E00', Def: '#0072B2', Res: '#B8A000', Lck: '#888888', Cha: '#7B2D8B',
}

function planKey(char: string, route: Route) { return `${char}:${route}` }

function defaultPlan(charName: string, route: Route, joinLevel: number, baseLevel: number): StoredPlan {
  return { characterName: charName, route, joinLevel, baseLevel, segments: [], mountBond: 5 }
}

export function PlannerView() {
  const { settings, setPlan, getPlan, selectedChar } = useApp()
  const [mode, setMode] = useState<'manual' | 'optimize'>('manual')
  const [localChar, setLocalChar] = useState(selectedChar ?? '')
  const [localRoute, setLocalRoute] = useState<Route>(
    selectedChar ? (ROUTES.find(r => isRecruitable(selectedChar, r)) ?? 'Cai') : 'Cai'
  )
  const [objectiveName, setObjectiveName] = useState('Physical attacker')
  const [targetLevel, setTargetLevel] = useState(settings.finalTargetLevel)
  const [optimizeResults, setOptimizeResults] = useState<OptimizedPlan[]>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [endingClass, setEndingClass] = useState('')
  const [meetsReqs, setMeetsReqs] = useState<Record<number, boolean>>({})

  const charName = localChar
  const route = localRoute

  // Sync when selectedChar changes from context (e.g. "Plan →" button in route view)
  useMemo(() => {
    if (selectedChar && selectedChar !== localChar) {
      setLocalChar(selectedChar)
      const firstRoute = ROUTES.find(r => isRecruitable(selectedChar, r)) ?? 'Cai'
      setLocalRoute(firstRoute)
    }
  }, [selectedChar]) // eslint-disable-line react-hooks/exhaustive-deps

  const charData = charMap.get(charName)
  const baseStatRow = baseStatMap.get(charName) ?? null
  const baseLevel = baseStatRow?.level ?? 1

  const joinLevel = useMemo(() => {
    if (LORDS.has(charName)) return charName === route ? 1 : null
    if (LATER_GAME.has(charName)) return settings.part3StartLevel
    return getJoinLevel(charName, route)
  }, [charName, route, settings])

  const key = planKey(charName, route)
  const storedPlan = getPlan(key)
  const effectiveJoinLevel = storedPlan?.joinLevel ?? joinLevel ?? baseLevel
  const plan: StoredPlan = storedPlan ?? defaultPlan(charName, route, effectiveJoinLevel, baseLevel)

  function updatePlan(patch: Partial<StoredPlan>) {
    setPlan(key, { ...plan, ...patch })
  }

  function updateJoinLevel(lv: number) {
    updatePlan({ joinLevel: Math.max(baseLevel, lv) })
  }

  // Objective weights
  const objective = (PRESET_OBJECTIVES[objectiveName] ?? PRESET_OBJECTIVES['Physical attacker']) as ObjectiveWeights

  // Personal growths (respecting settings)
  const personalGrowths = useMemo(() => {
    if (!charData) return zeroStats()
    return postJoinGrowths(charData.growths, charData.baseGrowthsWithoutAbility, settings)
  }, [charData, settings])

  const autoLevelPersonalGrowths = useMemo(() => {
    if (!charData) return zeroStats()
    return charData.baseGrowthsWithoutAbility ?? charData.growths
  }, [charData])

  // Stat projection
  const projection = useMemo(() => {
    if (!charData) return null
    return expectedStats(
      baseStatRow?.stats ?? null,
      baseLevel,
      personalGrowths,
      autoLevelPersonalGrowths,
      plan.joinLevel,
      targetLevel,
      plan.segments,
      classMap,
      mountMap,
      classPassiveGrowths,
      settings,
    )
  }, [charData, baseStatRow, baseLevel, personalGrowths, autoLevelPersonalGrowths, plan, targetLevel, settings])

  // Validation warnings per segment
  const segmentWarnings = useMemo(() => {
    const warnings: Record<number, string[]> = {}
    if (!charData) return warnings
    for (let i = 0; i < plan.segments.length; i++) {
      const seg = plan.segments[i]!
      const cls = classMap.get(seg.className)
      if (!cls) { warnings[i] = [`Unknown class: ${seg.className}`]; continue }
      const w: string[] = []
      const check = isEligible(cls, seg.fromLevel, route, new Set(), settings)
      if (!check.eligible) w.push(...check.reasons)
      if (seg.toLevel < seg.fromLevel) w.push('End level must be ≥ start level')
      if (cls.skillRequirements === null) w.push(`Skill requirements for ${cls.name} are unknown`)
      if (meetsReqs[i] === false) w.push('You indicated this character does not meet skill requirements')
      warnings[i] = w
    }
    // Check for gaps/overlaps
    const sorted = [...plan.segments].sort((a, b) => a.fromLevel - b.fromLevel)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const cur = sorted[i]!
      if (cur.fromLevel <= prev.toLevel) {
        warnings[i] = [...(warnings[i] ?? []), `Overlaps with previous segment (ends at ${prev.toLevel})`]
      } else if (cur.fromLevel > prev.toLevel + 1) {
        warnings[i] = [...(warnings[i] ?? []), `Gap: levels ${prev.toLevel + 1}–${cur.fromLevel - 1} have no class`]
      }
    }
    return warnings
  }, [plan.segments, route, settings, charData, meetsReqs])

  // Current class growths for the chart (first segment, or first eligible class)
  const chartSeg = plan.segments[0] ?? null
  const chartClass = chartSeg ? classMap.get(chartSeg.className) : null
  const chartGrowths: StatBlock = useMemo(() => {
    if (!chartClass || !charData) return zeroStats()
    const g = zeroStats()
    for (const k of STAT_KEYS) {
      g[k] = Math.max(settings.growthClampMin, Math.min(settings.growthClampMax,
        personalGrowths[k] + chartClass.growths[k]
      ))
    }
    return g
  }, [chartClass, charData, personalGrowths, settings])

  // Eligible classes for dropdown (at a given level)
  function eligibleForLevel(level: number) {
    return classGrowths.filter(cls =>
      isEligible(cls, level, route, new Set(), settings).eligible
    )
  }

  function addSegment() {
    const lastSeg = plan.segments[plan.segments.length - 1]
    const fromLevel = lastSeg ? lastSeg.toLevel + 1 : plan.joinLevel
    const eligible = eligibleForLevel(fromLevel)
    const className = eligible[0]?.name ?? classGrowths[0]?.name ?? 'Commoner'
    const newSeg: ClassSegment = { className, fromLevel, toLevel: fromLevel + 9, mountSubtype: null, mountBond: plan.mountBond }
    updatePlan({ segments: [...plan.segments, newSeg] })
  }

  function removeSegment(i: number) {
    updatePlan({ segments: plan.segments.filter((_, j) => j !== i) })
  }

  function updateSegment(i: number, patch: Partial<ClassSegment>) {
    const segs = plan.segments.map((s, j) => j === i ? { ...s, ...patch } : s)
    updatePlan({ segments: segs })
  }

  function runOptimize() {
    if (!charData) return
    setIsOptimizing(true)
    // Use setTimeout to let the UI update first
    setTimeout(() => {
      try {
        const results = optimize({
          characterName: charName,
          route,
          personalGrowths,
          joinLevel: plan.joinLevel,
          targetLevel,
          allClasses: classGrowths,
          allMounts: mountGrowths,
          passives: classPassiveGrowths,
          weights: objective,
          settings,
          endingClass: endingClass || undefined,
          defaultBond: plan.mountBond,
          unlockedRoutes: new Set(),
        }, 3)
        setOptimizeResults(results)
      } finally {
        setIsOptimizing(false)
      }
    }, 10)
  }

  function loadOptimizedPlan(result: OptimizedPlan) {
    updatePlan({ segments: result.segments })
    setMode('manual')
  }

  if (!charName) {
    return (
      <div>
        <h1 style={{ marginBottom: '.75rem' }}>Character Planner</h1>
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem' }}>⚔</div>
            <p>Select a character to start planning.</p>
            <div style={{ marginTop: '1rem' }}>
              <select
                value=""
                onChange={e => { if (e.target.value) { setLocalChar(e.target.value); } }}
                style={{ minWidth: 200 }}
              >
                <option value="">Choose a character…</option>
                {[...charMap.keys()].sort().map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!charData) {
    return <div className="card"><p className="text-muted">Character data not found for "{charName}".</p></div>
  }

  const recruitEntry = recruitMap.get(charName)?.routes[route]
  const joinEntry = joinMap.get(charName)?.routes[route]

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* ── Header ── */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div>
            <select
              value={charName}
              onChange={e => {
                setLocalChar(e.target.value)
                const firstRoute = ROUTES.find(r => isRecruitable(e.target.value, r)) ?? 'Cai'
                setLocalRoute(firstRoute)
                setOptimizeResults([])
              }}
              style={{ fontSize: '1rem', fontWeight: 700, minWidth: 160 }}
            >
              {[...charMap.keys()].sort().map(n => <option key={n}>{n}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '.35rem' }}>
            {ROUTES.map(r => {
              const available = LORDS.has(charName)
                ? charName === r
                : isRecruitable(charName, r)
              return (
                <button
                  key={r}
                  className={`route-tab${route === r ? ' active' : ''}`}
                  onClick={() => { setLocalRoute(r); setOptimizeResults([]) }}
                  disabled={!available}
                  style={{ padding: '.3rem .8rem', opacity: available ? 1 : 0.4 }}
                >
                  {r}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
            <label style={{ fontSize: '.875rem' }}>
              Objective:
              <select
                value={objectiveName}
                onChange={e => setObjectiveName(e.target.value)}
                style={{ marginLeft: '.35rem' }}
              >
                {Object.keys(PRESET_OBJECTIVES).map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setObjectiveName(suggestObjective(charData.growths))}
              title="Suggest best objective for this character's growths"
            >
              ✦ Suggest
            </button>
          </div>
        </div>

        {/* Personal growths */}
        <div className="flex items-center gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
          <span className="text-sm text-muted">Personal growths:</span>
          {STAT_KEYS.map(k => (
            <span key={k} className="stat-pill" style={{ background: STAT_COLORS[k] + '22', color: STAT_COLORS[k] }}>
              {k} {charData.growths[k]}%
            </span>
          ))}
          {charData.baseGrowthsWithoutAbility && (
            <span className="badge badge-info" style={{ marginLeft: '.25rem' }}>
              Signs of Growth: {settings.muSignsOfGrowthActive ? 'ON' : 'OFF'}
            </span>
          )}
        </div>

        {/* Recruitment info */}
        <div className="flex items-center gap-3 mt-2" style={{ flexWrap: 'wrap', fontSize: '.8125rem' }}>
          <span className="text-muted">
            {recruitEntry?.type === 'auto'
              ? `Auto-recruit (Ch ${recruitEntry.chapter ?? '?'})`
              : recruitEntry?.type === 'normal'
                ? `Support ${recruitEntry.supportRequired} | Renown ${recruitEntry.renownRequired}`
                : LORDS.has(charName) ? `Lord (joins Ch 1 on ${charName}'s route)` : 'Not recruitable'
            }
          </span>
          {joinEntry && (
            <span>
              Join: Ch {joinEntry.chapterMin}{joinEntry.chapterMax !== joinEntry.chapterMin ? `–${joinEntry.chapterMax}` : ''}
              {' '}· Lv {joinEntry.levelMin}{joinEntry.levelMax !== joinEntry.levelMin ? `–${joinEntry.levelMax}` : ''}
              {joinEntry.confirmed && <span className="badge badge-ok" style={{ marginLeft: '.25rem' }}>✓ confirmed</span>}
              {joinEntry.paralogueGated && <span className="badge badge-warn" style={{ marginLeft: '.25rem' }}>† paralogue</span>}
              {joinEntry.calendarGated && <span className="badge badge-info" style={{ marginLeft: '.25rem' }}>‡ calendar</span>}
            </span>
          )}
        </div>
      </div>

      {/* ── Join level + target ── */}
      <div className="card flex items-center gap-4 mb-2" style={{ flexWrap: 'wrap' }}>
        <label className="flex items-center gap-2 text-sm">
          Join level:
          <input type="number" min={1} max={99} step={1}
            value={plan.joinLevel}
            onChange={e => updateJoinLevel(parseInt(e.target.value) || 1)}
          />
          <Tooltip text="The level this character arrives at after auto-levelling. Default is the earliest estimated join level. Recruiting later increases auto-level penalty." />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Target level:
          <input type="number" min={plan.joinLevel + 1} max={99} step={1}
            value={targetLevel}
            onChange={e => setTargetLevel(parseInt(e.target.value) || settings.finalTargetLevel)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Default mount bond:
          <input type="number" min={1} max={6} step={1}
            value={plan.mountBond}
            onChange={e => updatePlan({ mountBond: parseInt(e.target.value) || 5 })}
          />
        </label>
        {!baseStatRow && (
          <span className="badge badge-warn">
            No base stats — showing gains only
            <Tooltip text="Only 18 story characters have confirmed base stats. For this character, projected totals can't be computed — only growth gains are shown." />
          </span>
        )}
      </div>

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="mode-toggle">
          <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual</button>
          <button className={mode === 'optimize' ? 'active' : ''} onClick={() => setMode('optimize')}>Optimize</button>
        </div>
      </div>

      {/* ═══════════════ MANUAL MODE ═══════════════ */}
      {mode === 'manual' && (
        <div>
          {/* Timeline */}
          <div className="card mb-2">
            <div className="flex items-center gap-3 mb-2">
              <h3>Class timeline</h3>
              <button className="btn btn-primary btn-sm" onClick={addSegment}>+ Add segment</button>
            </div>

            {plan.segments.length === 0 && (
              <div className="empty-state" style={{ padding: '1.25rem' }}>
                <p>No class segments yet. Add a segment or run the optimizer.</p>
              </div>
            )}

            {plan.segments.map((seg, i) => {
              const cls = classMap.get(seg.className)
              const warnings = segmentWarnings[i] ?? []
              const hasWarn = warnings.length > 0
              const eligibleNow = eligibleForLevel(seg.fromLevel)
              const eligibleByTier = groupByTier(eligibleNow)
              const isMounted = cls ? Object.values(cls.mountMultipliers).some(v => v > 0) : false
              const mountsForClass = isMounted && cls
                ? mountGrowths.filter(m => cls.mountMultipliers[m.species] > 0)
                : []

              return (
                <div key={i} className={`segment-row${hasWarn ? ' has-warning' : ''}`}>
                  {/* Class dropdown */}
                  <select
                    value={seg.className}
                    onChange={e => updateSegment(i, { className: e.target.value })}
                  >
                    {Object.entries(eligibleByTier).map(([tier, classes]) => (
                      <optgroup key={tier} label={tier}>
                        {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </optgroup>
                    ))}
                    {/* If current class not in eligible list, show it anyway */}
                    {!eligibleNow.find(c => c.name === seg.className) && (
                      <optgroup label="⚠ Not eligible at this level">
                        <option value={seg.className}>{seg.className}</option>
                      </optgroup>
                    )}
                  </select>

                  {/* Level range */}
                  <label className="flex items-center gap-1 text-sm">
                    Lv
                    <input type="number" min={1} max={99}
                      value={seg.fromLevel}
                      onChange={e => updateSegment(i, { fromLevel: parseInt(e.target.value) || seg.fromLevel })}
                    />
                    –
                    <input type="number" min={seg.fromLevel} max={99}
                      value={seg.toLevel}
                      onChange={e => updateSegment(i, { toLevel: parseInt(e.target.value) || seg.toLevel })}
                    />
                  </label>

                  {/* Mount selector */}
                  {isMounted ? (
                    <select
                      value={seg.mountSubtype ?? ''}
                      onChange={e => updateSegment(i, { mountSubtype: e.target.value || null })}
                      style={{ minWidth: 140 }}
                    >
                      <option value="">No mount</option>
                      {mountsForClass.map(m => <option key={m.subtype} value={m.subtype}>{m.subtype}</option>)}
                    </select>
                  ) : (
                    <span style={{ color: 'var(--text3)', fontSize: '.75rem' }}>—</span>
                  )}

                  {/* Meets requirements checkbox */}
                  {cls?.skillRequirements === null ? (
                    <label className="flex items-center gap-1 text-sm" title="Requirements unknown — tick if you believe they're met">
                      <input
                        type="checkbox"
                        checked={meetsReqs[i] !== false}
                        onChange={e => setMeetsReqs(r => ({ ...r, [i]: e.target.checked }))}
                      />
                      <span style={{ fontSize: '.7rem', color: 'var(--warn)' }}>reqs?</span>
                    </label>
                  ) : (
                    <span style={{ fontSize: '.7rem', color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cls?.skillRequirements ?? ''}>
                      {cls?.skillRequirements?.slice(0, 18) ?? '—'}
                    </span>
                  )}

                  {/* Warnings */}
                  {hasWarn ? (
                    <span title={warnings.join('\n')} style={{ color: 'var(--warn)', cursor: 'help', fontSize: '.875rem' }}>⚠</span>
                  ) : <span />}

                  {/* Remove */}
                  <button className="btn btn-ghost btn-xs" onClick={() => removeSegment(i)} title="Remove segment">✕</button>
                </div>
              )
            })}
          </div>

          {/* Stat projection */}
          {projection && (
            <div className="card mb-2">
              <h3 style={{ marginBottom: '.5rem' }}>
                Projected stats at Lv {targetLevel}
                {!baseStatRow && <span className="text-muted" style={{ fontWeight: 400, marginLeft: '.35rem' }}>— gains only (no base stats)</span>}
              </h3>
              <div className="table-wrap">
                <table className="stat-proj-table">
                  <thead>
                    <tr>
                      <th>Stat</th>
                      {baseStatRow && <th>Base (Lv {baseLevel})</th>}
                      <th>Auto-level +</th>
                      <th>Plan gains +</th>
                      {baseStatRow && <th className="total-col">Total</th>}
                      <th className="sd-col">±SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_KEYS.map(k => {
                      const base = baseStatRow?.stats[k] ?? null
                      const auto = projection.autoLevelGains[k]
                      const gains = projection.planGains[k]
                      const total = projection.absoluteStat?.[k] ?? null
                      const sd = projection.planGainsSd[k]
                      return (
                        <tr key={k}>
                          <td>
                            <span className="stat-pill" style={{ background: STAT_COLORS[k] + '22', color: STAT_COLORS[k] }}>
                              {k}
                            </span>
                          </td>
                          {baseStatRow && <td>{base}</td>}
                          <td>+{auto.toFixed(1)}</td>
                          <td>+{gains.toFixed(1)}</td>
                          {baseStatRow && <td className="total-col">{total !== null ? total.toFixed(1) : '—'}</td>}
                          <td className="sd-col">±{sd.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Growth chart */}
          {plan.segments.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: '.5rem' }}>
                Growth rates — {chartSeg?.className ?? ''}
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: '.35rem', fontSize: '.8125rem' }}>
                  personal (faint) + class modifier (solid)
                </span>
              </h3>
              <GrowthChart growths={chartGrowths} personalGrowths={personalGrowths} height={200} />
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ OPTIMIZE MODE ═══════════════ */}
      {mode === 'optimize' && (
        <div>
          <div className="card mb-2">
            <h3 style={{ marginBottom: '.6rem' }}>Optimizer settings</h3>
            <div className="toolbar">
              <label className="flex items-center gap-2 text-sm">
                Objective:
                <select value={objectiveName} onChange={e => setObjectiveName(e.target.value)}>
                  {Object.keys(PRESET_OBJECTIVES).map(n => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                Lock ending class:
                <select
                  value={endingClass}
                  onChange={e => setEndingClass(e.target.value)}
                  style={{ minWidth: 160 }}
                >
                  <option value="">Free (best class)</option>
                  {classGrowths.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <button
                className="btn btn-primary"
                onClick={runOptimize}
                disabled={isOptimizing || !charData}
              >
                {isOptimizing ? 'Optimizing…' : '✦ Optimize'}
              </button>
            </div>

            <div style={{ marginTop: '.5rem', fontSize: '.8125rem', color: 'var(--text2)' }}>
              Finds the class sequence maximising expected {objectiveName} gains
              from Lv {plan.joinLevel} to Lv {targetLevel}.
              Switch penalty: {settings.switchPenalty}.
              <Tooltip text="The optimizer uses dynamic programming over (level, class) states. It respects tier gates, Renown requirements, and route-exclusive unlock rules." />
            </div>
          </div>

          {optimizeResults.length === 0 && !isOptimizing && (
            <div className="empty-state">
              <div style={{ fontSize: '2rem' }}>⚙</div>
              <p>Click Optimize to find the best class plan.</p>
            </div>
          )}

          {optimizeResults.map((result, i) => (
            <OptPlanCard
              key={i}
              result={result}
              rank={i + 1}
              objective={objective}
              personalGrowths={personalGrowths}
              onLoad={() => loadOptimizedPlan(result)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Optimizer result card ────────────────────────────────────────────────────

function OptPlanCard({
  result, rank, objective, onLoad,
}: {
  result: OptimizedPlan
  rank: number
  objective: ObjectiveWeights
  personalGrowths?: StatBlock
  onLoad: () => void
}) {
  const segStr = result.segments
    .map(s => `Lv ${s.fromLevel}–${s.toLevel}: ${s.className}${s.mountSubtype ? ` (${s.mountSubtype})` : ''}`)
    .join(' → ')

  const score = weightedScore(result.planGains, objective)

  return (
    <div className={`opt-plan-card${rank === 1 ? ' top' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`badge${rank === 1 ? ' badge-ok' : ' badge-neutral'}`}>#{rank}</span>
        <strong>{result.endingClass}</strong>
        <span className="plan-score text-sm text-muted">Score: {score.toFixed(2)}</span>
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={onLoad}>
          Load plan
        </button>
      </div>
      <div className="plan-segments mt-2">{segStr}</div>
      <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
        {STAT_KEYS.map(k => (
          <span key={k} className="stat-pill" style={{ background: STAT_COLORS[k] + '22', color: STAT_COLORS[k] }}>
            {k} +{result.planGains[k].toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Group classes by tier for optgroup ──────────────────────────────────────

function groupByTier(classes: typeof classGrowths) {
  const groups: Record<string, typeof classGrowths> = {}
  for (const c of classes) {
    const tier = c.tier
    if (!groups[tier]) groups[tier] = []
    groups[tier]!.push(c)
  }
  // Sort each group by name, return in tier order
  const ordered: Record<string, typeof classGrowths> = {}
  const tiers = ['Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine']
  for (const t of tiers) {
    if (groups[t]) ordered[t] = groups[t]!.sort((a, b) => a.name.localeCompare(b.name))
  }
  return ordered
}
