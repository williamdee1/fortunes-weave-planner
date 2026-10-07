/**
 * growth.ts — Core growth rate and stat calculation functions.
 *
 * All functions are pure. No imports from React or browser APIs.
 *
 * Convention: the class held at level-up L is the class in force *before* L is gained.
 * So a segment fromLevel=12, toLevel=19 contributes level-ups at 12, 13, …, 19
 * (i.e. the unit transitions from level 11→12, 12→13, … 18→19 while in this class).
 */

import type { StatBlock, StatKey, ClassDef, ClassPassive, MountDef, ClassSegment, PlannerSettings, ObjectiveWeights } from './types'
import { STAT_KEYS, zeroStats } from './types'
export type { ObjectiveWeights } from './types'
import { mountGrowth } from './mounts'

// ─────────────────────────────────────────────────────────────────────────────
// Growth rate helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp a total growth to [min, max].
 * The bounds are in PlannerSettings so they can be changed without code edits.
 */
export function clampGrowth(growth: number, settings: PlannerSettings): number {
  return Math.max(settings.growthClampMin, Math.min(settings.growthClampMax, growth))
}

/**
 * Total growth for one stat on one level-up.
 *
 * total = personal + classModifier + mountBonus (clamped)
 *
 * mountBonus is already computed by mountGrowth(); pass 0 if no mount.
 */
export function totalGrowth(
  personalGrowth: number,
  classModifier: number,
  mountBonus: number,
  settings: PlannerSettings,
): number {
  return clampGrowth(personalGrowth + classModifier + mountBonus, settings)
}

// ─────────────────────────────────────────────────────────────────────────────
// Active class passive at a given level
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the active ClassPassive for (className, level), or null.
 * Charioteer's Path: the Lv 45 row replaces the Lv 35 row; they do not stack.
 * Elephant Rider's Path: active from Lv 45.
 */
