import { select, type AnyTrait, type World } from '../runtime'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'

const BatchRegistries = select(BatchRegistry)

/**
 * Rebuild the effect traits map from tracked materials.
 *
 * Populates BatchRegistry.effectTraits from material references.
 * Self-gating: no-ops if no BatchRegistry exists.
 */
export function effectTraitsSystem(world: World): void {
  const registryEntities = world.view(BatchRegistries)
  if (registryEntities.length === 0) return
  const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
  if (!registry) return

  registry.effectTraits.clear()
  for (const { material } of registry.materialRefs.values()) {
    for (const effectClass of material.getEffects()) {
      registry.effectTraits.set(effectClass._trait as AnyTrait, effectClass)
    }
  }
}
