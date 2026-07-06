import type { Texture } from 'three'
import type { SpriteFrame } from '../sprites/types'

/**
 * Mesh data an atlas contributes to the tight-mesh render path.
 * Registered per texture by the loaders; consumed at batch-creation
 * time to build per-batch envelope geometry (and, later, the per-frame
 * mesh table).
 */
export interface AtlasMeshData {
  /** Frames that carry a polygon mesh. */
  frames: SpriteFrame[]
  /**
   * True when EVERY frame in the atlas carries a mesh. When false, the
   * per-batch envelope hull must include the full quad corners so
   * meshless frames still render un-clipped.
   */
  complete: boolean
  /** Concatenated [x,y,u,v] vertex data across those frames. */
  meshVerts: Float32Array
  /** Concatenated triangle indices (frame-local, see frame.mesh offsets). */
  meshIndices: Uint16Array
}

/**
 * Texture → atlas mesh data. WeakMap so dropping the texture drops the
 * mesh data with it; module-level because the association is a property
 * of the texture itself, not of any world.
 */
const atlasMeshes = new WeakMap<Texture, AtlasMeshData>()

/** Register an atlas's mesh data for its texture (loader-side). */
export function registerAtlasMesh(texture: Texture, data: AtlasMeshData): void {
  atlasMeshes.set(texture, data)
}

/** Mesh data for a texture, when its atlas was baked with polygons. */
export function getAtlasMesh(texture: Texture | null): AtlasMeshData | null {
  if (!texture) return null
  return atlasMeshes.get(texture) ?? null
}