export function activePassive(
  className: string,
  level: number,
  passives: ClassPassive[],
  settings: PlannerSettings,
): ClassPassive | null {
  if (!settings.classPassivesEnabled) return null
  // Find all passives for this class that are unlocked at `level`
  const eligible = passives.filter(p => p.className === className && level >= p.fromLevel)
  if (eligible.length === 0) return null
  // Return the one with the highest fromLevel (most specific)
  return eligible.reduce((best, p) => p.fromLevel > best.fromLevel ? p : best)
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected gains over a class segment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expected stat gains for one character over one class segment.
 *
 * @param personalGrowths - The character's personal growth rates.
 * @param segment         - The class segment (class, level range, mount).
 * @param classDef        - The class definition (growths, mount multipliers).
 * @param mountDef        - The assigned mount, or null.
 * @param passives        - All class passives (filtered per class inside).
 * @param settings        - Global planner settings.
 * @returns Expected stat gains as a StatBlock (fractional, e.g. 0.9 per level).
 */
export function segmentExpectedGains(
  personalGrowths: StatBlock,
  segment: ClassSegment,
  classDef: ClassDef,
  mountDef: MountDef | null,
  passives: ClassPassive[],
  settings: PlannerSettings,
): StatBlock {
  const gains = zeroStats()

  for (let level = segment.fromLevel; level <= segment.toLevel; level++) {
    const passive = activePassive(classDef.name, level, passives, settings)

    for (const stat of STAT_KEYS) {
      const classModifier = classDef.growths[stat]
      const passiveBonus = passive ? passive.growths[stat] : 0
      const mBonus = mountDef
        ? mountGrowth(classDef, mountDef, segment.mountBond, stat, settings)
        : 0
      const g = totalGrowth(personalGrowths[stat], classModifier + passiveBonus, mBonus, settings)
      gains[stat] += g / 100
    }
  }

  return gains
}

/**
 * Standard deviation of stat gains over a segment (binomial model).
 * σ = √(n · p · (1−p)), where p = growth/100 per level-up.
 */
export function segmentGrowthStdDev(
  personalGrowths: StatBlock,
  segment: ClassSegment,
  classDef: ClassDef,
  mountDef: MountDef | null,
  passives: ClassPassive[],
  settings: PlannerSettings,
): StatBlock {
  const result = zeroStats()
  const n = segment.toLevel - segment.fromLevel + 1

  for (const stat of STAT_KEYS) {
    const classModifier = classDef.growths[stat]
    // Use average passive and mount bonus as approximation for variance
    const passive = activePassive(classDef.name, Math.round((segment.fromLevel + segment.toLevel) / 2), passives, settings)
    const passiveBonus = passive ? passive.growths[stat] : 0
    const mBonus = mountDef ? mountGrowth(classDef, mountDef, segment.mountBond, stat, settings) : 0
    const p = clampGrowth(personalGrowths[stat] + classModifier + passiveBonus + mBonus, settings) / 100
    result[stat] = Math.sqrt(n * p * (1 - p))
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Full expected stat at a target level
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpectedStatResult {
  /** Absolute projected stat (base + autoLevel + planGains). Null when base stats unknown. */
  absoluteStat: StatBlock | null
  /** Growth-derived gains only (from joinLevel to targetLevel). Always available. */
  planGains: StatBlock
  /** Standard deviation of the plan gains (±1σ band). */
  planGainsSd: StatBlock
  /** Auto-level gains (joinLevel → base). */
  autoLevelGains: StatBlock
}

/**
 * Full expected stat calculation per CLAUDE.md §4.1.
 *
 * expectedStat = baseStat + autoLevelGains + Σ segmentGains
 *
 * @param baseStats     - Fixed base stats for the character. null = unknown.
 * @param baseLevel     - The character's base level (from base_stats.txt).
 * @param personalGrowths - Personal growths (boosted/unboosted per settings for Mu).
 * @param autoLevelPersonalGrowths - Growths to use for auto-levelling (Mu = base growths).
 * @param joinLevel     - Level the character joins at.
 * @param targetLevel   - Level we're projecting to.
 * @param segments      - The class plan (must cover [joinLevel, targetLevel]).
 * @param classMap      - Map of className → ClassDef.
 * @param mountMap      - Map of mountSubtype → MountDef.
 * @param passives      - All class passives.
 * @param settings      - Global settings.
 */
export function expectedStats(
  baseStats: StatBlock | null,
  baseLevel: number,
  personalGrowths: StatBlock,
  autoLevelPersonalGrowths: StatBlock,
  joinLevel: number,
  targetLevel: number,
  segments: ClassSegment[],
  classMap: Map<string, ClassDef>,
  mountMap: Map<string, MountDef>,
  passives: ClassPassive[],
  settings: PlannerSettings,
): ExpectedStatResult {
  // Auto-level gains: from baseLevel to joinLevel, no class/mount bonuses
  const autoLevelGains = computeAutoLevelGains(autoLevelPersonalGrowths, baseLevel, joinLevel, settings)

  // Plan gains: over each segment
  const planGains = zeroStats()
  const planGainsSd = zeroStats()

  for (const seg of segments) {
    if (seg.toLevel < joinLevel || seg.fromLevel > targetLevel) continue
    // Clamp segment to [joinLevel, targetLevel]
    const effectiveSeg: ClassSegment = {
      ...seg,
      fromLevel: Math.max(seg.fromLevel, joinLevel),
      toLevel: Math.min(seg.toLevel, targetLevel),
    }
    if (effectiveSeg.fromLevel > effectiveSeg.toLevel) continue

    const classDef = classMap.get(seg.className)
    if (!classDef) continue
    const mountDef = seg.mountSubtype ? mountMap.get(seg.mountSubtype) ?? null : null

    const gains = segmentExpectedGains(personalGrowths, effectiveSeg, classDef, mountDef, passives, settings)
    const sd = segmentGrowthStdDev(personalGrowths, effectiveSeg, classDef, mountDef, passives, settings)

    for (const k of STAT_KEYS) {
      planGains[k] += gains[k]
      // SD adds in quadrature across independent segments
      planGainsSd[k] = Math.sqrt(planGainsSd[k] ** 2 + sd[k] ** 2)
    }
  }

  const absoluteStat = baseStats
    ? (() => {
        const s = zeroStats()
        for (const k of STAT_KEYS) s[k] = baseStats[k] + autoLevelGains[k] + planGains[k]
        return s
      })()
    : null

  return { absoluteStat, planGains, planGainsSd, autoLevelGains }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-level gains (§4.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-level stat gains from baseLevel to joinLevel.
 *
 * formula = (joinLevel - baseLevel) * (personalGrowth / 100) * autoLevelEfficiency
 *
 * No class or mount bonuses during auto-levelling.
 */
export function computeAutoLevelGains(
  personalGrowths: StatBlock,
  baseLevel: number,
  joinLevel: number,
  settings: PlannerSettings,
): StatBlock {
  const gains = zeroStats()
  const levels = Math.max(0, joinLevel - baseLevel)
  if (levels === 0) return gains
  for (const k of STAT_KEYS) {
    gains[k] = levels * (personalGrowths[k] / 100) * settings.autoLevelEfficiency
  }
  return gains
}

// ─────────────────────────────────────────────────────────────────────────────
// Weighted score of a stat block (for optimizer)
// ─────────────────────────────────────────────────────────────────────────────

export const PRESET_OBJECTIVES: Record<string, ObjectiveWeights> = {
  'Physical attacker': { HP: 0.5, Str: 1,   Mag: 0,    Spd: 1,    Dex: 0.75, Def: 0.5,  Res: 0.25, Lck: 0.25, Cha: 0   },
  'Mage':             { HP: 0.5, Str: 0,   Mag: 1,    Spd: 1,    Dex: 0.5,  Def: 0.25, Res: 0.75, Lck: 0.25, Cha: 0   },
  'Tank':             { HP: 1,   Str: 0.5, Mag: 0,    Spd: 0.25, Dex: 0.25, Def: 1,    Res: 0.75, Lck: 0.25, Cha: 0   },
  'Dodge tank':       { HP: 0.5, Str: 0.5, Mag: 0,    Spd: 1,    Dex: 0.5,  Def: 0.25, Res: 0.25, Lck: 0.75, Cha: 0   },
  'Healer/support':   { HP: 0.5, Str: 0,   Mag: 1,    Spd: 0.5,  Dex: 0.25, Def: 0.25, Res: 1,    Lck: 0.5,  Cha: 0.5 },
  'Balanced':         { HP: 1,   Str: 1,   Mag: 1,    Spd: 1,    Dex: 1,    Def: 1,    Res: 1,    Lck: 1,    Cha: 1   },
}

export function weightedScore(stats: StatBlock, weights: ObjectiveWeights): number {
  let score = 0
  for (const k of STAT_KEYS) score += stats[k] * weights[k]
  return score
}

/**
 * Suggest the most fitting preset objective for a character's personal growths,
 * using cosine similarity.
 */
export function suggestObjective(personalGrowths: StatBlock): string {
  let bestPreset = 'Balanced'
  let bestSim = -Infinity

  const gVec = STAT_KEYS.map(k => personalGrowths[k])
  const gMag = Math.sqrt(gVec.reduce((s, v) => s + v * v, 0))

  for (const [presetName, weights] of Object.entries(PRESET_OBJECTIVES)) {
    const wVec = STAT_KEYS.map(k => weights[k as StatKey])
    const wMag = Math.sqrt(wVec.reduce((s, v) => s + v * v, 0))
    const dot = gVec.reduce((s, v, i) => s + v * (wVec[i] ?? 0), 0)
    const sim = gMag > 0 && wMag > 0 ? dot / (gMag * wMag) : 0
    if (sim > bestSim) { bestSim = sim; bestPreset = presetName }
  }

  return bestPreset
}
