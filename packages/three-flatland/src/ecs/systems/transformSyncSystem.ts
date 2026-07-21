import { getStore as kootaGetStore, type World, type Trait } from 'koota'
import { IsRenderable, IsBatched, SortLayer, SpriteZIndex, BatchSlot, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import { quadHalfExtents } from '../../pipeline/SpriteSpatialGrid'
import { ENTITY_ID_MASK } from '../snapshot'

/** Scratch for quadHalfExtents — systems are single-threaded. */
const _he = { hx: 0, hy: 0 }

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
 * This pass is the SINGLE WRITER of a batched sprite's world transform:
 * the owning SpriteGroup's world affine (from `registry.parentGroup`) is
 * folded into each sprite's local 2D TRS, and the composed WORLD affine
 * lands in both the batch instanceMatrix slot (what the GPU draws — the
 * batch mesh itself stays pinned at identity, see SpriteBatch) and
 * `sprite.matrixWorld` (what raycasts read). Batched sprites have
 * `matrixWorldAutoUpdate` disabled so three never clobbers the result.
 * The fold is a 2D-affine ∘ 2D-affine compose — never a full 4x4
 * multiply — and is skipped entirely when the group sits at identity
 * (the 99% path).
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

  // Extract the SpriteGroup's world 2D affine ONCE per call. The group
  // ancestors' matrixWorld may not be composed yet this frame (the
  // schedule runs at the TOP of SpriteGroup.updateMatrixWorld, before
  // three's own compose), so refresh it explicitly. updateWorldMatrix
  // is not overridden by SpriteGroup — no schedule re-entry.
  let ga = 1
  let gb = 0
  let gc = 0
  let gd = 1
  let gtx = 0
  let gty = 0
  let gtz = 0
  const group = registry.parentGroup
  if (group) {
    group.updateWorldMatrix(true, false)
    const ge = group.matrixWorld.elements
    ga = ge[0]!
    gb = ge[1]!
    gc = ge[4]!
    gd = ge[5]!
    gtx = ge[12]!
    gty = ge[13]!
    gtz = ge[14]!
  }
  const groupIsIdentity = ga === 1 && gb === 0 && gc === 0 && gd === 1 && gtx === 0 && gty === 0 && gtz === 0

  // Pre-resolve SoA stores once — reused for every entity in the loop.
  const firstEntity = entities[0]
  if (!firstEntity) return

  const bsStore = getNumericStore(world, BatchSlot)
  const batchIdxArr = bsStore['batchIdx']!
  const slotArr = bsStore['slot']!

  const layerArr = getNumericStore(world, SortLayer)['value']!
  const zIndexArr = getNumericStore(world, SpriteZIndex)['zIndex']!

  for (const entity of entities) {
    const eid = (entity as unknown as number) & ENTITY_ID_MASK

    const batchIdx = batchIdxArr[eid]!
    if (batchIdx < 0) continue
    const slot = slotArr[eid]!

    const mesh = meshSlots[batchIdx] as SpriteBatch | undefined
    if (!mesh) continue

    const sprite = spriteArr[eid]
    if (!sprite) continue

    const layer = layerArr[eid]!
    const zIdx = zIndexArr[eid]!

    // Anchor + trim offset, unrotated — same convention as
    // Sprite2D.updateMatrix (see that method for the rationale).
    const px = sprite.position.x + (0.5 - sprite.anchor.x + sprite._trimOX) * sprite.scale.x
    const py = sprite.position.y + (0.5 - sprite.anchor.y + sprite._trimOY) * sprite.scale.y
    const pz = sprite.position.z + layer * 10 + zIdx * 0.001
    const sx = sprite.scale.x * sprite._trimSX
    const sy = sprite.scale.y * sprite._trimSY
    const rz = sprite.rotation.z

    // Local 2D linear part (rotation.z × scale, trim-baked).
    let m00: number
    let m01: number
    let m10: number
    let m11: number
    if (rz !== 0) {
      const c = Math.cos(rz)
      const s = Math.sin(rz)
      m00 = c * sx
      m01 = -s * sy
      m10 = s * sx
      m11 = c * sy
    } else {
      m00 = sx
      m01 = 0
      m10 = 0
      m11 = sy
    }
    let tx = px
    let ty = py
    let tz = pz
    if (!groupIsIdentity) {
      // Fold the group's world affine: 2x2 linear multiply + translation.
      const l00 = m00
      const l01 = m01
      const l10 = m10
      const l11 = m11
      m00 = ga * l00 + gc * l10
      m10 = gb * l00 + gd * l10
      m01 = ga * l01 + gc * l11
      m11 = gb * l01 + gd * l11
      tx = ga * px + gc * py + gtx
      ty = gb * px + gd * py + gty
      tz = pz + gtz
    }

    const buf = mesh.instanceMatrix.array as Float32Array
    const o = slot * 16
    buf[o] = m00
    buf[o + 1] = m10
    buf[o + 2] = 0
    buf[o + 3] = 0
    buf[o + 4] = m01
    buf[o + 5] = m11
    buf[o + 6] = 0
    buf[o + 7] = 0
    buf[o + 8] = 0
    buf[o + 9] = 0
    buf[o + 10] = 1
    buf[o + 11] = 0
    buf[o + 12] = tx
    buf[o + 13] = ty
    buf[o + 14] = tz
    buf[o + 15] = 1

    mesh.markMatrixDirty(slot)

    // Keep the picking broadphase keyed to the composed WORLD position
    // (the same tx/ty the GPU draws at). No-op inside the grid when the
    // sprite's cell coverage hasn't changed — the static-sprite frame.
    quadHalfExtents(m00, m01, m10, m11, sprite.hitRadius, _he)
    mesh.grid.update(sprite, tx, ty, _he.hx, _he.hy, tz)

    // We do NOT write sprite.matrixWorld here. Rendering reads the instance
    // slot above; the only per-frame consumer of a batched sprite's
    // matrixWorld is raycast(), which composes it on demand for the one sprite
    // being cast (Sprite2D._composeBatchedMatrixWorld). Materializing it for
    // every sprite every frame is wasted work.

    // Auto-derived shadow radius tracks animated scale (e.g.
    // AnimatedSprite2D frame source-size swaps) each frame. Explicit
    // overrides are static and written once at assign/reassign time, so
    // skip them here to avoid needless interleaved-buffer re-uploads.
    if (sprite.shadowRadius === undefined) {
      mesh.writeShadowRadius(slot, Math.max(Math.abs(sx), Math.abs(sy)))
    }
  }
}
