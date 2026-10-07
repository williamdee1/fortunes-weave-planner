/**
 * build-data.ts
 *
 * Parses raw data files from data/raw/ into normalised JSON in src/data/.
 * Run with: npm run build-data
 * Run with --validate-only to check data without writing output files.
 *
 * The script MUST exit non-zero if any validation check fails.
 * Never hand-edit src/data/*.json — fix the parser or add to data/overrides.json.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, 'data', 'raw')
const OUT = path.join(ROOT, 'src', 'data')
const OVERRIDES_PATH = path.join(ROOT, 'data', 'overrides.json')

const VALIDATE_ONLY = process.argv.includes('--validate-only')

// ─────────────────────────────────────────────────────────────────────────────
// Stat column order (canonical)
// ─────────────────────────────────────────────────────────────────────────────

export const STAT_COLS = ['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha'] as const
export type StatKey = (typeof STAT_COLS)[number]
export type StatBlock = Record<StatKey, number>

function zeroStats(): StatBlock {
  return { HP: 0, Str: 0, Mag: 0, Spd: 0, Dex: 0, Def: 0, Res: 0, Lck: 0, Cha: 0 }
}

function parseTsv(raw: string): Array<Record<string, string>> {
  const [headerLine, ...dataLines] = raw.trim().split(/\r?\n/)
  if (!headerLine) return []
  const headers = headerLine.split('\t')
  return dataLines
    .filter(l => l.trim() !== '')
    .map(line => {
      const cells = line.split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h.trim()] = (cells[i] ?? '').trim() })
      return row
    })
}

/** Extract stat block from a row, mapping by header name (never by position). */
function extractStats(row: Record<string, string>): StatBlock {
  const stats = zeroStats()
  for (const key of STAT_COLS) {
    const raw = row[key]
    if (raw === undefined || raw === '') {
      throw new Error(`Missing stat column "${key}" in row: ${JSON.stringify(row)}`)
    }
    const v = Number(raw)
    if (isNaN(v)) throw new Error(`Non-numeric value for stat "${key}": "${raw}"`)
    stats[key] = v
  }
  return stats
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Tier = 'Base' | 'Beginner' | 'Specialty' | 'Advanced' | 'Master' | 'Divine'
export type Route = 'Cai' | 'Dietrich' | 'Theodora' | 'Leda'
export const ROUTES: Route[] = ['Cai', 'Dietrich', 'Theodora', 'Leda']

export const MOUNT_SPECIES = ['Horse', 'Ornius', 'Pegasus', 'Bau', 'Elephant', 'Wyvern', 'Griffon'] as const
export type MountSpecies = (typeof MOUNT_SPECIES)[number]
export type MountMultipliers = Record<MountSpecies, number>

export interface CharGrowth {
  name: string
  growths: StatBlock
  /** For Mu: base growths without Signs of Growth. Null for all other characters. */
  baseGrowthsWithoutAbility: StatBlock | null
}

export interface ClassDef {
  name: string
  growths: StatBlock
  mountMultipliers: MountMultipliers
  tier: Tier
  idealExamLevel: number | null  // null = Base (no exam) or Divine (no ideal level)
  renownReq: number | 'Part 3' | null  // null = N/A
  incompleteData: boolean
  skillRequirements: string | null
  unlockRoutes: Route[] | null  // null = available everywhere
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

export type RecruitStatus =
  | { type: 'unrecruitable' }
  | { type: 'auto'; chapter: number | null; chapterNote: string }
  | { type: 'normal'; supportRequired: number; renownRequired: number; extraCondition: string | null }

export interface RecruitmentEntry {
  character: string
  routes: Record<Route, RecruitStatus>
}

export interface JoinEstimate {
  character: string
  routes: Record<Route, RouteJoin | null>
}

export interface RouteJoin {
  chapterMin: number
  chapterMax: number
  levelMin: number
  levelMax: number
  confirmed: boolean
  isAuto: boolean
  autoChapterNote: string | null
  paralogueGated: boolean
  calendarGated: boolean
  chapterCorrected: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: char_growths.txt
// ─────────────────────────────────────────────────────────────────────────────

/** Mu's base growths without Signs of Growth (from CLAUDE.md §3.1) */
const MU_BASE_GROWTHS: StatBlock = {
  HP: 30, Str: 30, Mag: 5, Spd: 30, Dex: 30, Def: 20, Res: 10, Lck: 10, Cha: 20,
}

function parseCharGrowths(): CharGrowth[] {
  const raw = fs.readFileSync(path.join(RAW, 'char_growths.txt'), 'utf-8')
  const rows = parseTsv(raw)
  return rows.map(row => {
    const name = row['Name']!
    if (!name) throw new Error('char_growths.txt: missing Name column')
    const growths = extractStats(row)
    return {
      name,
      growths,
      baseGrowthsWithoutAbility: name === 'Mu' ? MU_BASE_GROWTHS : null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: class_growths.txt
// ─────────────────────────────────────────────────────────────────────────────

/** Route-exclusive unlocks from CLAUDE.md §3.3 */
const CLASS_UNLOCK_ROUTES: Record<string, { routes: Route[]; note: string }> = {
  'Caladrius': { routes: ['Cai'], note: "Cai: Castor's Renown 7 lesson" },
  'Dragoon': { routes: ['Cai', 'Theodora'], note: "Cai: Aurora's Renown 8 lesson; or Theodora Ch 11 supply quests" },
  'Troubadour': { routes: ['Cai', 'Leda'], note: "Cai: Renown 10 lesson; Leda: 'Elegant Drink Recipes'" },
  'Dancer': { routes: ['Leda'], note: "Leda: 'Great Dancer's Successor', Ch 9. Exclusive (one holder)." },
  'Blacksmith': { routes: ['Dietrich'], note: "Dietrich only (Smyrnos, Renown 8)" },
  'Guardian': { routes: ['Dietrich', 'Theodora'], note: "Dietrich (Il-Lara contract) or Theodora Ch 9 supply quests" },
  'Cataphract': { routes: ['Theodora'], note: "Theodora Ch 9 supply quests only" },
  // Automatic Advanced unlocks (all routes, no unlock requirement beyond cert)
  'Shido': { routes: ['Cai', 'Dietrich', 'Theodora', 'Leda'], note: "Automatic Advanced unlock" },
  'Warrior': { routes: ['Cai', 'Dietrich', 'Theodora', 'Leda'], note: "Automatic Advanced unlock" },
  'Sniper': { routes: ['Cai', 'Dietrich', 'Theodora', 'Leda'], note: "Automatic Advanced unlock" },
}

/** Classes that are exclusive (one holder at a time) */
const EXCLUSIVE_CLASSES = new Set(['Dancer', 'The Blade', 'The Apsara', 'The Eternal', 'The Godhand', 'The Calamity', 'The Trident', 'The Cavalier', 'The Avatar'])

/** Known skill requirements from CLAUDE.md §3.3 */
const KNOWN_SKILL_REQS: Record<string, string> = {
  'Shido': 'Swords B',
  'Warrior': 'Gauntlets B, Axes B, Swords B',
  'Sniper': 'Bows B',
  'Caladrius': 'Riding D, Black Magic B',
  'Dragoon': 'Flying C, plus Axe B or Spear B',
  'Troubadour': 'Riding D, plus White or Black Magic B',
  'Dancer': 'Bows B, Swords B',
  'Blacksmith': 'Black Magic D, Axes C',
  'Cataphract': 'Heavy Armor E+, Riding D, plus Axe B or Spear B',
  'Elephant Rider': 'Riding C',
  'Archer': 'Bows C',
  'Gladiator': 'Gauntlets, Axe or Sword D',
  'Hunter': 'Bows D, Swords D',
  'Soldier': 'Axes D, Spears D',
  'Ornius Rider': 'Riding E+, Axes D, Spears D',
  'Diviner': 'Black or White Magic D',
  'Swordmaster': 'Sword A (implied Shido path)',
  'Bow Adept': 'Bow A',
  'Sentinel': 'Spear A',
  'Druid': 'Black Magic A',
  'Wiseman': 'White Magic A',
  'Shadow Seeker': 'Bow A or Sword A',
  'Battlemaster': 'Gauntlet A, Axe A or Sword A',
  'Castle Knight': 'Heavy Armor C, plus Axe A or Spear A',
  'Great Knight': 'Heavy Armor D, Riding D, plus Axe A or Spear A',
  'Bau Lord': 'Flying C, plus Axe A or Spear A',
  'Celestial Trooper': 'Flying C, plus Spear A or Sword A',
}

function parseClassGrowths(): ClassDef[] {
  const raw = fs.readFileSync(path.join(RAW, 'class_growths.txt'), 'utf-8')
  const rows = parseTsv(raw)
  return rows.map(row => {
    const name = row['Name']!
    if (!name) throw new Error('class_growths.txt: missing Name column')
    const growths = extractStats(row)

    const mountMultipliers: MountMultipliers = { Horse: 0, Ornius: 0, Pegasus: 0, Bau: 0, Elephant: 0, Wyvern: 0, Griffon: 0 }
    for (const species of MOUNT_SPECIES) {
      const v = row[species]
      if (v === undefined) throw new Error(`class_growths.txt: missing mount column "${species}" for class "${name}"`)
      mountMultipliers[species] = parseFloat(v)
      if (isNaN(mountMultipliers[species])) throw new Error(`class_growths.txt: non-numeric mount multiplier for "${species}" in "${name}"`)
    }

    const tier = row['Tier'] as Tier
    if (!['Base', 'Beginner', 'Specialty', 'Advanced', 'Master', 'Divine'].includes(tier)) {
      throw new Error(`class_growths.txt: unknown tier "${tier}" for "${name}"`)
    }

    const idealRaw = row['Ideal_Exam_Level']!
    let idealExamLevel: number | null = null
    if (idealRaw !== 'N/A' && idealRaw !== 'None') {
      idealExamLevel = Number(idealRaw)
      if (isNaN(idealExamLevel)) throw new Error(`class_growths.txt: bad Ideal_Exam_Level "${idealRaw}" for "${name}"`)
    }

    const renownRaw = row['Renown_Req']!
    let renownReq: number | 'Part 3' | null = null
    if (renownRaw === 'N/A') {
      renownReq = null
    } else if (renownRaw === 'Part 3') {
      renownReq = 'Part 3'
    } else {
      renownReq = Number(renownRaw)
      if (isNaN(renownReq)) throw new Error(`class_growths.txt: bad Renown_Req "${renownRaw}" for "${name}"`)
    }

    const unlockInfo = CLASS_UNLOCK_ROUTES[name]
    // Automatic unlocks (Shido/Warrior/Sniper) are available on all routes but noted
    const isAutoUnlock = unlockInfo && unlockInfo.routes.length === 4
    const unlockRoutes = (unlockInfo && !isAutoUnlock) ? unlockInfo.routes : null
    const unlockNote = unlockInfo ? unlockInfo.note : null

    return {
      name,
      growths,
      mountMultipliers,
      tier,
      idealExamLevel,
      renownReq,
      incompleteData: false,
      skillRequirements: KNOWN_SKILL_REQS[name] ?? null,
      unlockRoutes,
      unlockNote,
      isExclusive: EXCLUSIVE_CLASSES.has(name),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: class_passive_growths.txt
// ─────────────────────────────────────────────────────────────────────────────

function parseClassPassiveGrowths(): ClassPassive[] {
  const raw = fs.readFileSync(path.join(RAW, 'class_passive_growths.txt'), 'utf-8')
  const rows = parseTsv(raw)
  return rows.map(row => {
    const className = row['Class']!
    const abilityName = row['Ability']!
    const fromLevel = Number(row['From_Level'])
    if (isNaN(fromLevel)) throw new Error(`class_passive_growths.txt: bad From_Level for "${className}"`)
    const growths = extractStats(row)
    const sourceConfidence = row['Source_Confidence'] ?? 'Unknown'
    return { className, abilityName, fromLevel, growths, sourceConfidence }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: mount_growths.txt
// ─────────────────────────────────────────────────────────────────────────────

function parseMountGrowths(): MountDef[] {
  const raw = fs.readFileSync(path.join(RAW, 'mount_growths.txt'), 'utf-8')
  const rows = parseTsv(raw)

  // Map growth column names from "HP_Growth" etc to stat key "HP" etc
  return rows.map(row => {
    const species = row['Mount_Species'] as MountSpecies
    if (!MOUNT_SPECIES.includes(species)) throw new Error(`mount_growths.txt: unknown species "${species}"`)
    const subtype = row['Mount_Subtype']!

    const growthsAtBond5: StatBlock = zeroStats()
    for (const key of STAT_COLS) {
      const colName = `${key}_Growth`
      const v = row[colName]
      if (v === undefined) throw new Error(`mount_growths.txt: missing column "${colName}" for "${subtype}"`)
      growthsAtBond5[key] = Number(v)
      if (isNaN(growthsAtBond5[key])) throw new Error(`mount_growths.txt: non-numeric "${colName}" for "${subtype}"`)
    }

    const isUnique = subtype.startsWith('Unique - ')
    const uniqueOwner = isUnique ? (subtype === 'Unique - Rocinan' ? 'Io' : subtype === 'Unique - Bucephalus' ? 'Alexandra' : null) : null
    const nameUnverified = subtype.includes('(EN name unverified)')

    return { species, subtype, growthsAtBond5, isUnique, uniqueOwner, nameUnverified }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: base_stats.txt
// ─────────────────────────────────────────────────────────────────────────────

function parseBaseStats(): BaseStatRow[] {
  const raw = fs.readFileSync(path.join(RAW, 'base_stats.txt'), 'utf-8')
  const rows = parseTsv(raw)
  return rows.map(row => {
    const name = row['Name']!
    const level = Number(row['Level'])
    if (isNaN(level)) throw new Error(`base_stats.txt: bad Level for "${name}"`)
    const startingClass = row['Starting_Class']!
    const stats = extractStats(row)
    const source = row['Source'] ?? ''
    return { name, level, startingClass, stats, source }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: recruitment_table.md
// ─────────────────────────────────────────────────────────────────────────────

function parseRecruitmentTable(): RecruitmentEntry[] {
  const raw = fs.readFileSync(path.join(RAW, 'recruitment_table.md'), 'utf-8')
  const entries: RecruitmentEntry[] = []

  for (const line of raw.split(/\r?\n/)) {
    // Match data rows: | **N** | **Name** | ... |
    const dataMatch = line.match(/^\|\s*\*\*\d+\*\*\s*\|\s*\*\*(.+?)\*\*\s*\|(.+)/)
    if (!dataMatch) continue

    const character = dataMatch[1]!.trim()
    const rest = dataMatch[2]!

    // Split by | but be careful of escaped \| inside cells
    // Replace \| with a placeholder, split, restore
    const PIPE_PLACEHOLDER = '\x00'
    const cellStr = rest.replace(/\\\|/g, PIPE_PLACEHOLDER)
    const cells = cellStr.split('|').map((c: string) => c.replace(new RegExp(PIPE_PLACEHOLDER, 'g'), '|').trim())

    // cells[0] = Cai, [1] = Dietrich, [2] = Theodora, [3] = Leda
    const routeCells: Record<Route, string> = {
      Cai: cells[0] ?? '',
      Dietrich: cells[1] ?? '',
      Theodora: cells[2] ?? '',
      Leda: cells[3] ?? '',
    }

    const routeStatuses: Record<Route, RecruitStatus> = {} as Record<Route, RecruitStatus>
    for (const route of ROUTES) {
      routeStatuses[route] = parseRecruitCell(routeCells[route])
    }

    entries.push({ character, routes: routeStatuses })
  }

  return entries
}

function parseRecruitCell(cell: string): RecruitStatus {
  const clean = cell.replace(/<br>/gi, '\n').replace(/<[^>]+>/g, '').trim()

  if (clean === '' || clean === '—' || clean.toLowerCase() === 'unrecruitable') {
    return { type: 'unrecruitable' }
  }

  if (/\*\*Auto Recruit\*\*/i.test(clean)) {
    const chMatch = clean.match(/Ch(?:apter)?\s*(\d+)/i)
    return {
      type: 'auto',
      chapter: chMatch ? Number(chMatch[1]) : null,
      chapterNote: clean.replace(/\*\*Auto Recruit\*\*/i, '').replace(/\(|\)/g, '').replace(/\*+/g, '').trim(),
    }
  }

  const supportMatch = clean.match(/Support\s+(\d)/i)
  const renownMatch = clean.match(/Renown\s+(\d+)/i)
  if (supportMatch && renownMatch) {
    const extraLines = clean.split('\n').slice(1).join('\n').replace(/\*+/g, '').replace(/\(|\)/g, '').trim()
    return {
      type: 'normal',
      supportRequired: Number(supportMatch[1]),
      renownRequired: Number(renownMatch[1]),
      extraCondition: extraLines || null,
    }
  }

  // Fallback: treat as unrecruitable and warn
  console.warn(`  Warning: could not parse recruit cell: "${cell.substring(0, 80)}"`)
  return { type: 'unrecruitable' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser: recruitment_join_estimates.md
// ─────────────────────────────────────────────────────────────────────────────

function parseJoinEstimates(): JoinEstimate[] {
  const raw = fs.readFileSync(path.join(RAW, 'recruitment_join_estimates.md'), 'utf-8')
  const estimates: JoinEstimate[] = []

  for (const line of raw.split(/\r?\n/)) {
    // Match table rows: | N | **Name** flags | ... |
    const dataMatch = line.match(/^\|\s*\d+\s*\|\s*\*\*(.+?)\*\*\s*(‡|†|\*)?\s*\|(.+)/)
    if (!dataMatch) continue

    const character = dataMatch[1]!.trim()
    const rowFlag = dataMatch[2] ?? ''
    const rest = dataMatch[3]!

    const cells = rest.split('|').map((c: string) => c.trim())
    const routeCells: Record<Route, string> = {
      Cai: cells[0] ?? '',
      Dietrich: cells[1] ?? '',
      Theodora: cells[2] ?? '',
      Leda: cells[3] ?? '',
    }

    const routeJoins: Record<Route, RouteJoin | null> = {} as Record<Route, RouteJoin | null>
    for (const route of ROUTES) {
      const calendarGated = rowFlag === '‡' || routeCells[route].includes('‡')
      const paralogueGated = routeCells[route].includes('†')
      routeJoins[route] = parseJoinCell(routeCells[route], calendarGated, paralogueGated)
    }

    estimates.push({ character, routes: routeJoins })
  }

  return estimates
}

function parseJoinCell(cell: string, calendarGated: boolean, paralogueGated: boolean): RouteJoin | null {
  const clean = cell.replace(/[†‡*]/g, '').trim()

  if (clean === '—' || clean === '') return null

  const chapterCorrected = cell.includes('*')

  // Auto recruit with optional chapter note
  // e.g. "Auto (Ch 1) · **Lv 1** ✓", "Auto (Tutorial, Ch 4) · ~6–7", "Auto (by Ch 3) · ~2–4"
  const isAuto = /^Auto/i.test(clean)

  let autoChapterNote: string | null = null
  if (isAuto) {
    const autoNoteMatch = clean.match(/Auto\s*\(([^)]*)\)/i)
    autoChapterNote = autoNoteMatch ? autoNoteMatch[1]!.trim() : null
  }

  // Extract chapter range: e.g. "Ch 8", "Ch 9–10", "Ch 4–5"
  const chMatch = clean.match(/Ch(?:apter)?\s*(\d+)(?:[–-](\d+))?/i)
  let chapterMin = 1
  let chapterMax = 1
  if (chMatch) {
    chapterMin = Number(chMatch[1])
    chapterMax = chMatch[2] ? Number(chMatch[2]) : chapterMin
  }

  // Extract level range: "~20", "~27–31", "**Lv 1** ✓", "~6–7", "~2–4"
  // The ✓ marker and **bold** are stripped; check for confirmed
  const confirmed = cell.includes('✓') || /\*\*Lv/.test(cell)
  const levelClean = clean.replace(/\*\*/g, '').replace(/✓/g, '').replace(/Lv\s*/i, '')

  const lvMatch = levelClean.match(/~?(\d+)(?:[–-](\d+))?(?:\s*\(actual[^)]*\))?/)
  let levelMin = 1
  let levelMax = 1
  if (lvMatch) {
    // Find the level part after the ·
    const afterDot = levelClean.split('·').slice(1).join('·').trim()
    const lvMatch2 = afterDot.match(/~?(\d+)(?:[–-](\d+))?/)
    if (lvMatch2) {
      levelMin = Number(lvMatch2[1])
      levelMax = lvMatch2[2] ? Number(lvMatch2[2]) : levelMin
    } else {
      // "Auto (Ch 1) · Lv 1" style
      const lvOnly = levelClean.match(/Lv\s*~?(\d+)(?:[–-](\d+))?/i)
      if (lvOnly) {
        levelMin = Number(lvOnly[1])
        levelMax = lvOnly[2] ? Number(lvOnly[2]) : levelMin
      }
    }
  }

  return {
    chapterMin,
    chapterMax,
    levelMin,
    levelMax,
    confirmed,
    isAuto,
    autoChapterNote,
    paralogueGated,
    calendarGated,
    chapterCorrected,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const LORDS = new Set(['Eshmel', 'Cai', 'Dietrich', 'Theodora', 'Leda'])
const LATER_GAME = new Set(['Bertrand', 'Talimun', 'Orchel', 'Anatolia', 'Hong Hua', 'Troy', 'Centurio', 'Aswan', 'Nathan', 'Creek', 'Klapka', 'Tahonia'])

function validate(
  chars: CharGrowth[],
  classes: ClassDef[],
  baseStats: BaseStatRow[],
  recruitment: RecruitmentEntry[],
  joins: JoinEstimate[],
): string[] {
  const errors: string[] = []
  const charNames = new Set(chars.map(c => c.name))
  const classNames = new Set(classes.map(c => c.name))

  // Every character in recruitment files must exist in char_growths
  const exemptChars = new Set([...LORDS, ...LATER_GAME])
  for (const entry of recruitment) {
    if (!charNames.has(entry.character) && !exemptChars.has(entry.character)) {
      errors.push(`Recruitment: unknown character "${entry.character}" (not in char_growths)`)
    }
  }
  for (const entry of joins) {
    if (!charNames.has(entry.character) && !exemptChars.has(entry.character)) {
      errors.push(`Join estimates: unknown character "${entry.character}" (not in char_growths)`)
    }
  }

  // Every class referenced in base_stats must exist in class_growths
  for (const row of baseStats) {
    if (!classNames.has(row.startingClass)) {
      errors.push(`base_stats: unknown Starting_Class "${row.startingClass}" for "${row.name}"`)
    }
  }

  // Every row must have 9 numeric stats (already validated during parse, but double-check)
  for (const c of chars) {
    const vals = Object.values(c.growths)
    if (vals.length !== 9) errors.push(`char_growths: "${c.name}" has ${vals.length} stats (expected 9)`)
    for (const v of vals) {
      if (typeof v !== 'number' || isNaN(v)) errors.push(`char_growths: "${c.name}" has non-numeric stat`)
    }
  }

  // Mount bond-5 sums: should be 25, except Rocinan and Bucephalus (30)
  // (validated separately in validateMounts)

  return errors
}

function validateMounts(mounts: MountDef[]): string[] {
  const errors: string[] = []
  for (const m of mounts) {
    const total = Object.values(m.growthsAtBond5).reduce((a, b) => a + b, 0)
    const expected = m.isUnique ? 30 : 25
    if (total !== expected) {
      errors.push(`mount_growths: "${m.subtype}" Bond 5 sum is ${total}, expected ${expected}`)
    }
  }
  return errors
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('build-data: parsing raw data files...')
  let hasErrors = false

  let chars: CharGrowth[], classes: ClassDef[], passives: ClassPassive[], mounts: MountDef[], baseStats: BaseStatRow[], recruitment: RecruitmentEntry[], joins: JoinEstimate[]

  try {
    chars = parseCharGrowths()
    console.log(`  ✓ char_growths: ${chars.length} characters`)
  } catch (e) { console.error('  ✗ char_growths:', (e as Error).message); hasErrors = true; chars = [] }

  try {
    classes = parseClassGrowths()
    console.log(`  ✓ class_growths: ${classes.length} classes`)
  } catch (e) { console.error('  ✗ class_growths:', (e as Error).message); hasErrors = true; classes = [] }

  try {
    passives = parseClassPassiveGrowths()
    console.log(`  ✓ class_passive_growths: ${passives.length} rows`)
  } catch (e) { console.error('  ✗ class_passive_growths:', (e as Error).message); hasErrors = true; passives = [] }

  try {
    mounts = parseMountGrowths()
    console.log(`  ✓ mount_growths: ${mounts.length} mounts`)
  } catch (e) { console.error('  ✗ mount_growths:', (e as Error).message); hasErrors = true; mounts = [] }

  try {
    baseStats = parseBaseStats()
    console.log(`  ✓ base_stats: ${baseStats.length} rows`)
  } catch (e) { console.error('  ✗ base_stats:', (e as Error).message); hasErrors = true; baseStats = [] }

  try {
    recruitment = parseRecruitmentTable()
    console.log(`  ✓ recruitment_table: ${recruitment.length} characters`)
  } catch (e) { console.error('  ✗ recruitment_table:', (e as Error).message); hasErrors = true; recruitment = [] }

  try {
    joins = parseJoinEstimates()
    console.log(`  ✓ recruitment_join_estimates: ${joins.length} characters`)
  } catch (e) { console.error('  ✗ join_estimates:', (e as Error).message); hasErrors = true; joins = [] }

  console.log('build-data: running validation checks...')
  const validationErrors = [
    ...validate(chars, classes, baseStats, recruitment, joins),
    ...validateMounts(mounts),
  ]

  if (validationErrors.length > 0) {
    for (const err of validationErrors) console.error('  ✗', err)
    hasErrors = true
  } else {
    console.log('  ✓ all validation checks passed')
  }

  if (hasErrors) {
    console.error('build-data: FAILED — fix errors above before building')
    process.exit(1)
  }

  if (VALIDATE_ONLY) {
    console.log('build-data: validation complete (--validate-only; no files written)')
    return
  }

  // Apply overrides
  if (fs.existsSync(OVERRIDES_PATH)) {
    const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'))
    if (overrides.tierOverrides) {
      for (const [name, tier] of Object.entries(overrides.tierOverrides)) {
        const cls = classes.find(c => c.name === name)
        if (cls) { cls.tier = tier as Tier; console.log(`  override: ${name} tier → ${tier}`) }
      }
    }
    if (overrides.skillRequirementsOverrides) {
      for (const [name, info] of Object.entries(overrides.skillRequirementsOverrides) as [string, { requirements: string | null; note: string }][]) {
        const cls = classes.find(c => c.name === name)
        if (cls) cls.skillRequirements = info.requirements
      }
    }
    if (overrides.userBaseStats) {
      const extras = Object.values(overrides.userBaseStats).filter((v) => typeof v === 'object' && (v as Record<string, unknown>)['Name'])
      for (const row of extras as Record<string, unknown>[]) {
        if (!baseStats.find(b => b.name === row['Name'])) {
          baseStats.push({
            name: row['Name'] as string,
            level: row['Level'] as number,
            startingClass: row['Starting_Class'] as string,
            stats: { HP: row['HP'], Str: row['Str'], Mag: row['Mag'], Spd: row['Spd'], Dex: row['Dex'], Def: row['Def'], Res: row['Res'], Lck: row['Lck'], Cha: row['Cha'] } as StatBlock,
            source: row['Source'] as string ?? 'user override',
          })
        }
      }
    }
  }

  // Write output files
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const write = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n')
    console.log(`  wrote src/data/${name}`)
  }

  write('charGrowths.json', chars)
  write('classGrowths.json', classes)
  write('classPassiveGrowths.json', passives)
  write('mountGrowths.json', mounts)
  write('baseStats.json', baseStats)
  write('recruitment.json', recruitment)
  write('joinEstimates.json', joins)

  // Also write a metadata file with build info
  write('meta.json', {
    builtAt: new Date().toISOString(),
    characterCount: chars.length,
    classCount: classes.length,
    mountCount: mounts.length,
  })

  console.log('build-data: done')
}

main()
