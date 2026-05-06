import type { World } from 'koota'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'

/**
 * Rebuild the effect traits map from tracked materials.
 *
 * Populates BatchRegistry.effectTraits from material references.
 * Self-gating: no-ops if no BatchRegistry exists.
 */
export function effectTraitsSystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  registry.effectTraits.clear()
  for (const { material } of registry.materialRefs.values()) {
    for (const effectClass of material.getEffects()) {
      registry.effectTraits.set(effectClass._trait, effectClass)
    }
  }
}
