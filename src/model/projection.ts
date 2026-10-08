/**
 * projection.ts — Compute expected stats for a character in a single class
 * across a level range. Used by the Compare and Scatter views.
 *
 * Simpler than the full plan model: takes one class for the whole range,
 * no segment management needed.
 */

import type {
  StatBlock, ClassDef, MountDef, ClassPassive,
  PlannerSettings,
} from './types'
import { STAT_KEYS, zeroStats } from './types'
import { clampGrowth } from './growth'
import { mountGrowth } from './mounts'
import { activePassive } from './growth'

/**
 * Expected stat projection for a character in a single class from
 * joinLevel to targetLevel.
 *
 * Returns:
 * - planGains: expected stat gains from [joinLevel, targetLevel]
 * - totalGrowths: the clamped total growth % per stat (for display)
 */
export function singleClassProjection(
  personalGrowths: StatBlock,
  joinLevel: number,
  targetLevel: number,
  classDef: ClassDef,
  mountDef: MountDef | null,
  mountBond: number,
  passives: ClassPassive[],
  settings: PlannerSettings,
): { planGains: StatBlock; totalGrowths: StatBlock } {
  const planGains = zeroStats()
  const totalGrowths = zeroStats()

  if (targetLevel <= joinLevel) return { planGains, totalGrowths }

  // Compute average total growths (for display; varies with passives per level)
  for (const k of STAT_KEYS) {
    const mBonus = mountDef ? mountGrowth(classDef, mountDef, mountBond, k, settings) : 0
    totalGrowths[k] = clampGrowth(personalGrowths[k] + classDef.growths[k] + mBonus, settings)
  }

  for (let level = joinLevel; level <= targetLevel; level++) {
    const passive = activePassive(classDef.name, level, passives, settings)
    for (const k of STAT_KEYS) {
      const mBonus = mountDef ? mountGrowth(classDef, mountDef, mountBond, k, settings) : 0
      const passiveBonus = passive ? passive.growths[k] : 0
      const g = clampGrowth(personalGrowths[k] + classDef.growths[k] + passiveBonus + mBonus, settings)
      planGains[k] += g / 100
    }
  }

  return { planGains, totalGrowths }
}

/**
 * Full projected stats (base + autolevel + classGains) for a character.
 * Returns null for stats where base is unknown (no base_stats row).
 */
export function projectedStats(
  baseStat: StatBlock | null,
  _baseLevel: number,
  autoLevelGains: StatBlock,
  planGains: StatBlock,
): StatBlock | null {
  if (!baseStat) return null
  const out = zeroStats()
  for (const k of STAT_KEYS) {
    out[k] = baseStat[k] + autoLevelGains[k] + planGains[k]
  }
  return out
}
