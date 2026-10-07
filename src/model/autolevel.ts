/**
 * autolevel.ts — Auto-levelling penalty for late recruits (§4.3).
 *
 * CONFIDENCE: LOW–MEDIUM. The formula is unknown; this is a tunable approximation.
 *
 * The key insight: auto-levelled units get no class or mount bonuses during those levels,
 * and players report they fall behind average. autoLevelEfficiency (default 0.85)
 * represents the extra "behind average" penalty.
 *
 * For Mu specifically: her Signs of Growth ability does not apply during auto-levelling
 * (backed by player reports). The function accepts the appropriate growth block.
 */

import type { StatBlock, PlannerSettings } from './types'
import { zeroStats, STAT_KEYS } from './types'

export { computeAutoLevelGains } from './growth'

/**
 * Resolve which personal growths to use for auto-levelling.
 *
 * For Mu (baseGrowthsWithoutAbility !== null):
 *   - If muSignsOfGrowthActive is false, use normal growths anyway (ability is always off).
 *   - During auto-levelling, always use base growths (ability doesn't apply).
 *
 * For everyone else: just use personalGrowths.
 */
export function autoLevelGrowths(
  personalGrowths: StatBlock,
  baseGrowthsWithoutAbility: StatBlock | null,
  _settings: PlannerSettings,
): StatBlock {
  // If this character has base growths (i.e. Mu), always use the base during auto-level
  if (baseGrowthsWithoutAbility !== null) {
    return baseGrowthsWithoutAbility
  }
  return personalGrowths
}

/**
 * Resolve which personal growths to use for *post-join* levels.
 *
 * For Mu: if muSignsOfGrowthActive is true, use the boosted growths (personalGrowths);
 * otherwise use base.
 */
export function postJoinGrowths(
  personalGrowths: StatBlock,
  baseGrowthsWithoutAbility: StatBlock | null,
  settings: PlannerSettings,
): StatBlock {
  if (baseGrowthsWithoutAbility !== null && !settings.muSignsOfGrowthActive) {
    return baseGrowthsWithoutAbility
  }
  return personalGrowths
}

/**
 * Compute auto-level gains for a character joining at joinLevel.
 * This is a convenience wrapper over the core formula in growth.ts.
 *
 * @param personalGrowths         - Full personal growths (from charGrowths.json).
 * @param baseGrowthsWithoutAbility - Mu's base growths, or null.
 * @param baseLevel               - Character's base level (from base_stats.txt, or 1 if unknown).
 * @param joinLevel               - Level character arrives at (after auto-levelling).
 * @param settings                - Global planner settings.
 */
export function autoLevelGainsForChar(
  personalGrowths: StatBlock,
  baseGrowthsWithoutAbility: StatBlock | null,
  baseLevel: number,
  joinLevel: number,
  settings: PlannerSettings,
): StatBlock {
  const growths = autoLevelGrowths(personalGrowths, baseGrowthsWithoutAbility, settings)
  const gains = zeroStats()
  const levels = Math.max(0, joinLevel - baseLevel)
  if (levels === 0) return gains
  for (const k of STAT_KEYS) {
    gains[k] = levels * (growths[k] / 100) * settings.autoLevelEfficiency
  }
  return gains
}
