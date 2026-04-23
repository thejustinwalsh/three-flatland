import { getStore as kootaGetStore, type World, type Trait } from 'koota'
import {
  IsRenderable,
  IsBatched,
  SpriteUV,
  SpriteLayer,
  SpriteZIndex,
  BatchSlot,
  BatchRegistry,
} from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import { ENTITY_ID_MASK } from '../snapshot'

/** Resolve SoA store for a numeric trait — one lookup, reused for all entities. */
function getNumericStore(world: World, trait: Trait): Record<string, number[]> {
  return kootaGetStore(world, trait) as Record<string, number[]>
}

/**
 * Sync transforms and UVs to GPU instance buffers.
 *
 * Position, rotation, and scale are read directly from the Object3D via
 * spriteArr (flat array indexed by entity SoA index). Same O(1) array
 * access pattern as all other SoA stores — zero hash overhead.
 *
 * UV, layer, zIndex, and batch slot are read from SoA stores (flat arrays
 * indexed by entity ID) — zero allocation, zero object dereference.
 */
export function transformSyncSystem(world: World): void {
  const entities = world.query(IsRenderable, IsBatched, BatchSlot)

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return
  const meshSlots = registry.batchSlots
  const spriteArr = registry.spriteArr

  // Pre-resolve SoA stores once — reused for every entity in the loop.
  const firstEntity = entities[0]
  if (!firstEntity) return

  const bsStore = getNumericStore(world, BatchSlot)
  const batchIdxArr = bsStore['batchIdx']!
  const slotArr = bsStore['slot']!

  const layerArr = getNumericStore(world, SpriteLayer)['layer']!
  const zIndexArr = getNumericStore(world, SpriteZIndex)['zIndex']!

  const uvStore = getNumericStore(world, SpriteUV)
  const uvXArr = uvStore['x']!
  const uvYArr = uvStore['y']!
  const uvWArr = uvStore['w']!
  const uvHArr = uvStore['h']!

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

    const px = sprite.position.x
    const py = sprite.position.y
    const pz = sprite.position.z + layer * 10 + zIdx * 0.001
    const sx = sprite.scale.x
    const sy = sprite.scale.y
    const rz = sprite.rotation.z

    const buf = mesh.instanceMatrix.array as Float32Array
    const o = slot * 16
    if (rz !== 0) {
      const c = Math.cos(rz)
      const s = Math.sin(rz)
      buf[o]     = c * sx; buf[o + 4] = -s * sy; buf[o + 8]  = 0; buf[o + 12] = px
      buf[o + 1] = s * sx; buf[o + 5] =  c * sy; buf[o + 9]  = 0; buf[o + 13] = py
    } else {
      buf[o]     = sx; buf[o + 4] = 0;  buf[o + 8]  = 0; buf[o + 12] = px
      buf[o + 1] = 0;  buf[o + 5] = sy; buf[o + 9]  = 0; buf[o + 13] = py
    }
    buf[o + 2]  = 0; buf[o + 6] = 0; buf[o + 10] = 1; buf[o + 14] = pz
    buf[o + 3]  = 0; buf[o + 7] = 0; buf[o + 11] = 0; buf[o + 15] = 1

    mesh.markMatrixDirty(slot)
    mesh.writeUV(slot, uvXArr[eid]!, uvYArr[eid]!, uvWArr[eid]!, uvHArr[eid]!)

    // Per-instance shadow radius — either the sprite's explicit override
    // or auto-derived `max(|sx|, |sy|)` so the default tracks scale
    // changes (incl. AnimatedSprite2D frame-source-size swaps).
    // Consumed by shadow-casting LightEffects via `readShadowRadius()`.
    const override = sprite.shadowRadius
    let radius: number
    if (override !== undefined) {
      radius = override
    } else {
      const asx = sx < 0 ? -sx : sx
      const asy = sy < 0 ? -sy : sy
      radius = asx > asy ? asx : asy
    }
    mesh.writeShadowRadius(slot, radius)
  }
}
