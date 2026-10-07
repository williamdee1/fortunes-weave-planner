/**
 * Shared type definitions for the Fortune's Weave planner model layer.
 * All model functions are pure — they take these types as input, return results,
 * and have no side effects.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stat layout
// ─────────────────────────────────────────────────────────────────────────────

export const STAT_KEYS = ['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type StatBlock = Record<StatKey, number>

export function zeroStats(): StatBlock {
  return { HP: 0, Str: 0, Mag: 0, Spd: 0, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 }
}

export function addStats(a: StatBlock, b: StatBlock): StatBlock {
  const out = zeroStats()
  for (const k of STAT_KEYS) out[k] = a[k] + b[k]
  return out
}

export function scaleStats(s: StatBlock, factor: number): StatBlock {
  const out = zeroStats()
  for (const k of STAT_KEYS) out[k] = s[k] * factor
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes and mount species
// ─────────────────────────────────────────────────────────────────────────────

export const ROUTES = ['Cai', 'Dietrich', 'Theodora', 'Leda'] as const
export type Route = (typeof ROUTES)[number]

export const MOUNT_SPECIES = ['Horse', 'Ornius', 'Pegasus', 'Bau', 'Elephant', 'Wyvern', 'Griffon'] as const
export type MountSpecies = (typeof MOUNT_SPECIES)[number]
export type MountMultipliers = Record<MountSpecies, number>

// ─────────────────────────────────────────────────────────────────────────────
// Data shapes (mirrored from generated JSON)
// ─────────────────────────────────────────────────────────────────────────────

export type Tier = 'Base' | 'Beginner' | 'Specialty' | 'Advanced' | 'Master' | 'Divine'

export interface CharGrowth {
  name: string
  growths: StatBlock
  baseGrowthsWithoutAbility: StatBlock | null
}

export interface ClassDef {
  name: string
  growths: StatBlock
  mountMultipliers: MountMultipliers
  tier: Tier
  idealExamLevel: number | null
  renownReq: number | 'Part 3' | null
  incompleteData: boolean
  skillRequirements: string | null
  unlockRoutes: Route[] | null
  unlockNote: string | null
  isExclusive: boolean
}

export interface ClassPassive {
  className: string
  abilityName: string
  fromLevel: number
  growths: StatBlock
  sourceConfidence: string
}

export interface MountDef {
  species: MountSpecies
  subtype: string
  growthsAtBond5: StatBlock
  isUnique: boolean
  uniqueOwner: string | null
  nameUnverified: boolean
}

export interface BaseStatRow {
  name: string
  level: number
  startingClass: string
  stats: StatBlock
  source: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan: a sequence of class segments the user has designed
// ─────────────────────────────────────────────────────────────────────────────

/** One segment in a character's class plan */
export interface ClassSegment {
  className: string
  /** Level at which the unit enters this class (inclusive) */
  fromLevel: number
  /** Level at which the unit leaves this class (last level-up in this class is at toLevel) */
  toLevel: number
  /** Mount assigned during this segment. null = no mount. */
  mountSubtype: string | null
  /** Bond level of the assigned mount (1–5, default 5) */
  mountBond: number
}

/** A complete plan for one character on one route */
export interface CharPlan {
  characterName: string
  route: Route
  /** Level the character joins at (post-auto-level) */
  joinLevel: number
  segments: ClassSegment[]
  /** The character's base level (from base_stats; 1 if unknown) */
  baseLevel: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings (user-configurable, with documented defaults)
// ─────────────────────────────────────────────────────────────────────────────

/** Weight vector over the 9 stats for optimizer scoring */
export type ObjectiveWeights = StatBlock

export interface PlannerSettings {
  /**
   * Efficiency multiplier for auto-levelled stat gains [0.5, 1.0].
   * Default 0.85 — captures the well-reported "late recruits fall behind average" effect.
   * §4.3: the exact formula is unknown; this is a tunable approximation.
   */
  autoLevelEfficiency: number

  /**
   * Growth rate clamp bounds. No evidence of <0 or >100 behaviour; these are the defaults.
   * Made constants so they can be changed if evidence appears.
   */
  growthClampMin: number
  growthClampMax: number

  /**
   * Bond factor denominator. Default 5 (Bond 5 = full mount growths).
   * Rocinan and Bucephalus cap at 6 bonds — encoded per-mount in MountDef.isUnique.
   */
  maxBondForNormalMount: number
  maxBondForUniqueMount: number

  /**
   * Whether Charioteer's Path / Elephant Rider's Path passive growths are active.
   * Source confidence is medium.
   */
  classPassivesEnabled: boolean

  /**
   * For Mu: whether Signs of Growth is active post-join (uses boosted growths).
   * Default true. During auto-levelling, always uses base growths regardless of this toggle.
   */
  muSignsOfGrowthActive: boolean

  /**
   * Whether a class unlocked on one Part I route is available on others after it is obtained.
   * Default true (Game8 says so).
   */
  unlockPersistsSaveWide: boolean

  /**
   * Slack applied to Ideal_Exam_Level when "allow early exams" is on.
   * A unit can take the exam if level ≥ (idealLevel - earlyExamSlack).
   */
  earlyExamSlack: number

  /**
   * Whether early exams (below ideal level) are allowed at all.
   */
  allowEarlyExams: boolean

  /**
   * Level at which Part III begins (user-editable). Default 38.
   */
  part3StartLevel: number

  /**
   * Cost in units of "churn" for switching classes in the optimizer.
   * Default 0 — no penalty.
   */
  switchPenalty: number

  /**
   * Chapter → level curve. Index 0 = Ch 1. Values are [min, max] pairs.
   */
  chapterLevelCurve: [number, number][]

  /** Part I ends at this level. Used as the default Part I end target. */
  part1EndLevel: number

  /** Final optimisation target level. Default 50. */
  finalTargetLevel: number
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  autoLevelEfficiency: 0.85,
  growthClampMin: 0,
  growthClampMax: 100,
  maxBondForNormalMount: 5,
  maxBondForUniqueMount: 6,
  classPassivesEnabled: true,
  muSignsOfGrowthActive: true,
  unlockPersistsSaveWide: true,
  earlyExamSlack: 5,
  allowEarlyExams: false,
  part3StartLevel: 38,
  switchPenalty: 0,
  // §3.5 chapter → level curve. Index 0 = Ch 1, ..., index 11 = Ch 12.
  // Each entry is [min, max]; mid-point used for estimates.
  chapterLevelCurve: [
    [1, 2],   // Ch 1
    [3, 3],   // Ch 2
    [4, 4],   // Ch 3
    [6, 6],   // Ch 4
    [9, 9],   // Ch 5
    [13, 13], // Ch 6
    [17, 17], // Ch 7
    [20, 20], // Ch 8
    [27, 27], // Ch 9
    [31, 31], // Ch 10
    [35, 35], // Ch 11
    [37, 37], // Ch 12
  ],
  part1EndLevel: 37,
  finalTargetLevel: 50,
}
