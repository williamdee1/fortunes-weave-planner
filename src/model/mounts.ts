/**
 * mounts.ts — Mount growth bonus calculations.
 *
 * §4.2: mountGrowth = mount.growth[stat] * class.mountMultiplier[species] * bondFactor(bond)
 *
 * Bond factor = bond / maxBond (linear interpolation, approximation).
 * Normal mounts: maxBond = 5. Unique mounts (Rocinan, Bucephalus): maxBond = 6.
 * The mount bonus is zero when mountMultiplier for the species is 0.
 */

import type { ClassDef, MountDef, StatKey, PlannerSettings } from './types'

/**
 * Mount growth bonus for a single stat on a single level-up.
 *
 * Returns 0 if:
 * - mount is null
 * - the class's multiplier for the mount's species is 0
 */
export function mountGrowth(
  classDef: ClassDef,
  mountDef: MountDef | null,
  bond: number,
  stat: StatKey,
  settings: PlannerSettings,
): number {
  if (!mountDef) return 0

  const multiplier = classDef.mountMultipliers[mountDef.species]
  if (multiplier === 0) return 0

  const maxBond = mountDef.isUnique ? settings.maxBondForUniqueMount : settings.maxBondForNormalMount
  const bondFactor = Math.max(0, Math.min(bond, maxBond)) / maxBond

  return mountDef.growthsAtBond5[stat] * multiplier * bondFactor
}

/**
 * Total mount growth contribution over all stats (for optimizer scoring).
 */
export function mountGrowthAll(
  classDef: ClassDef,
  mountDef: MountDef | null,
  bond: number,
  settings: PlannerSettings,
): Record<StatKey, number> {
  const result = {} as Record<StatKey, number>
  const keys: StatKey[] = ['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha']
  for (const k of keys) {
    result[k] = mountGrowth(classDef, mountDef, bond, k, settings)
  }
  return result
}

/**
 * Check whether a mount can be used with a given class (multiplier > 0).
 */
export function isMountCompatible(classDef: ClassDef, mountDef: MountDef): boolean {
  return classDef.mountMultipliers[mountDef.species] > 0
}

/**
 * Find the best mount for a class from a list of available mounts,
 * scored against an objective weight vector.
 */
export function bestMountForClass(
  classDef: ClassDef,
  availableMounts: MountDef[],
  bond: number,
  weights: Record<StatKey, number>,
  settings: PlannerSettings,
): MountDef | null {
  let best: MountDef | null = null
  let bestScore = -Infinity

  for (const mount of availableMounts) {
    if (!isMountCompatible(classDef, mount)) continue
    let score = 0
    for (const k of ['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha'] as StatKey[]) {
      score += mountGrowth(classDef, mount, bond, k, settings) * weights[k]
    }
    if (score > bestScore) { bestScore = score; best = mount }
  }

  return best
}
