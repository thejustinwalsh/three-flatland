import type { Texture } from 'three'
import type { SpriteFrame } from '../sprites/types'

/**
 * Mesh data an atlas contributes to the tight-mesh render path.
 * Registered per texture by the loaders; consumed at batch-creation
 * time to build per-batch envelope geometry (and, later, the per-frame
 * mesh table).
 *
 * Geometry itself is not duplicated here — each frame's polygon lives
 * on `frame.mesh` (verts/indices already local to that frame). The
 * registry only holds frame references, so merging entries from
 * multiple sheets sharing a texture can't leave a stale/dangling
 * concatenated array behind.
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
  /**
   * Monotonic counter bumped on every merge or degrade. A consumer that
   * only compares "registered or not" (a boolean) can't see a sheet
   * merging more frames into an already-registered texture, or a
   * `complete` flip — the registration was already present either way.
   * Comparing `version` against a previously-seen value catches CONTENT
   * changes a presence check misses, so batches built from a stale hull
   * know to rebuild. Loaders don't set this — the registry assigns it.
   */
  version: number
}

/** Loader-facing registration payload; the registry assigns `version`. */
export type AtlasMeshRegistration = Pick<AtlasMeshData, 'frames' | 'complete'>

/**
 * Texture → atlas mesh data. WeakMap so dropping the texture drops the
 * mesh data with it; module-level because the association is a property
 * of the texture itself, not of any world.
 */
const atlasMeshes = new WeakMap<Texture, AtlasMeshData>()

/**
 * Register an atlas's mesh data for its texture (loader-side).
 *
 * Re-registration for the same texture (two sheets sharing one image)
 * merges conservatively: frames accumulate, and `complete` stays true
 * only when both entries agree — the envelope degrades toward the
 * full quad the moment either sheet contributed a meshless frame.
 */
export function registerAtlasMesh(texture: Texture, data: AtlasMeshRegistration): void {
  const existing = atlasMeshes.get(texture)
  if (!existing) {
    atlasMeshes.set(texture, { ...data, version: 0 })
    return
  }
  const frames = [...existing.frames]
  for (const frame of data.frames) {
    if (!frames.includes(frame)) frames.push(frame)
  }
  atlasMeshes.set(texture, {
    frames,
    complete: existing.complete && data.complete,
    version: existing.version + 1,
  })
}

/**
 * A sheet WITHOUT mesh data loaded over a texture that has registered
 * polygons: its frames are unknown to the envelope, so the hull must
 * include the full quad corners from now on.
 */
export function degradeAtlasMesh(texture: Texture): void {
  const existing = atlasMeshes.get(texture)
  if (existing && existing.complete) {
    atlasMeshes.set(texture, { ...existing, complete: false, version: existing.version + 1 })
  }
}

/** Mesh data for a texture, when its atlas was baked with polygons. */
export function getAtlasMesh(texture: Texture | null): AtlasMeshData | null {
  if (!texture) return null
  return atlasMeshes.get(texture) ?? null
}
