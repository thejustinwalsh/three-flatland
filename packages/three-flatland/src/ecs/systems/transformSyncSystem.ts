import { getStore as kootaGetStore, type World, type Trait } from 'koota'
import { Matrix4, type Object3D } from 'three'
import { IsRenderable, IsBatched, BatchSlot, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import { quadHalfExtents } from '../../pipeline/SpriteSpatialGrid'
import { ENTITY_ID_MASK } from '../snapshot'
import { HierarchyStateTracker } from '../HierarchyStateTracker'

/** Scratch for quadHalfExtents — systems are single-threaded. */
const _he = { hx: 0, hy: 0 }
const _updatedParents = new Set<Object3D>()
const _trackers = new WeakMap<RegistryData, HierarchyStateTracker>()
const _rootInverse = new Matrix4()
const _relativeMatrix = new Matrix4()
const _relativeParents = new Map<Object3D, Matrix4>()
const _relativeParentPool: Matrix4[] = []
let _relativeParentPoolIndex = 0

function syncInstanceSlot(buffer: Float32Array, offset: number, matrix: Matrix4, visible: boolean): boolean {
  const elements = matrix.elements
  let changed = false
  for (let i = 0; i < 16; i++) {
    const value = Math.fround(visible ? elements[i]! : i < 12 ? 0 : i === 15 ? 1 : elements[i]!)
    if (buffer[offset + i] !== value) {
      changed = true
      break
    }
  }
  if (!changed) return false
  for (let i = 0; i < 16; i++) {
    buffer[offset + i] = Math.fround(visible ? elements[i]! : i < 12 ? 0 : i === 15 ? 1 : elements[i]!)
  }
  return true
}

function writeInstanceSlot(buffer: Float32Array, offset: number, matrix: Matrix4, visible: boolean): void {
  const elements = matrix.elements
  if (visible) {
    buffer[offset] = elements[0]!
    buffer[offset + 1] = elements[1]!
    buffer[offset + 2] = elements[2]!
    buffer[offset + 3] = elements[3]!
    buffer[offset + 4] = elements[4]!
    buffer[offset + 5] = elements[5]!
    buffer[offset + 6] = elements[6]!
    buffer[offset + 7] = elements[7]!
    buffer[offset + 8] = elements[8]!
    buffer[offset + 9] = elements[9]!
    buffer[offset + 10] = elements[10]!
    buffer[offset + 11] = elements[11]!
    buffer[offset + 12] = elements[12]!
    buffer[offset + 13] = elements[13]!
    buffer[offset + 14] = elements[14]!
    buffer[offset + 15] = elements[15]!
  } else {
    buffer[offset] = 0
    buffer[offset + 1] = 0
    buffer[offset + 2] = 0
    buffer[offset + 3] = 0
    buffer[offset + 4] = 0
    buffer[offset + 5] = 0
    buffer[offset + 6] = 0
    buffer[offset + 7] = 0
    buffer[offset + 8] = 0
    buffer[offset + 9] = 0
    buffer[offset + 10] = 0
    buffer[offset + 11] = 0
    buffer[offset + 12] = elements[12]!
    buffer[offset + 13] = elements[13]!
    buffer[offset + 14] = elements[14]!
    buffer[offset + 15] = 1
  }
}

function isIdentity(matrix: Matrix4): boolean {
  const e = matrix.elements
  return (
    e[0] === 1 &&
    e[1] === 0 &&
    e[2] === 0 &&
    e[3] === 0 &&
    e[4] === 0 &&
    e[5] === 1 &&
    e[6] === 0 &&
    e[7] === 0 &&
    e[8] === 0 &&
    e[9] === 0 &&
    e[10] === 1 &&
    e[11] === 0 &&
    e[12] === 0 &&
    e[13] === 0 &&
    e[14] === 0 &&
    e[15] === 1
  )
}

function hierarchyVisibleFrom(object: Object3D | null): boolean {
  while (object) {
    if (!object.visible) return false
    object = object.parent
  }
  return true
}

/** Resolve SoA store for a numeric trait — one lookup, reused for all entities. */
function getNumericStore(world: World, trait: Trait): Record<string, number[]> {
  return kootaGetStore(world, trait) as Record<string, number[]>
}

/**
 * Sync transforms to GPU instance matrices AND `sprite.matrixWorld`.
 *
 * Position, rotation, and scale are read directly from the Object3D via
 * spriteArr (flat array indexed by entity SoA index). Same O(1) array
 * access pattern as all other SoA stores — zero hash overhead.
 *
 * This pass is the SINGLE WRITER of a batched sprite's GPU transform.
 * Auto-orchestrated sprites retain their real source parent, while explicit
 * SpriteGroup sprites use the owning group as their hierarchy boundary.
 * The source world matrix is retained for picking/debugging. The GPU slot is
 * relative to the owning SpriteGroup, whose batch mesh carries the root world
 * transform. Moving the shared root therefore does not rewrite every slot.
 *
 * UV writes used to live here too (under the comment "UV sync is folded
 * into transformSyncSystem"). Phase 3 of the perf roadmap moved UV to
 * setter-side direct writes via `Sprite2D.setFrame` → `mesh.writeUV`,
 * so this system is now matrix-only.
 */
export function transformSyncSystem(world: World): void {
  const entities = world.query(IsRenderable, IsBatched, BatchSlot)

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return
  const meshSlots = registry.batchSlots
  const spriteArr = registry.spriteArr

  // Explicit SpriteGroup schedules run before their own normal matrix
  // compose. Refresh that shared hierarchy boundary once. Auto sprites'
  // source parents were already visited by the scene traversal before the
  // hidden orchestration group runs.
  const group = registry.parentGroup
  group?.updateWorldMatrix(true, false)
  _updatedParents.clear()
  _relativeParents.clear()
  _relativeParentPoolIndex = 0
  let tracker = _trackers.get(registry)
  if (!tracker) {
    tracker = new HierarchyStateTracker()
    _trackers.set(registry, tracker)
  }
  tracker.beginFrame()
  const rootChanged = group ? tracker.pathChanged(group, null, undefined, undefined, false) : false
  const rootIsIdentity = !group || isIdentity(group.matrixWorld)
  const rootVisible = hierarchyVisibleFrom(group)
  if (group) _rootInverse.copy(group.matrixWorld).invert()
  else _rootInverse.identity()

  // Pre-resolve SoA stores once — reused for every entity in the loop.
  const firstEntity = entities[0]
  if (!firstEntity) return

  const bsStore = getNumericStore(world, BatchSlot)
  const batchIdxArr = bsStore['batchIdx']!
  const slotArr = bsStore['slot']!

  for (const entity of entities) {
    const eid = (entity as unknown as number) & ENTITY_ID_MASK

    const batchIdx = batchIdxArr[eid]!
    if (batchIdx < 0) continue
    const slot = slotArr[eid]!

    const mesh = meshSlots[batchIdx] as SpriteBatch | undefined
    if (!mesh) continue

    const sprite = spriteArr[eid]
    if (!sprite) continue

    const buf = mesh.instanceMatrix.array as Float32Array
    const o = slot * 16
    const directRoot = !sprite._autoRegistry && !sprite._hierarchyManaged
    const sourceParent = sprite._autoRegistry || sprite._hierarchyManaged ? sprite.parent : group
    if (sourceParent && sourceParent !== group && !_updatedParents.has(sourceParent)) {
      sourceParent.updateWorldMatrix(true, false)
      _updatedParents.add(sourceParent)
    }
    sprite.updateMatrix()
    const sourceVisible = sprite._batchVisibilityState()
    const pathChanged = tracker.pathChanged(sprite, group, sourceParent, sourceVisible)
    if (!pathChanged && !rootChanged) {
      if (sprite._hierarchyManaged || sprite._autoRegistry) sprite._batchWorldFresh = true
      continue
    }

    // updateMatrix() above already produced the fast 2D local affine. Compose
    // the source world matrix once without calling it again through the public
    // on-demand helper. The direct-root/identity case is Knightmark's hot path.
    if (!sourceParent) sprite.matrixWorld.copy(sprite.matrix)
    else if (sourceParent === group && rootIsIdentity) {
      sprite.matrixWorld.copy(sprite.matrix)
    } else sprite.matrixWorld.multiplyMatrices(sourceParent.matrixWorld, sprite.matrix)
    sprite.matrixWorldNeedsUpdate = false
    if (sprite._hierarchyManaged || sprite._autoRegistry) sprite._batchWorldFresh = true
    const worldMatrix = rootIsIdentity && directRoot ? sprite.matrix.elements : sprite.matrixWorld.elements
    const hierarchyVisible = directRoot ? rootVisible && sourceVisible : sprite._isHierarchyVisible(sourceParent)

    let relativeMatrix: Matrix4
    if (!sourceParent || sourceParent === group) relativeMatrix = sprite.matrix
    else {
      let relativeParent = _relativeParents.get(sourceParent)
      if (!relativeParent) {
        relativeParent = _relativeParentPool[_relativeParentPoolIndex]
        if (!relativeParent) {
          relativeParent = new Matrix4()
          _relativeParentPool.push(relativeParent)
        }
        _relativeParentPoolIndex++
        relativeParent.multiplyMatrices(_rootInverse, sourceParent.matrixWorld)
        _relativeParents.set(sourceParent, relativeParent)
      }
      relativeMatrix = _relativeMatrix.multiplyMatrices(relativeParent, sprite.matrix)
    }

    if (pathChanged) {
      writeInstanceSlot(buf, o, relativeMatrix, hierarchyVisible)
      mesh.markMatrixDirty(slot)
    } else if (syncInstanceSlot(buf, o, relativeMatrix, hierarchyVisible)) {
      // The shared root changed. Root motion normally leaves relative slots
      // byte-identical; root visibility is the exceptional case that writes.
      mesh.markMatrixDirty(slot)
    }

    // Keep the picking broadphase keyed to the composed WORLD position
    // (the same translation the GPU draws at). No-op inside the grid when the
    // sprite's cell coverage hasn't changed — the static-sprite frame.
    if (hierarchyVisible) {
      quadHalfExtents(worldMatrix[0]!, worldMatrix[4]!, worldMatrix[1]!, worldMatrix[5]!, sprite.hitRadius, _he)
      mesh.grid.update(sprite, worldMatrix[12]!, worldMatrix[13]!, _he.hx, _he.hy, worldMatrix[14]!)
    } else {
      mesh.grid.remove(sprite)
    }

    // matrixWorld remains world-space while the GPU slot is root-relative, so
    // direct raycasts/debugging and rendering observe the same hierarchy.

    // Auto-derived shadow radius tracks animated scale (e.g.
    // AnimatedSprite2D frame source-size swaps) each frame. Explicit
    // overrides are static and written once at assign/reassign time, so
    // skip them here to avoid needless interleaved-buffer re-uploads.
    if (sprite.shadowRadius === undefined) {
      if (rootIsIdentity && directRoot) {
        mesh.writeShadowRadius(
          slot,
          Math.max(Math.abs(sprite.scale.x * sprite._trimSX), Math.abs(sprite.scale.y * sprite._trimSY))
        )
      } else {
        const worldScaleX = Math.hypot(worldMatrix[0]!, worldMatrix[1]!, worldMatrix[2]!)
        const worldScaleY = Math.hypot(worldMatrix[4]!, worldMatrix[5]!, worldMatrix[6]!)
        mesh.writeShadowRadius(slot, Math.max(worldScaleX, worldScaleY))
      }
    }
  }
}
