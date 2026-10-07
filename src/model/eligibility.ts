/**
 * eligibility.ts — Determine which classes are eligible at each level for a given character.
 *
 * §5.2 enumerate eligible classes:
 *   - tier gate met at that point
 *   - level ≥ idealLevel (or ≥ idealLevel - earlyExamSlack if earlyExams allowed)
 *   - Renown requirement met (via chapter/level mapping)
 *   - Master/Divine: only in Part III
 *   - Route unlock rules met
 *   - Not excluded by user
 *   - Not marked incompleteData
 */

import type { ClassDef, Route, PlannerSettings, Tier } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Tier gate ordering
// ─────────────────────────────────────────────────────────────────────────────

const TIER_ORDER: Tier[] = ['Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine']

/** Minimum level gate for a tier (hard gates from CLAUDE.md §3.2) */
const TIER_MIN_LEVEL: Record<Tier, number> = {
  Base: 1,
  Beginner: 5,
  Specialty: 20,
  Advanced: 35,
  Master: 45,
  Divine: 45, // Divine: 100% pass chance only; treated as level 45+ here
}

// ─────────────────────────────────────────────────────────────────────────────
// Renown → approximate level (from §3.4 and join estimates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approximate the army level at which a given Renown level is reached.
 * Dietrich is ~1 chapter slower; for simplicity we use the standard curve.
 * Returns the midpoint level from chapterLevelCurve for the given Renown.
 */
export function renownToLevel(
  renown: number,
  route: Route,
  settings: PlannerSettings,
): number {
  // Renown → chapter mapping from recruitment_join_estimates.md
  const renownChapterCai: Record<number, number> = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 10, 11: 11, 12: 12,
  }
  const renownChapterDietrich: Record<number, number> = {
    1: 1, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 11, 11: 12, 12: 12,
  }

  const map = route === 'Dietrich' ? renownChapterDietrich : renownChapterCai
  const chapter = map[renown] ?? 12

  // chapter is 1-indexed; curve is 0-indexed
  const pair = settings.chapterLevelCurve[chapter - 1] ?? [37, 37]
  return Math.round((pair[0] + pair[1]) / 2)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main eligibility check
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityReason {
  eligible: boolean
  reasons: string[]
}

/**
 * Is a given class eligible for a character at a given level on a given route?
 *
 * @param cls             - The class to check.
 * @param level           - The level at which eligibility is assessed.
 * @param route           - The current route.
 * @param unlockedRoutes  - Routes on which the character has obtained route-exclusive classes.
 *                          Ignored when unlockPersistsSaveWide = false.
 * @param settings        - Global settings.
 * @param excludedClasses - Class names the user has manually excluded.
 */
export function isEligible(
  cls: ClassDef,
  level: number,
  route: Route,
  unlockedRoutes: Set<Route>,
  settings: PlannerSettings,
  excludedClasses: Set<string> = new Set(),
): EligibilityReason {
  const reasons: string[] = []

  // Incomplete data
  if (cls.incompleteData) {
    reasons.push(`${cls.name} has incomplete data`)
  }

  // User exclusion
  if (excludedClasses.has(cls.name)) {
    reasons.push(`${cls.name} is excluded by user`)
  }

  // Part III lock (Master and Divine are Part III only)
  if ((cls.tier === 'Master' || cls.tier === 'Divine') && level < settings.part3StartLevel) {
    reasons.push(`${cls.name} (${cls.tier}) requires Part III (level ≥ ${settings.part3StartLevel})`)
  }

  // Tier level gate (Base classes need no exam)
  if (cls.tier !== 'Base') {
    const minLevel = TIER_MIN_LEVEL[cls.tier]
    if (settings.allowEarlyExams) {
      const effective = minLevel - settings.earlyExamSlack
      if (level < effective) {
        reasons.push(`Level ${level} < ${effective} (${cls.tier} min ${minLevel} − slack ${settings.earlyExamSlack})`)
      }
    } else {
      if (level < minLevel) {
        reasons.push(`Level ${level} < ${minLevel} (${cls.tier} ideal level)`)
      }
    }
  }

  // Renown requirement
  if (cls.renownReq !== null && cls.renownReq !== 'Part 3') {
    const renownLevel = renownToLevel(cls.renownReq, route, settings)
    if (level < renownLevel) {
      reasons.push(`Renown ${cls.renownReq} not yet reached at level ${level} (approx level ${renownLevel})`)
    }
  }

  // Elephant Rider: Part 3 renown req
  if (cls.renownReq === 'Part 3' && level < settings.part3StartLevel) {
    reasons.push(`${cls.name} requires Part III`)
  }

  // Route unlock
  if (cls.unlockRoutes !== null) {
    // On the current route?
    const availableOnCurrentRoute = cls.unlockRoutes.includes(route)
    // Available from a past route (save-wide)?
    const availableFromPastRoute = settings.unlockPersistsSaveWide &&
      cls.unlockRoutes.some(r => unlockedRoutes.has(r))

    if (!availableOnCurrentRoute && !availableFromPastRoute) {
      const unlockStr = cls.unlockRoutes.join(', ')
      reasons.push(
        `${cls.name} is only unlockable on routes: ${unlockStr}` +
        (settings.unlockPersistsSaveWide ? ' (not yet obtained)' : ''),
      )
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  }
}

/**
 * Filter a list of classes down to those eligible at a given level.
 */
export function eligibleClasses(
  allClasses: ClassDef[],
  level: number,
  route: Route,
  unlockedRoutes: Set<Route>,
  settings: PlannerSettings,
  excludedClasses: Set<string> = new Set(),
): ClassDef[] {
  return allClasses.filter(cls =>
    isEligible(cls, level, route, unlockedRoutes, settings, excludedClasses).eligible,
  )
}

export { TIER_ORDER }
