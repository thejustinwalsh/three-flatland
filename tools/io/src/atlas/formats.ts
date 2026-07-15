import { baseFramePassthrough, uniqueKey } from './build'
import type { AnimationInput, AsepriteFrameTag, AtlasJson, RectInput } from './types'

export type AtlasFormat = 'native' | 'texturepacker' | 'aseprite'

function hasPerFrameDuration(json: AtlasJson): boolean {
  return Object.values(json.frames).some((f) => typeof f.duration === 'number')
}

/**
 * Sniffs which tool produced an atlas JSON file, keyed primarily on
 * `meta.app` — our own writer always stamps `meta.app: 'fl-sprite-atlas'`
 * (see `buildAtlasJson`), so its absence means the file did NOT come from
 * this tool. A bare/minimal file with no `meta.app` at all is treated as
 * TexturePacker (the more permissive of the two foreign shapes) unless it
 * carries an Aseprite-only marker (`meta.frameTags` or a per-frame
 * `duration`) — we always annotate our own files, so an unannotated file
 * is never ours by definition.
 */
export function detectAtlasFormat(json: AtlasJson): AtlasFormat {
  const app = json.meta.app
  if (app === 'fl-sprite-atlas') return 'native'
  if (typeof app === 'string') {
    if (app.includes('aseprite.org')) return 'aseprite'
    if (app.includes('codeandweb.com')) return 'texturepacker'
  }
  if ((json.meta.frameTags && json.meta.frameTags.length > 0) || hasPerFrameDuration(json)) {
    return 'aseprite'
  }
  return 'texturepacker'
}

/**
 * TexturePacker's real JSON-Hash export shape: `meta.image` (not our
 * `meta.sources`), no `meta.animations`/`mesh`/`normal` — a real
 * TexturePacker/Pixi/Cocos consumer doesn't know what to do with those.
 * `meta.app` still identifies this tool as the file's real author (see
 * `detectAtlasFormat`'s doc comment) — format fidelity here is about
 * matching the structural shape a TexturePacker consumer expects, not
 * about spoofing which tool wrote the file. JSON-Hash only (not
 * JSON-Array) — matches what `AtlasJson.frames` already assumes
 * structurally and what `SpriteSheetLoader` reads.
 */
export function buildTexturePackerJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
}): AtlasJson {
  const frames: AtlasJson['frames'] = {}
  const used = new Set<string>()
  input.rects.forEach((r, i) => {
    const key = uniqueKey(r.name ?? `frame_${i}`, used)
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      ...baseFramePassthrough(r, { w: r.w, h: r.h }),
      // TexturePacker-only fields — never `duration` (Aseprite-only) or
      // `mesh` (ours-only). See baseFramePassthrough's doc comment.
      ...(r.vertices ? { vertices: r.vertices } : {}),
      ...(r.verticesUV ? { verticesUV: r.verticesUV } : {}),
      ...(r.triangles ? { triangles: r.triangles } : {}),
    }
  })
  return {
    meta: {
      app: 'fl-sprite-atlas',
      version: '1.0',
      image: input.image.fileName,
      size: { w: input.image.width, h: input.image.height },
      scale: '1',
    },
    frames,
  }
}

/**
 * Aseprite's real JSON export shape: `meta.image`, `meta.frameTags`
 * (not our `meta.animations`), per-frame `duration` — no our-only
 * extensions. See `buildTexturePackerJson`'s doc comment for the
 * `meta.app` reasoning (unchanged here).
 *
 * Not every `AnimationInput` can become an Aseprite tag: a tag is a
 * *contiguous range* of the atlas's own frame order plus a playback
 * direction — see `animationInputToFrameTag`. An animation whose frames
 * don't form such a range (e.g. hand-picked non-adjacent frames) is
 * skipped rather than emitted lossily or thrown on — this mirrors the
 * repo's established "resolve or refuse gracefully" posture for lossy
 * conversions (e.g. the CodeLens sidecar's unresolvable var-ref handling).
 */
