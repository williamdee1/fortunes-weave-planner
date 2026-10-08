/**
 * loader.ts — Imports generated JSON and builds Maps for fast lookup.
 * Import from this module everywhere instead of importing JSON directly.
 */
import type {
  CharGrowth, ClassDef, ClassPassive, MountDef,
  BaseStatRow, Route, StatBlock,
} from '../model/types'
import { ROUTES } from '../model/types'

import _charGrowths from './charGrowths.json'
import _classGrowths from './classGrowths.json'
import _classPassiveGrowths from './classPassiveGrowths.json'
import _mountGrowths from './mountGrowths.json'
import _baseStats from './baseStats.json'
import _recruitment from './recruitment.json'
import _joinEstimates from './joinEstimates.json'
import _overrides from '../../data/overrides.json'

// ─── typed casts ────────────────────────────────────────────────────────────
export const charGrowths = _charGrowths as CharGrowth[]
export const classGrowths = _classGrowths as ClassDef[]
export const classPassiveGrowths = _classPassiveGrowths as ClassPassive[]
export const mountGrowths = _mountGrowths as MountDef[]
export const baseStats = _baseStats as BaseStatRow[]

// ─── recruitment types ──────────────────────────────────────────────────────
export type RecruitStatus =
  | { type: 'unrecruitable' }
  | { type: 'auto'; chapter: number | null; chapterNote: string }
  | { type: 'normal'; supportRequired: number; renownRequired: number; extraCondition: string | null }

export interface RecruitmentEntry {
  character: string
  routes: Record<Route, RecruitStatus>
}

export interface RouteJoin {
  chapterMin: number; chapterMax: number
  levelMin: number;   levelMax: number
  confirmed: boolean; isAuto: boolean
  autoChapterNote: string | null
  paralogueGated: boolean; calendarGated: boolean; chapterCorrected: boolean
}

export interface JoinEstimate {
  character: string
  routes: Record<Route, RouteJoin | null>
}

export const recruitment = _recruitment as RecruitmentEntry[]
export const joinEstimates = _joinEstimates as JoinEstimate[]

// ─── fast-lookup Maps ────────────────────────────────────────────────────────
export const charMap    = new Map(charGrowths.map(c => [c.name, c]))
export const classMap   = new Map(classGrowths.map(c => [c.name, c]))
export const mountMap   = new Map(mountGrowths.map(m => [m.subtype, m]))
export const baseStatMap = new Map(baseStats.map(b => [b.name, b]))
export const recruitMap = new Map(recruitment.map(r => [r.character, r]))
export const joinMap    = new Map(joinEstimates.map(j => [j.character, j]))

// ─── derived helpers ─────────────────────────────────────────────────────────

/** All character names in alphabetical order */
export const allCharNames: string[] = charGrowths.map(c => c.name).sort()

/** Characters known to be lords (not in recruitment table) */
export const LORDS = new Set(['Eshmel', 'Cai', 'Dietrich', 'Theodora', 'Leda'])

/** Characters who join in Part III (not recruitabe in Part I) */
export const LATER_GAME = new Set([
  'Bertrand', 'Talimun', 'Orchel', 'Anatolia', 'Hong Hua',
  'Troy', 'Centurio', 'Aswan', 'Nathan', 'Creek', 'Klapka', 'Tahonia',
])

/** Default join level for later-game characters (from overrides.json) */
export const LATER_GAME_JOIN_LEVEL: number =
  (_overrides as { laterGameJoinLevelDefault?: number }).laterGameJoinLevelDefault ?? 38

/** Issues from overrides.json todoData */
export const DATA_TODO_ISSUES: string[] =
  (_overrides as { todoData?: string[] }).todoData ?? []

/**
 * Get a character's earliest join level on a route.
 * Returns null if not recruitable.
 */
export function getJoinLevel(charName: string, route: Route): number | null {
  // Lords join at 1 on their own route only
  if (LORDS.has(charName)) {
    const lordRoute = charName as Route
    return ROUTES.includes(lordRoute) && lordRoute === route ? 1 : null
  }
  // Later-game joiners are not available in Part I
  if (LATER_GAME.has(charName)) return null

  const entry = recruitMap.get(charName)
  if (!entry) return null
  const status = entry.routes[route]
  if (!status || status.type === 'unrecruitable') return null

  const join = joinMap.get(charName)?.routes[route]
  if (!join) return null

  return join.levelMin
}

/**
 * Get the join chapter range for a character on a route.
 */
export function getJoinChapter(charName: string, route: Route): { min: number; max: number } | null {
  if (LORDS.has(charName)) {
    const lordRoute = charName as Route
    return ROUTES.includes(lordRoute) && lordRoute === route ? { min: 1, max: 1 } : null
  }
  if (LATER_GAME.has(charName)) return null
  const join = joinMap.get(charName)?.routes[route]
  if (!join) return null
  return { min: join.chapterMin, max: join.chapterMax }
}

/**
 * Is this character recruitable on this route?
 */
export function isRecruitable(charName: string, route: Route): boolean {
  if (LORDS.has(charName)) {
    const lordRoute = charName as Route
    return ROUTES.includes(lordRoute) && lordRoute === route
  }
  if (LATER_GAME.has(charName)) return false
  const entry = recruitMap.get(charName)
  if (!entry) return false
  return entry.routes[route]?.type !== 'unrecruitable'
}

/**
 * Returns all characters recruitable on a given route (including lords).
 */
export function recruitableOn(route: Route): string[] {
  const out: string[] = []
  // Add the route's lord
  const lordForRoute: Record<Route, string> = {
    Cai: 'Cai', Dietrich: 'Dietrich', Theodora: 'Theodora', Leda: 'Leda',
  }
  out.push(lordForRoute[route])
  // Add all recruitables from the table
  for (const entry of recruitment) {
    if (entry.routes[route]?.type !== 'unrecruitable') {
      out.push(entry.character)
    }
  }
  return out
}

/**
 * Get personal growths for a character, respecting Mu's Signs of Growth toggle.
 */
export function getPersonalGrowths(charName: string, muSignsOfGrowthActive: boolean): StatBlock {
  const char = charMap.get(charName)
  if (!char) {
    // Return zero growths as fallback
    return { HP: 0, Str: 0, Mag: 0, Spd: 0, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 }
  }
  if (charName === 'Mu' && !muSignsOfGrowthActive && char.baseGrowthsWithoutAbility) {
    return char.baseGrowthsWithoutAbility
  }
  return char.growths
}

/** Validation issues from the data pipeline */
export const DATA_ISSUES: { type: 'warn' | 'info'; message: string }[] = [
  ...classGrowths
    .filter(c => c.skillRequirements === null && c.tier !== 'Base')
    .map(c => ({ type: 'warn' as const, message: `${c.name}: skill requirements unknown` })),
  ...classGrowths
    .filter(c => c.incompleteData)
    .map(c => ({ type: 'warn' as const, message: `${c.name}: flagged as incomplete data` })),
  ...mountGrowths
    .filter(m => m.nameUnverified)
    .map(m => ({ type: 'info' as const, message: `Mount "${m.subtype}": English name unverified (translated from KR community DB)` })),
  ...DATA_TODO_ISSUES.map(t => ({ type: 'info' as const, message: t })),
]
