/**
 * GrowthChart — Recharts bar chart showing total growth % per stat.
 * Used in the character planner to visualise the selected class segment's growths.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import type { StatBlock } from '../model/types'
import { STAT_KEYS } from '../model/types'

const STAT_COLORS: Record<string, string> = {
  HP: '#56B4E9', Str: '#E69F00', Mag: '#CC79A7', Spd: '#009E73',
  Dex: '#D55E00', Def: '#0072B2', Res: '#B8A000', Lck: '#888888', Cha: '#7B2D8B',
}

interface GrowthChartProps {
  /** Total growth % per stat (clamped 0-100) */
  growths: StatBlock
  /** Optional second set (e.g. personal only) shown as a fainter bar */
  personalGrowths?: StatBlock
  height?: number
  title?: string
}

export function GrowthChart({ growths, personalGrowths, height = 200, title }: GrowthChartProps) {
  const data = STAT_KEYS.map(k => ({
    stat: k,
    total: Math.round(growths[k]),
    personal: personalGrowths ? Math.round(personalGrowths[k]) : undefined,
  }))

  return (
    <div>
      {title && <div style={{ fontSize: '.8125rem', color: 'var(--text2)', marginBottom: '.25rem' }}>{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="stat" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            formatter={(value: number, name: string) => [`${value}%`, name === 'total' ? 'Total growth' : 'Personal']}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ fontWeight: 600 }}
          />
          <ReferenceLine y={50} stroke="var(--text3)" strokeDasharray="4 2" />
          {personalGrowths && (
            <Bar dataKey="personal" name="personal" fill="var(--border)" radius={[2, 2, 0, 0]} opacity={0.5} />
          )}
          <Bar dataKey="total" name="total" radius={[3, 3, 0, 0]}>
            {data.map(d => (
              <Cell key={d.stat} fill={STAT_COLORS[d.stat] ?? '#888'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Small inline growth bar used in tables */
export function GrowthBar({ value, stat }: { value: number; stat: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = STAT_COLORS[stat] ?? '#888'
  return (
    <div className="growth-bar-wrap">
      <span style={{ width: '2.5rem', textAlign: 'right', flexShrink: 0 }}>{value}%</span>
      <div className="growth-bar-track">
        <div className="growth-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
