/**
 * optimizer.ts — Dynamic-programming class-route optimizer (§5.2).
 *
 * Finds the sequence of class segments that maximises weighted expected stat gains
 * from joinLevel to targetLevel, subject to eligibility constraints.
 *
 * State: (level, className). Transition: stay or switch to another eligible class.
 * Score: weighted expected gain for that level-up.
 * The final class can be fixed by the user ("ending class").
 *
 * Output: top 3 plans, each as a list of ClassSegments with the weighted score.
 */

import type {
  ClassDef, MountDef, ClassPassive,
  StatBlock, ClassSegment, Route,
  PlannerSettings, ObjectiveWeights,
} from './types'
import { STAT_KEYS, zeroStats } from './types'
import { clampGrowth } from './growth'
import { mountGrowth } from './mounts'
import { activePassive } from './growth'
import { eligibleClasses } from './eligibility'
import { bestMountForClass } from './mounts'

// ─────────────────────────────────────────────────────────────────────────────
// Per-level scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weighted expected growth gain for one level-up in a class.
 *
 * Σ_stat [ clamp(personal + class + passive + mount) / 100 * weight ]
 */
function levelScore(
  level: number,
  personalGrowths: StatBlock,
  classDef: ClassDef,
  mountDef: MountDef | null,
  bond: number,
  passives: ClassPassive[],
  weights: ObjectiveWeights,
  settings: PlannerSettings,
): number {
  const passive = activePassive(classDef.name, level, passives, settings)
  let score = 0
  for (const k of STAT_KEYS) {
    const mBonus = mountDef ? mountGrowth(classDef, mountDef, bond, k, settings) : 0
    const passiveBonus = passive ? passive.growths[k] : 0
    const g = clampGrowth(personalGrowths[k] + classDef.growths[k] + passiveBonus + mBonus, settings)
    score += (g / 100) * weights[k]
  }
  return score
}

// ─────────────────────────────────────────────────────────────────────────────
// DP types
// ─────────────────────────────────────────────────────────────────────────────

