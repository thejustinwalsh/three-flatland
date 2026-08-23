import { select, type World } from '../runtime'
import { Matrix4, type Object3D } from 'three'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { quadHalfExtents } from '../../pipeline/SpriteSpatialGrid'
import { HierarchyStateTracker } from '../HierarchyStateTracker'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

const BatchRegistries = select(BatchRegistry)

const _trackers = new WeakMap<RegistryData, HierarchyStateTracker>()

interface TransformScratch {
  readonly halfExtents: { hx: number; hy: number }
  readonly updatedParents: Set<Object3D>
  readonly rootInverse: Matrix4
  readonly relativeMatrix: Matrix4
  readonly relativeParents: Map<Object3D, Matrix4>
  readonly relativeParentPool: Matrix4[]
  relativeParentPoolIndex: number
}

const _scratchByRegistry = new WeakMap<RegistryData, TransformScratch>()

function transformScratch(registry: RegistryData): TransformScratch {
  let scratch = _scratchByRegistry.get(registry)
  if (!scratch) {
    scratch = {
      halfExtents: { hx: 0, hy: 0 },
      updatedParents: new Set(),
      rootInverse: new Matrix4(),
      relativeMatrix: new Matrix4(),
      relativeParents: new Map(),
      relativeParentPool: [],
      relativeParentPoolIndex: 0,
    }
    _scratchByRegistry.set(registry, scratch)
  }
  return scratch
}

/** Write a slot only when its visible or hidden matrix representation changed. */
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

/** Encode a source matrix, using zero scale while preserving hidden position. */
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

/** Return whether a complete Matrix4 is the exact identity transform. */
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

/** Resolve effective Three.js visibility from an object through the scene root. */
function hierarchyVisibleFrom(object: Object3D | null): boolean {
  while (object) {
    if (!object.visible) return false
    object = object.parent
  }
  return true
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
  const registryEntities = world.view(BatchRegistries)
  if (registryEntities.length === 0) return
  const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
  if (!registry) return
  const meshSlots = registry.batchSlots
  const scratch = transformScratch(registry)

  // Explicit SpriteGroup schedules run before their own normal matrix
  // compose. Refresh that shared hierarchy boundary once. Auto sprites'
  // source parents were already visited by the scene traversal before the
  // hidden orchestration group runs.
  const group = registry.parentGroup
  group?.updateWorldMatrix(true, false)
  scratch.updatedParents.clear()
  scratch.relativeParents.clear()
  scratch.relativeParentPoolIndex = 0
  let tracker = _trackers.get(registry)
  if (!tracker) {
    tracker = new HierarchyStateTracker()
    _trackers.set(registry, tracker)
  }
  tracker.beginFrame()
  const rootChanged = group ? tracker.pathChanged(group, null, undefined, undefined, false) : false
  const rootIsIdentity = !group || isIdentity(group.matrixWorld)
  const rootVisible = hierarchyVisibleFrom(group)
  if (group) scratch.rootInverse.copy(group.matrixWorld).invert()
  else scratch.rootInverse.identity()

  // Traverse one batch's packed active-member table to completion before
  // advancing to the next GPU buffer. Sorting only changes each member's
  // physical-slot indirection, so sprite/SoA reads remain batch-local and
  // stable across sort permutations. Swap-removal keeps the table hole-free.
  for (const mesh of meshSlots) {
    if (!mesh) continue
    const ownership = getSpriteBatchOwnership(mesh)
    const sprites = ownership.memberSprites
    const memberSpan = ownership.memberSpan()
    const buf = mesh.instanceMatrix.array as Float32Array
    for (let member = 0; member < memberSpan; member++) {
      const sprite = sprites[member]
      if (!sprite) continue
      const slot = ownership.memberSlotAt(member)
      const owner = ownership.slotEntities[slot] ?? 0

      const o = slot * 16
      const directRoot = !sprite._autoRegistry && !sprite._hierarchyManaged
      const sourceParent = sprite._autoRegistry || sprite._hierarchyManaged ? sprite.parent : group
      if (sourceParent && sourceParent !== group && !scratch.updatedParents.has(sourceParent)) {
        sourceParent.updateWorldMatrix(true, false)
        scratch.updatedParents.add(sourceParent)
      }
      sprite.updateMatrix()
      // updateMatrix() is virtual user code. Removal/disposal can synchronously
      // unenroll the sprite while this pass still holds its borrowed member
      // reference. Never project that stale sprite into a row now owned by a
      // different entity (or leave its deferred-removal row visible).
      const rowStillOwned = ownership.slotEntities[slot] === owner && ownership.spriteAtSlot(slot) === sprite
      if (
        owner === 0 ||
        sprite.entity !== owner ||
        sprite._batchMesh !== mesh ||
        sprite._batchSlot !== slot ||
        !rowStillOwned
      ) {
        // A deferred removal leaves ownership published until batchRemove runs
        // next frame, so hide that stale row immediately. If user code released
        // and reused the row reentrantly, however, its replacement is already
        // authoritative and must not be zeroed here.
        if (rowStillOwned) ownership.hideSlot(slot)
        mesh.grid.remove(sprite)
        continue
      }
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
        let relativeParent = scratch.relativeParents.get(sourceParent)
        if (!relativeParent) {
          relativeParent = scratch.relativeParentPool[scratch.relativeParentPoolIndex]
          if (!relativeParent) {
            relativeParent = new Matrix4()
            scratch.relativeParentPool.push(relativeParent)
          }
          scratch.relativeParentPoolIndex++
          relativeParent.multiplyMatrices(scratch.rootInverse, sourceParent.matrixWorld)
          scratch.relativeParents.set(sourceParent, relativeParent)
        }
        relativeMatrix = scratch.relativeMatrix.multiplyMatrices(relativeParent, sprite.matrix)
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
        quadHalfExtents(
          worldMatrix[0]!,
          worldMatrix[4]!,
          worldMatrix[1]!,
          worldMatrix[5]!,
          sprite.hitRadius,
          scratch.halfExtents
        )
        mesh.grid.update(
          sprite,
          worldMatrix[12]!,
          worldMatrix[13]!,
          scratch.halfExtents.hx,
          scratch.halfExtents.hy,
          worldMatrix[14]!
        )
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
}
