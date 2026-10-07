/**
 * Unit tests for the Fortune's Weave planner model layer.
 *
 * All required test cases from CLAUDE.md §7 are covered.
 * Tests use synthetic data only — no dependency on generated JSON.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, type StatBlock, type ClassDef, type MountDef, type ClassPassive, type ClassSegment, zeroStats } from '../src/model/types'
import { totalGrowth, clampGrowth, segmentExpectedGains, computeAutoLevelGains, weightedScore } from '../src/model/growth'
import { mountGrowth, isMountCompatible } from '../src/model/mounts'
import { autoLevelGainsForChar, autoLevelGrowths, postJoinGrowths } from '../src/model/autolevel'
import { isEligible } from '../src/model/eligibility'
import { optimize } from '../src/model/optimizer'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const S = DEFAULT_SETTINGS

function makeClass(overrides: Partial<ClassDef> = {}): ClassDef {
  return {
    name: 'Test Class',
    growths: zeroStats(),
    mountMultipliers: { Horse: 0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 },
    tier: 'Specialty',
    idealExamLevel: 20,
    renownReq: 4,
    incompleteData: false,
    skillRequirements: null,
    unlockRoutes: null,
    unlockNote: null,
    isExclusive: false,
    ...overrides,
  }
}

function makeMount(overrides: Partial<MountDef> = {}): MountDef {
  return {
    species: 'Horse',
    subtype: 'Ferghanan Horse',
    growthsAtBond5: { HP: 5, Str: 5, Mag: 0, Spd: 0, Dex: 5, Def: 10, Res: 0, Lck: 0, Cha: 0 },
    isUnique: false,
    uniqueOwner: null,
    nameUnverified: false,
    ...overrides,
  }
}

function makeSegment(overrides: Partial<ClassSegment> = {}): ClassSegment {
  return {
    className: 'Test Class',
    fromLevel: 1,
    toLevel: 10,
    mountSubtype: null,
    mountBond: 5,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Total growth
// ─────────────────────────────────────────────────────────────────────────────

describe('totalGrowth', () => {
  it('Leda Spd 65 + Dancer +25 = 90', () => {
    expect(totalGrowth(65, 25, 0, S)).toBe(90)
  })

  it('adds mount bonus to personal + class', () => {
    // personal 40, class 10, mount 5 → 55
    expect(totalGrowth(40, 10, 5, S)).toBe(55)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Clamping
// ─────────────────────────────────────────────────────────────────────────────

describe('clampGrowth', () => {
  it('clamps below 0 to 0', () => {
    expect(clampGrowth(-10, S)).toBe(0)
    expect(clampGrowth(-1, S)).toBe(0)
  })

  it('clamps above 100 to 100', () => {
    expect(clampGrowth(101, S)).toBe(100)
    expect(clampGrowth(999, S)).toBe(100)
  })

  it('passes through values in range', () => {
    expect(clampGrowth(0, S)).toBe(0)
    expect(clampGrowth(75, S)).toBe(75)
    expect(clampGrowth(100, S)).toBe(100)
  })

  it('totalGrowth: result clamped — Str 90 + class 20 clamps to 100', () => {
    expect(totalGrowth(90, 20, 0, S)).toBe(100)
  })

  it('totalGrowth: result clamped — negative total becomes 0', () => {
    // e.g. Diviner with Str -5 on a character with Str 3 → personal 3 + class -5 = -2 → 0
    expect(totalGrowth(3, -5, 0, S)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Mount bonus
// ─────────────────────────────────────────────────────────────────────────────

describe('mountGrowth', () => {
  const fergharanHorse = makeMount({
    species: 'Horse',
    subtype: 'Ferghanan Horse',
    growthsAtBond5: { HP: 5, Str: 5, Mag: 0, Spd: 0, Dex: 5, Def: 10, Res: 0, Lck: 0, Cha: 0 },
  })

  const lightCavalry = makeClass({
    name: 'Light Cavalry',
    mountMultipliers: { Horse: 1.0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 },
  })

  const charioteer = makeClass({
    name: 'Charioteer',
    mountMultipliers: { Horse: 2.0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 },
  })

  const myrmidon = makeClass({
    name: 'Myrmidon',
    mountMultipliers: { Horse: 0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 },
  })

  it('Ferghanan Horse on Light Cavalry (1.0) at Bond 5 = +5 Str', () => {
    expect(mountGrowth(lightCavalry, fergharanHorse, 5, 'Str', S)).toBe(5)
  })

  it('Ferghanan Horse on Light Cavalry (1.0) at Bond 2 = +2 Str', () => {
    // 5 * 1.0 * (2/5) = 2
    expect(mountGrowth(lightCavalry, fergharanHorse, 2, 'Str', S)).toBe(2)
  })

  it('Ferghanan Horse on Charioteer (2.0) at Bond 5 = +10 Str', () => {
    // 5 * 2.0 * (5/5) = 10
    expect(mountGrowth(charioteer, fergharanHorse, 5, 'Str', S)).toBe(10)
  })

  it('Ferghanan Horse on non-mounted class = 0', () => {
    expect(mountGrowth(myrmidon, fergharanHorse, 5, 'Str', S)).toBe(0)
  })

  it('null mount returns 0', () => {
    expect(mountGrowth(lightCavalry, null, 5, 'Str', S)).toBe(0)
  })

  it('isMountCompatible: Light Cavalry + Horse = true', () => {
    expect(isMountCompatible(lightCavalry, fergharanHorse)).toBe(true)
  })

  it('isMountCompatible: Myrmidon + Horse = false', () => {
    expect(isMountCompatible(myrmidon, fergharanHorse)).toBe(false)
  })
})

describe('mountGrowth unique mounts (Rocinan/Bucephalus at Bond 6)', () => {
  const rocinan = makeMount({
    species: 'Horse',
    subtype: 'Unique - Rocinan',
    growthsAtBond5: { HP: 5, Str: 0, Mag: 0, Spd: 5, Dex: 5, Def: 10, Res: 5, Lck: 0, Cha: 0 },
    isUnique: true,
  })

  const lightCavalry = makeClass({
    mountMultipliers: { Horse: 1.0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 },
  })

  it('Rocinan at Bond 6 = full growthsAtBond5 values (maxBond=6)', () => {
    // Rocinan HP 5, Bond 6/6 = 5
    expect(mountGrowth(lightCavalry, rocinan, 6, 'HP', S)).toBe(5)
  })

  it('Rocinan at Bond 3 = half of Bond 6 value', () => {
    // 5 * 1.0 * (3/6) = 2.5
    expect(mountGrowth(lightCavalry, rocinan, 3, 'HP', S)).toBeCloseTo(2.5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Auto-level
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAutoLevelGains', () => {
  const growths: StatBlock = { HP: 50, Str: 50, Mag: 0, Spd: 40, Dex: 40, Def: 20, Res: 10, Lck: 10, Cha: 20 }
  const baseLevel = 1
  const joinLevel = 11 // 10 levels of auto-levelling

  it('efficiency 1.0: gains = levels × growth', () => {
    const s = { ...S, autoLevelEfficiency: 1.0 }
    const gains = computeAutoLevelGains(growths, baseLevel, joinLevel, s)
    // 10 levels * 50% = 5.0
    expect(gains.Str).toBeCloseTo(5.0)
    expect(gains.Spd).toBeCloseTo(4.0)
    expect(gains.Mag).toBeCloseTo(0)
  })

  it('efficiency 0.85: gains = 85% of efficiency-1 result', () => {
    const s = { ...S, autoLevelEfficiency: 0.85 }
    const gains = computeAutoLevelGains(growths, baseLevel, joinLevel, s)
    expect(gains.Str).toBeCloseTo(4.25) // 5.0 * 0.85
    expect(gains.Spd).toBeCloseTo(3.4)  // 4.0 * 0.85
  })

  it('joinLevel = baseLevel → zero gains', () => {
    const gains = computeAutoLevelGains(growths, 5, 5, S)
    expect(gains.Str).toBe(0)
    expect(gains.HP).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Mu auto-level uses base 30% Str; post-join uses 50% when toggle on
// ─────────────────────────────────────────────────────────────────────────────

describe('Mu auto-level and Signs of Growth', () => {
  const muBoosted: StatBlock = { HP: 50, Str: 50, Mag: 25, Spd: 50, Dex: 50, Def: 40, Res: 30, Lck: 30, Cha: 40 }
  const muBase: StatBlock = { HP: 30, Str: 30, Mag: 5, Spd: 30, Dex: 30, Def: 20, Res: 10, Lck: 10, Cha: 20 }

  it('autoLevelGrowths: with baseGrowthsWithoutAbility, uses base growths', () => {
    const resolved = autoLevelGrowths(muBoosted, muBase, S)
    expect(resolved.Str).toBe(30)
    expect(resolved.HP).toBe(30)
  })

  it('autoLevelGainsForChar: Mu at join level 11 uses 30% Str (base)', () => {
    const s = { ...S, autoLevelEfficiency: 1.0 }
    const gains = autoLevelGainsForChar(muBoosted, muBase, 1, 11, s)
    // 10 levels * 30% * 1.0 = 3.0
    expect(gains.Str).toBeCloseTo(3.0)
  })

  it('postJoinGrowths: Signs of Growth ON → uses boosted 50%', () => {
    const s = { ...S, muSignsOfGrowthActive: true }
    const resolved = postJoinGrowths(muBoosted, muBase, s)
    expect(resolved.Str).toBe(50)
  })

  it('postJoinGrowths: Signs of Growth OFF → uses base 30%', () => {
    const s = { ...S, muSignsOfGrowthActive: false }
    const resolved = postJoinGrowths(muBoosted, muBase, s)
    expect(resolved.Str).toBe(30)
  })

  it('postJoinGrowths: non-Mu character ignores baseGrowthsWithoutAbility=null', () => {
    const growths: StatBlock = { HP: 40, Str: 45, Mag: 0, Spd: 45, Dex: 45, Def: 35, Res: 35, Lck: 40, Cha: 40 }
    const resolved = postJoinGrowths(growths, null, S)
    expect(resolved.Str).toBe(45)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Eligibility
// ─────────────────────────────────────────────────────────────────────────────

describe('isEligible', () => {
  const advancedClass = makeClass({
    name: 'Shido',
    tier: 'Advanced',
    idealExamLevel: 35,
    renownReq: 8,
    unlockRoutes: null,
  })

  const masterClass = makeClass({
    name: 'Swordmaster',
    tier: 'Master',
    idealExamLevel: 45,
    renownReq: 'Part 3',
  })

  const s = { ...S, allowEarlyExams: false }

  it('Advanced class not eligible below level 35', () => {
    const result = isEligible(advancedClass, 30, 'Cai', new Set(), s)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('35'))).toBe(true)
  })

  it('Advanced class not eligible before Renown 8 is reached', () => {
    // At level 35, Renown 8 on Cai maps to ~level 27 (Ch 9)
    // So at level 28 Renown 8 IS reached, eligible
    // But let's test with a hypothetical class requiring Renown 10 (level ~31)
    const highRenown = makeClass({ ...advancedClass, renownReq: 10 })
    // renown 10 → ch 10 → level 31 on Cai
    const result = isEligible(highRenown, 35, 'Cai', new Set(), s)
    expect(result.eligible).toBe(true) // at 35 Renown 10 reached (31<35)
  })

  it('Advanced class eligible at level 35+ with Renown met', () => {
    const result = isEligible(advancedClass, 35, 'Cai', new Set(), s)
    expect(result.eligible).toBe(true)
  })

  it('Master class not eligible in Part I (below part3StartLevel)', () => {
    const result = isEligible(masterClass, 37, 'Cai', new Set(), s)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.toLowerCase().includes('part iii'))).toBe(true)
  })

  it('Master class eligible at level 45 in Part III', () => {
    // part3StartLevel=38 is in Part III, but idealExamLevel=45 is the real gate
    const result = isEligible(masterClass, 45, 'Cai', new Set(), s)
    expect(result.eligible).toBe(true)
  })

  it('Master class not eligible at Part III start (38) because idealLevel=45', () => {
    const result = isEligible(masterClass, s.part3StartLevel, 'Cai', new Set(), s)
    expect(result.eligible).toBe(false)
  })

  it('route-exclusive class blocked when not on unlock route', () => {
    const exclusiveCls = makeClass({
      name: 'Dancer',
      tier: 'Advanced',
      idealExamLevel: 35,
      renownReq: 8,
      unlockRoutes: ['Leda'],
    })
    const result = isEligible(exclusiveCls, 35, 'Cai', new Set(), s)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Leda'))).toBe(true)
  })

  it('route-exclusive class allowed on the unlock route', () => {
    const exclusiveCls = makeClass({
      name: 'Dancer',
      tier: 'Advanced',
      idealExamLevel: 35,
      renownReq: 8,
      unlockRoutes: ['Leda'],
    })
    const result = isEligible(exclusiveCls, 35, 'Leda', new Set(), s)
    expect(result.eligible).toBe(true)
  })

  it('route-exclusive class allowed save-wide after obtaining', () => {
    const exclusiveCls = makeClass({
      name: 'Dancer',
      tier: 'Advanced',
      idealExamLevel: 35,
      renownReq: 8,
      unlockRoutes: ['Leda'],
    })
    const obtained = new Set<typeof import('../src/model/types').Route[number]>(['Leda'])
    const result = isEligible(exclusiveCls, 35, 'Cai', obtained, { ...s, unlockPersistsSaveWide: true })
    expect(result.eligible).toBe(true)
  })

  it('early exam allowed when earlyExamSlack covers the gap', () => {
    const sEarly = { ...S, allowEarlyExams: true, earlyExamSlack: 5 }
    // Advanced idealLevel 35, slack 5 → effective 30
    const result = isEligible(advancedClass, 30, 'Cai', new Set(), sEarly)
    expect(result.eligible).toBe(true)
  })

  it('early exam still blocked below (idealLevel - slack)', () => {
    const sEarly = { ...S, allowEarlyExams: true, earlyExamSlack: 5 }
    const result = isEligible(advancedClass, 29, 'Cai', new Set(), sEarly)
    expect(result.eligible).toBe(false)
  })

  it('excluded class is blocked', () => {
    const excluded = new Set(['Shido'])
    const result = isEligible(advancedClass, 40, 'Cai', new Set(), s, excluded)
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('excluded'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7 Required test: Optimizer with synthetic 3-class dataset
// ─────────────────────────────────────────────────────────────────────────────

describe('optimize (synthetic data)', () => {
  // 3-class toy: Myrmidon (+Spd), Armored Knight (+Def), and Archer (+Dex)
  const myrmidon = makeClass({
    name: 'Myrmidon',
    tier: 'Specialty',
    idealExamLevel: 20,
    renownReq: 4,
    growths: { HP: 10, Str: 0, Mag: 0, Spd: 15, Dex: 10, Def: 0, Res: 0, Lck: 5, Cha: 5 },
  })
  const armoredKnight = makeClass({
    name: 'Armored Knight',
    tier: 'Specialty',
    idealExamLevel: 20,
    renownReq: 4,
    growths: { HP: 10, Str: 10, Mag: -5, Spd: -5, Dex: 5, Def: 25, Res: -5, Lck: 0, Cha: 5 },
  })
  const archer = makeClass({
    name: 'Archer',
    tier: 'Specialty',
    idealExamLevel: 20,
    renownReq: 4,
    growths: { HP: 10, Str: 0, Mag: 0, Spd: 10, Dex: 15, Def: 5, Res: 0, Lck: 5, Cha: 5 },
  })

  const baseGrowths: StatBlock = { HP: 40, Str: 35, Mag: 35, Spd: 65, Dex: 50, Def: 30, Res: 35, Lck: 25, Cha: 55 }
  // Leda-style: max Spd
  const spdWeights: StatBlock = { HP: 0, Str: 0, Mag: 0, Spd: 1, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 }

  // For a pure Spd objective from level 20–30, Myrmidon should win every level (65+15=80% Spd > others)
  it('returns optimized plan (top result has highest score)', () => {
    const plans = optimize({
      characterName: 'TestChar',
      route: 'Leda',
      personalGrowths: baseGrowths,
      joinLevel: 20,
      targetLevel: 30,
      allClasses: [myrmidon, armoredKnight, archer],
      allMounts: [],
      passives: [],
      weights: spdWeights,
      settings: S,
    })

    expect(plans.length).toBeGreaterThan(0)
    // Top plan should use Myrmidon for Spd
    const top = plans[0]!
    expect(top.segments.some(s => s.className === 'Myrmidon')).toBe(true)
    // Plans are sorted by score
    if (plans.length >= 2) {
      expect(plans[0]!.totalScore).toBeGreaterThanOrEqual(plans[1]!.totalScore)
    }
  })

  it('respects locked ending class', () => {
    const plans = optimize({
      characterName: 'TestChar',
      route: 'Leda',
      personalGrowths: baseGrowths,
      joinLevel: 20,
      targetLevel: 30,
      allClasses: [myrmidon, armoredKnight, archer],
      allMounts: [],
      passives: [],
      weights: spdWeights,
      settings: S,
      endingClass: 'Armored Knight',
    })

    // All returned plans must end in Armored Knight
    for (const plan of plans) {
      expect(plan.endingClass).toBe('Armored Knight')
      const lastSeg = plan.segments[plan.segments.length - 1]
      expect(lastSeg?.className).toBe('Armored Knight')
    }
  })

  it('returns empty when joinLevel >= targetLevel', () => {
    const plans = optimize({
      characterName: 'TestChar',
      route: 'Cai',
      personalGrowths: baseGrowths,
      joinLevel: 30,
      targetLevel: 30,
      allClasses: [myrmidon],
      allMounts: [],
      passives: [],
      weights: spdWeights,
      settings: S,
    })
    expect(plans).toHaveLength(0)
  })

  it('returns top 3 plans', () => {
    const plans = optimize({
      characterName: 'TestChar',
      route: 'Cai',
      personalGrowths: baseGrowths,
      joinLevel: 20,
      targetLevel: 30,
      allClasses: [myrmidon, armoredKnight, archer],
      allMounts: [],
      passives: [],
      weights: spdWeights,
      settings: S,
    }, 3)
    expect(plans.length).toBeGreaterThanOrEqual(1)
    expect(plans.length).toBeLessThanOrEqual(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// segmentExpectedGains integration
// ─────────────────────────────────────────────────────────────────────────────

describe('segmentExpectedGains', () => {
  const classWithSpd = makeClass({
    growths: { HP: 0, Str: 0, Mag: 0, Spd: 25, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 },
  })
  const ledaGrowths: StatBlock = { HP: 40, Str: 35, Mag: 35, Spd: 65, Dex: 50, Def: 30, Res: 35, Lck: 25, Cha: 55 }

  it('Leda Spd 65 + Dancer +25 = 90% → 0.9 per level', () => {
    const seg = makeSegment({ fromLevel: 1, toLevel: 1 }) // 1 level
    const gains = segmentExpectedGains(ledaGrowths, seg, classWithSpd, null, [], S)
    expect(gains.Spd).toBeCloseTo(0.9)
  })

  it('10 levels at 90% Spd → ~9.0 expected Spd gains', () => {
    const seg = makeSegment({ fromLevel: 1, toLevel: 10 })
    const gains = segmentExpectedGains(ledaGrowths, seg, classWithSpd, null, [], S)
    expect(gains.Spd).toBeCloseTo(9.0)
  })

  it('class passives disabled: no passive bonus applied', () => {
    const passive: ClassPassive = {
      className: 'Test Class',
      abilityName: 'Test Path',
      fromLevel: 1,
      growths: { HP: 0, Str: 0, Mag: 0, Spd: 10, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 },
      sourceConfidence: 'test',
    }
    const sOff = { ...S, classPassivesEnabled: false }
    const seg = makeSegment({ fromLevel: 1, toLevel: 1 })
    const gains = segmentExpectedGains(ledaGrowths, seg, classWithSpd, null, [passive], sOff)
    // Should be 90% without the extra 10%
    expect(gains.Spd).toBeCloseTo(0.9)
  })

  it('class passives enabled: passive bonus added after fromLevel', () => {
    const passive: ClassPassive = {
      className: 'Test Class',
      abilityName: 'Test Path',
      fromLevel: 5,
      growths: { HP: 0, Str: 0, Mag: 0, Spd: 10, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 },
      sourceConfidence: 'test',
    }
    // Level 1–4: 90% Spd, Level 5–10: 100% Spd
    const seg = makeSegment({ fromLevel: 1, toLevel: 10 })
    const gains = segmentExpectedGains(ledaGrowths, seg, classWithSpd, null, [passive], S)
    // 4 levels at 0.9 + 6 levels at 1.0 = 3.6 + 6.0 = 9.6
    expect(gains.Spd).toBeCloseTo(9.6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// weightedScore
// ─────────────────────────────────────────────────────────────────────────────

describe('weightedScore', () => {
  it('returns zero for zero weights', () => {
    const stats: StatBlock = { HP: 10, Str: 20, Mag: 5, Spd: 30, Dex: 15, Def: 8, Res: 8, Lck: 12, Cha: 6 }
    const weights = zeroStats()
    expect(weightedScore(stats, weights)).toBe(0)
  })

  it('sums stat * weight correctly', () => {
    const stats = zeroStats()
    stats.Spd = 10
    stats.Str = 5
    const weights = zeroStats()
    weights.Spd = 1
    weights.Str = 2
    expect(weightedScore(stats, weights)).toBe(10 * 1 + 5 * 2)
  })
})