export function buildAsepriteJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
  animations?: Record<string, AnimationInput>
}): AtlasJson {
  const frames: AtlasJson['frames'] = {}
  const used = new Set<string>()
  const orderedNames: string[] = []
  input.rects.forEach((r, i) => {
    const key = uniqueKey(r.name ?? `frame_${i}`, used)
    orderedNames.push(key)
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      ...baseFramePassthrough(r, { w: r.w, h: r.h }),
      // Preserves a loaded frame's own duration for a frame that isn't
      // covered by any animation tag below (an untagged frame can still
      // carry a real Aseprite duration). Never `vertices`/`verticesUV`/
      // `triangles` (TexturePacker-only) or `mesh` (ours-only).
      ...(r.duration !== undefined ? { duration: r.duration } : {}),
    }
  })

  const frameTags: AsepriteFrameTag[] = []
  if (input.animations) {
    for (const [name, a] of Object.entries(input.animations)) {
      const tag = animationInputToFrameTag(name, a, orderedNames)
      if (!tag) continue
      frameTags.push(tag)
      const durationMs = Math.max(1, Math.round(1000 / a.fps))
      for (let idx = tag.from; idx <= tag.to; idx++) {
        const frameName = orderedNames[idx]!
        frames[frameName]!.duration = durationMs
      }
    }
  }

  return {
    meta: {
      app: 'fl-sprite-atlas',
      version: '1.0',
      image: input.image.fileName,
      size: { w: input.image.width, h: input.image.height },
      scale: '1',
      ...(frameTags.length > 0 ? { frameTags } : {}),
    },
    frames,
  }
}

/**
 * The reverse of `importAsepriteFrameTags` (build.ts) — converts one
 * `AnimationInput` into an Aseprite `frameTags` entry, or `null` if it
 * can't be expressed that way. An Aseprite tag is fundamentally a
 * `[from, to]` INDEX RANGE into the atlas's own frame order plus a
 * direction (forward/reverse/pingpong/pingpong_reverse) — it can't encode
 * an arbitrary frame-name sequence the way our own `animations` can.
 *
 * `input.frames` is the "post-duplication" playback sequence (holds =
 * repeated consecutive names — see AnimationInput's doc comment in
 * types.ts); collapsing consecutive repeats recovers the underlying
 * one-way frame sequence, which must then match either the forward or
 * reversed slice of `orderedNames` between its lowest and highest index
 * for this to be expressible as a tag — pingPong bounces this same
 * one-way sequence at playback time (mirroring how `importAsepriteFrameTags`
 * reads pingpong tags), it does not add extra frames to `input.frames`.
 */
export function animationInputToFrameTag(
  name: string,
  input: AnimationInput,
  orderedNames: readonly string[]
): AsepriteFrameTag | null {
  const collapsed: string[] = []
  for (const n of input.frames) {
    if (collapsed[collapsed.length - 1] !== n) collapsed.push(n)
  }
  if (collapsed.length === 0) return null

  const indices = collapsed.map((n) => orderedNames.indexOf(n))
  if (indices.some((i) => i < 0)) return null
  const from = Math.min(...indices)
  const to = Math.max(...indices)
  if (to - from + 1 !== collapsed.length) return null // not contiguous

  const forwardSlice = orderedNames.slice(from, to + 1)
  const isForward = arraysEqual(collapsed, forwardSlice)
  const isReverse = !isForward && arraysEqual(collapsed, [...forwardSlice].reverse())
  if (!isForward && !isReverse) return null

  const direction: AsepriteFrameTag['direction'] = input.pingPong
    ? isReverse
      ? 'pingpong_reverse'
      : 'pingpong'
    : isReverse
      ? 'reverse'
      : 'forward'

  return {
    name,
    from,
    to,
    direction,
    ...(input.color ? { color: input.color } : {}),
    ...(input.repeat ? { repeat: input.repeat } : {}),
    ...(input.data ? { data: input.data } : {}),
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
