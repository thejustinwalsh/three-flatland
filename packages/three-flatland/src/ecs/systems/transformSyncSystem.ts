import { getStore as kootaGetStore, type World, type Trait } from 'koota'
import {
  IsRenderable,
  IsBatched,
  ThreeRef,
  SpriteUV,
  SpriteLayer,
  SpriteZIndex,
  BatchSlot,
  BatchRegistry,
} from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'

// Koota entity bit-packing constants
const ENTITY_ID_MASK = (1 << 20) - 1

/** Resolve SoA store for a numeric trait — one lookup, reused for all entities. */
function getNumericStore(world: World, trait: Trait): Record<string, number[]> {
  return kootaGetStore(world, trait) as Record<string, number[]>
}

/**
 * Sync transforms and UVs from sprite Object3D properties directly to GPU
 * instance buffers.
 *
 * Bypasses both Three.js updateMatrix() (quaternion→matrix compose) and
 * Matrix4.toArray() (16-float copy) by writing the 2D transform straight
 * into the instanceMatrix Float32Array. For 20k sprites this eliminates
 * 640k redundant float writes per frame (20k × 32 → 20k × 16).
 *
 * Numeric trait reads (BatchSlot, SpriteLayer, SpriteZIndex, SpriteUV) use
 * direct SoA array access via koota's getStore() API, eliminating
 * entity.get() overhead (object allocation + accessor layer). ThreeRef uses
 * a factory initializer so its store layout differs — kept as entity.get().
 *
 * UV is folded in here because in a 2D game, UV manipulation (sprite frame
 * changes from animation) is part of the visual transform. Writing UVs
 * unconditionally avoids koota's change detection overhead.
 */
export function transformSyncSystem(world: World): void {
  const entities = world.query(IsRenderable, IsBatched, ThreeRef, BatchSlot)

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return
  const meshSlots = registry.batchSlots

  // Pre-resolve SoA stores once — reused for every entity in the loop.
  // Only numeric traits use SoA; ThreeRef (factory trait) uses entity.get().
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

    // BatchSlot — direct SoA read (no entity.get allocation)
    const batchIdx = batchIdxArr[eid]!
    if (batchIdx < 0) continue
    const slot = slotArr[eid]!

    const mesh = meshSlots[batchIdx] as SpriteBatch | undefined
    if (!mesh) continue

    // ThreeRef — factory trait, must use entity.get()
    const ref = entity.get(ThreeRef)
    if (!ref?.object) continue
    const obj = ref.object

    // Layer + zIndex — direct SoA read
    const layer = layerArr[eid]!
    const zIdx = zIndexArr[eid]!

    // Write 2D transform directly to instance buffer — no intermediate Matrix4
    const buf = mesh.instanceMatrix.array as Float32Array
    const o = slot * 16
    const px = obj.position.x
    const py = obj.position.y
    const pz = obj.position.z + layer * 10 + zIdx * 0.001
    const sx = obj.scale.x
    const sy = obj.scale.y

    const rz = obj.rotation.z
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

    // Mark matrix dirty for the slot we just wrote
    mesh.markMatrixDirty(slot)

    // UV — direct SoA read (brute-force; cheaper than change detection)
    mesh.writeUV(slot, uvXArr[eid]!, uvYArr[eid]!, uvWArr[eid]!, uvHArr[eid]!)
  }
}
