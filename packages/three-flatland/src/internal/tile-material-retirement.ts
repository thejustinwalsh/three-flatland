import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

const pendingRetirement = new WeakSet<Sprite2DMaterial>()
const pendingResources = new WeakMap<Sprite2DMaterial, Set<{ dispose(): void }>>()
const resourceRefCounts = new WeakMap<object, number>()
const transferHolds = new WeakMap<Sprite2DMaterial, number>()

/** Keep a pending generated material alive across an atomic owner transfer. */
export function holdTileMaterialRetirement(material: Sprite2DMaterial): () => void {
  transferHolds.set(material, (transferHolds.get(material) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const count = transferHolds.get(material) ?? 0
    if (count > 1) transferHolds.set(material, count - 1)
    else transferHolds.delete(material)
  }
}

export function deferTileMaterialRetirement(
  material: Sprite2DMaterial,
  resources: readonly { dispose(): void }[] = []
): void {
  pendingRetirement.add(material)
  let owned = pendingResources.get(material)
  if (!owned) {
    owned = new Set()
    pendingResources.set(material, owned)
  }
  for (const resource of resources) {
    if (owned.has(resource)) continue
    owned.add(resource)
    resourceRefCounts.set(resource, (resourceRefCounts.get(resource) ?? 0) + 1)
  }
}

/** Dispose a generated tile material once its final live owner releases it. */
export function disposeRetiredTileMaterialIfPending(material: Sprite2DMaterial): void {
  if ((transferHolds.get(material) ?? 0) > 0) return
  if (!pendingRetirement.delete(material)) return
  let firstError: unknown
  let didError = false
  try {
    material.dispose()
  } catch (error) {
    firstError = error
    didError = true
  }
  const resources = pendingResources.get(material)
  pendingResources.delete(material)
  for (const resource of resources ?? []) {
    const count = resourceRefCounts.get(resource) ?? 0
    if (count > 1) resourceRefCounts.set(resource, count - 1)
    else {
      resourceRefCounts.delete(resource)
      try {
        resource.dispose()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
  }
  if (didError) throw firstError
}