interface DPState {
  score: number
  /** Class held at this level-up */
  className: string
  /** Previous state for path reconstruction */
  prev: DPState | null
  level: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Main optimizer
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizedPlan {
  segments: ClassSegment[]
  totalScore: number
  /** Expected stat gains from the plan (not absolute stats) */
  planGains: StatBlock
  endingClass: string
}

export interface OptimizerOptions {
  characterName: string
  route: Route
  personalGrowths: StatBlock
  joinLevel: number
  targetLevel: number
  allClasses: ClassDef[]
  allMounts: MountDef[]
  passives: ClassPassive[]
  weights: ObjectiveWeights
  settings: PlannerSettings
  /** If set, the final class is locked to this name */
  endingClass?: string
  /** Classes the user has locked into specific level ranges */
  lockedSegments?: ClassSegment[]
  /** Classes unlocked from past routes */
  unlockedRoutes?: Set<Route>
  /** Classes excluded by user */
  excludedClasses?: Set<string>
  /** Default mount bond for scored mounts */
  defaultBond?: number
}

/**
 * Run the DP optimizer and return the top-N plans.
 */
export function optimize(
  options: OptimizerOptions,
  topN = 3,
): OptimizedPlan[] {
  const {
    route, personalGrowths, joinLevel, targetLevel,
    allClasses, allMounts, passives, weights, settings,
    endingClass, lockedSegments = [], unlockedRoutes = new Set(), excludedClasses = new Set(),
    defaultBond = 5,
  } = options

  if (joinLevel >= targetLevel) return []

  // Build locked-class map: level → className
  const lockedAtLevel = new Map<number, string>()
  for (const seg of lockedSegments) {
    for (let l = seg.fromLevel; l <= seg.toLevel; l++) {
      lockedAtLevel.set(l, seg.className)
    }
  }

  // Pre-compute best mount per class (locked or free)
  const mountCache = new Map<string, MountDef | null>()
  const getBestMount = (cls: ClassDef): MountDef | null => {
    if (!mountCache.has(cls.name)) {
      mountCache.set(cls.name, bestMountForClass(cls, allMounts, defaultBond, weights, settings))
    }
    return mountCache.get(cls.name)!
  }

  // dp[classIndex] = best state for ending at this class at each level
  // We run a flat DP: dp[level][classIdx] = DPState
  // Levels: joinLevel, joinLevel+1, ..., targetLevel

  // Eligible classes at each level (cached)
  const eligibleAtLevel = new Map<number, ClassDef[]>()
  for (let l = joinLevel; l <= targetLevel; l++) {
    const locked = lockedAtLevel.get(l)
    if (locked) {
      const cls = allClasses.find(c => c.name === locked)
      eligibleAtLevel.set(l, cls ? [cls] : [])
    } else {
      eligibleAtLevel.set(l, eligibleClasses(allClasses, l, route, unlockedRoutes, settings, excludedClasses))
    }
  }

  // DP table: indexed by class name for the current level
  // best[className] = best cumulative score and backpointer
  let best = new Map<string, DPState>()

  // Initialise: at joinLevel, any eligible class is a valid start
  for (const cls of (eligibleAtLevel.get(joinLevel) ?? [])) {
    const mount = getBestMount(cls)
    const score = levelScore(joinLevel, personalGrowths, cls, mount, defaultBond, passives, weights, settings)
    best.set(cls.name, { score, className: cls.name, prev: null, level: joinLevel })
  }

  // Transition: level joinLevel+1 to targetLevel
  for (let l = joinLevel + 1; l <= targetLevel; l++) {
    const next = new Map<string, DPState>()
    const eligible = eligibleAtLevel.get(l) ?? []

    for (const cls of eligible) {
      const mount = getBestMount(cls)
      const stepScore = levelScore(l, personalGrowths, cls, mount, defaultBond, passives, weights, settings)

      // Find best predecessor
      let bestPredScore = -Infinity
      let bestPred: DPState | null = null

      for (const [, prevState] of best) {
        const switchCost = prevState.className !== cls.name ? settings.switchPenalty : 0
        const total = prevState.score - switchCost
        if (total > bestPredScore) {
          bestPredScore = total
          bestPred = prevState
        }
      }

      if (bestPred !== null) {
        next.set(cls.name, {
          score: bestPredScore + stepScore,
          className: cls.name,
          prev: bestPred,
          level: l,
        })
      } else {
        // No predecessor — start fresh (possible if eligibility changed)
        next.set(cls.name, { score: stepScore, className: cls.name, prev: null, level: l })
      }
    }

    best = next
  }

  // Collect terminal states
  let terminals: DPState[]
  if (endingClass) {
    const s = best.get(endingClass)
    terminals = s ? [s] : []
  } else {
    terminals = Array.from(best.values())
  }

  // Sort by score descending, take topN
  terminals.sort((a, b) => b.score - a.score)
  const topTerminals = terminals.slice(0, topN)

  return topTerminals.map(terminal => {
    const plan = reconstructPlan(terminal, allClasses, allMounts, defaultBond, weights, settings)
    const planGains = computePlanGains(plan, personalGrowths, allClasses, allMounts, passives, settings)
    return {
      segments: plan,
      totalScore: terminal.score,
      planGains,
      endingClass: terminal.className,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Path reconstruction
// ─────────────────────────────────────────────────────────────────────────────

function reconstructPlan(
  terminal: DPState,
  allClasses: ClassDef[],
  allMounts: MountDef[],
  defaultBond: number,
  weights: ObjectiveWeights,
  settings: PlannerSettings,
): ClassSegment[] {
  // Walk backwards from terminal
  const path: { level: number; className: string }[] = []
  let cur: DPState | null = terminal
  while (cur) {
    path.unshift({ level: cur.level, className: cur.className })
    cur = cur.prev
  }

  // Merge consecutive same-class levels into segments
  if (path.length === 0) return []

  const segments: ClassSegment[] = []
  let segStart = path[0]!.level
  let segClass = path[0]!.className

  for (let i = 1; i < path.length; i++) {
    const { level, className } = path[i]!
    if (className !== segClass) {
      const cls = allClasses.find(c => c.name === segClass)
      const mount = cls ? bestMountForClass(cls, allMounts, defaultBond, weights, settings) : null
      segments.push({
        className: segClass,
        fromLevel: segStart,
        toLevel: level - 1,
        mountSubtype: mount?.subtype ?? null,
        mountBond: defaultBond,
      })
      segStart = level
      segClass = className
    }
  }

  // Last segment
  const cls = allClasses.find(c => c.name === segClass)
  const mount = cls ? bestMountForClass(cls, allMounts, defaultBond, weights, settings) : null
  segments.push({
    className: segClass,
    fromLevel: segStart,
    toLevel: path[path.length - 1]!.level,
    mountSubtype: mount?.subtype ?? null,
    mountBond: defaultBond,
  })

  return segments
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute actual expected gains for a reconstructed plan
// ─────────────────────────────────────────────────────────────────────────────

function computePlanGains(
  segments: ClassSegment[],
  personalGrowths: StatBlock,
  allClasses: ClassDef[],
  allMounts: MountDef[],
  passives: ClassPassive[],
  settings: PlannerSettings,
): StatBlock {
  const gains = zeroStats()
  for (const seg of segments) {
    const cls = allClasses.find(c => c.name === seg.className)
    if (!cls) continue
    const mount = seg.mountSubtype ? allMounts.find(m => m.subtype === seg.mountSubtype) ?? null : null
    for (let l = seg.fromLevel; l <= seg.toLevel; l++) {
      const passive = activePassive(cls.name, l, passives, settings)
      for (const k of STAT_KEYS) {
        const mBonus = mount ? mountGrowth(cls, mount, seg.mountBond, k, settings) : 0
        const passiveBonus = passive ? passive.growths[k] : 0
        const g = clampGrowth(personalGrowths[k] + cls.growths[k] + passiveBonus + mBonus, settings)
        gains[k] += g / 100
      }
    }
  }
  return gains
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster optimizer helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each character/route combination, return the best plan score.
 * Used to sort the roster by projected final score (§5.3).
 */
export function rosterScore(
  personalGrowths: StatBlock,
  joinLevel: number,
  targetLevel: number,
  autoLevelPenalty: StatBlock,
  allClasses: ClassDef[],
  allMounts: MountDef[],
  passives: ClassPassive[],
  weights: ObjectiveWeights,
  settings: PlannerSettings,
  route: Route,
): number {
  const plans = optimize({
    characterName: '',
    route,
    personalGrowths,
    joinLevel,
    targetLevel,
    allClasses,
    allMounts,
    passives,
    weights,
    settings,
    defaultBond: 5,
  }, 1)

  if (plans.length === 0) return 0

  const plan = plans[0]!
  // Score = plan gains + auto-level (already penalised)
  let score = plan.totalScore
  for (const k of STAT_KEYS) score -= autoLevelPenalty[k] * weights[k]
  return score
}
