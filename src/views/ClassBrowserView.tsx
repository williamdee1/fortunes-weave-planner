import { useState, useMemo } from 'react'
import { classGrowths, charMap } from '../data/loader'
import { TierBadge, WarnBadge } from '../components/Tooltip'
import { STAT_KEYS } from '../model/types'
import type { ClassDef } from '../model/types'

type SortKey = 'name' | 'tier' | 'idealExamLevel' | 'renownReq' | typeof STAT_KEYS[number]
type SortDir = 'asc' | 'desc'

const TIER_ORDER: Record<string, number> = {
  Base: 0, Beginner: 1, Specialty: 2, Advanced: 3, Master: 4, Divine: 5,
}

export function ClassBrowserView() {
  const [sortKey, setSortKey] = useState<SortKey>('tier')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterTier, setFilterTier] = useState('')
  const [showTotalsFor, setShowTotalsFor] = useState('')
  const [filterText, setFilterText] = useState('')

  const selectedChar = charMap.get(showTotalsFor)

  const sorted = useMemo(() => {
    let rows = [...classGrowths]

    if (filterTier) rows = rows.filter(c => c.tier === filterTier)
    if (filterText) {
      const q = filterText.toLowerCase()
      rows = rows.filter(c => c.name.toLowerCase().includes(q))
    }

    rows.sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'tier') { va = TIER_ORDER[a.tier] ?? 0; vb = TIER_ORDER[b.tier] ?? 0 }
      else if (sortKey === 'idealExamLevel') { va = a.idealExamLevel ?? -1; vb = b.idealExamLevel ?? -1 }
      else if (sortKey === 'renownReq') {
        va = a.renownReq === 'Part 3' ? 99 : (a.renownReq ?? -1)
        vb = b.renownReq === 'Part 3' ? 99 : (b.renownReq ?? -1)
      } else {
        va = a.growths[sortKey as typeof STAT_KEYS[number]]
        vb = b.growths[sortKey as typeof STAT_KEYS[number]]
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return rows
  }, [sortKey, sortDir, filterTier, filterText])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function colHeader(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th onClick={() => handleSort(key)} style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}>
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  function totalGrowth(cls: ClassDef, stat: typeof STAT_KEYS[number]) {
    const personal = selectedChar?.growths[stat] ?? 0
    return personal + cls.growths[stat]
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
        <h1>Class Browser</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Filter by name…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{ width: 160 }}
          />
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)}>
            <option value="">All tiers</option>
            {['Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine'].map(t =>
              <option key={t} value={t}>{t}</option>
            )}
          </select>
          <select
            value={showTotalsFor}
            onChange={e => setShowTotalsFor(e.target.value)}
            title="Show total growths for a character"
          >
            <option value="">Show totals for…</option>
            {[...charMap.keys()].sort().map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {showTotalsFor && (
        <div className="badge badge-info" style={{ marginBottom: '.5rem', fontSize: '.8125rem' }}>
          Showing <strong>{showTotalsFor}</strong>'s personal growths + class modifier = total
        </div>
      )}

      <div className="table-wrap">
        <table className="sortable">
          <thead>
            <tr>
              {colHeader('name', 'Class')}
              {colHeader('tier', 'Tier')}
              {colHeader('idealExamLevel', 'Ideal Lv')}
              {colHeader('renownReq', 'Renown')}
              <th>Unlocks</th>
              <th>Mounts</th>
              {STAT_KEYS.map(k => colHeader(k, k))}
              <th>Skills</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(cls => (
              <tr key={cls.name}>
                <td>
                  <strong>{cls.name}</strong>
                  {cls.isExclusive && (
                    <span className="badge badge-warn" style={{ marginLeft: '.35rem' }}>exclusive</span>
                  )}
                </td>
                <td><TierBadge tier={cls.tier} /></td>
                <td style={{ textAlign: 'right' }}>{cls.idealExamLevel ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {cls.renownReq === 'Part 3' ? <span className="badge badge-tier-Master">Part 3</span>
                    : cls.renownReq ?? '—'}
                </td>
                <td style={{ fontSize: '.75rem', color: 'var(--text2)' }}>
                  {cls.unlockRoutes
                    ? cls.unlockRoutes.join(', ')
                    : <span className="text-muted">All</span>}
                </td>
                <td style={{ fontSize: '.75rem' }}>
                  {getMountLabel(cls)}
                </td>
                {STAT_KEYS.map(k => {
                  const mod = cls.growths[k]
                  const total = showTotalsFor && selectedChar ? totalGrowth(cls, k) : null
                  return (
                    <td key={k} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: mod > 0 ? 'var(--success)' : mod < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                        {mod > 0 ? '+' : ''}{mod}
                      </span>
                      {total !== null && (
                        <div style={{ fontSize: '.7rem', color: 'var(--text2)' }}>({total}%)</div>
                      )}
                    </td>
                  )
                })}
                <td style={{ fontSize: '.75rem', maxWidth: 160, color: 'var(--text2)' }}>
                  {cls.skillRequirements
                    ? cls.skillRequirements
                    : <WarnBadge title="Skill requirements for this class are not yet documented." />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-muted mt-3">{sorted.length} classes shown</div>
    </div>
  )
}

function getMountLabel(cls: ClassDef): React.ReactNode {
  const mounts: string[] = []
  const { mountMultipliers: mm } = cls
  if (mm.Horse > 0) mounts.push(`Horse ×${mm.Horse}`)
  if (mm.Ornius > 0) mounts.push(`Ornius ×${mm.Ornius}`)
  if (mm.Pegasus > 0) mounts.push(`Pegasus ×${mm.Pegasus}`)
  if (mm.Bau > 0) mounts.push(`Bau ×${mm.Bau}`)
  if (mm.Elephant > 0) mounts.push(`Elephant ×${mm.Elephant}`)
  if (mm.Wyvern > 0) mounts.push(`Wyvern ×${mm.Wyvern}`)
  if (mm.Griffon > 0) mounts.push(`Griffon ×${mm.Griffon}`)
  return mounts.length ? mounts.join(', ') : <span className="text-muted">—</span>
}
