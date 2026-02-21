import { $internal, type World, type Trait } from 'koota'
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
const WORLD_ID_SHIFT = 28

/** Read a single SoA field directly — zero allocation, no Map lookup. */
function readStore(store: Record<string, number[]>, eid: number, field: string): number {
  return store[field]![eid]!
}

/** Resolve SoA store for a trait + world once, reuse across all entities. */
function getStore(trait: Trait, worldId: number): Record<string, number[]> {
  return trait[$internal].stores[worldId] as Record<string, number[]>
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
  const batchSlots = registry.batchSlots

  // Pre-resolve SoA stores for layer/zIndex — one Map lookup each, reused for all entities
  const firstEntity = entities[0]
  if (!firstEntity) return
  const worldId = (firstEntity as unknown as number) >>> WORLD_ID_SHIFT
  const layerStore = getStore(SpriteLayer, worldId)
  const zIndexStore = getStore(SpriteZIndex, worldId)

  const dirtyMeshes = new Set<SpriteBatch>()

  for (const entity of entities) {
    const bs = entity.get(BatchSlot)
    if (!bs || bs.batchIdx < 0) continue

    const mesh = batchSlots[bs.batchIdx]
    if (!mesh) continue

    const ref = entity.get(ThreeRef)
    if (!ref?.object) continue

    const obj = ref.object
    const eid = (entity as unknown as number) & ENTITY_ID_MASK

    // Read layer + zIndex directly from SoA stores (zero allocation)
    const layer = readStore(layerStore, eid, 'layer')
    const zIdx = readStore(zIndexStore, eid, 'zIndex')

    // Write 2D transform directly to instance buffer — no intermediate Matrix4
    const buf = mesh.instanceMatrix.array as Float32Array
    const o = bs.slot * 16
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

    // UV — always (brute-force; cheaper than change detection for animated sprites)
    const uv = entity.get(SpriteUV)
    if (uv) {
      mesh.writeUV(bs.slot, uv.x, uv.y, uv.w, uv.h)
    }

    dirtyMeshes.add(mesh)
  }

  for (const mesh of dirtyMeshes) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.getUVAttribute().needsUpdate = true
  }
}
