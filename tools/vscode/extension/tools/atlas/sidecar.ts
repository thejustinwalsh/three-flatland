import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { assertValidAtlas } from './validateAtlas'

/** Rect in image-pixel coords, as sent from the webview. */
export type RectInput = {
  id: string
  x: number
  y: number
  w: number
  h: number
  name?: string
}

/**
 * API shape used by builders + the atlas tool's in-memory model.
 * Frame names are post-duplication (holds = repeated names). The
 * sidecar's wire format is the indexed `WireAnimation` shape — the
 * writer converts on save and the reader converts on load, so this
 * shape is what every caller of `buildAtlasJson` /
 * `readAtlasSidecar` works with regardless of how the JSON happens
 * to encode the data on disk.
 */
export type AnimationInput = {
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

/**
 * Wire shape stored under `meta.animations[name]`. `frameSet` lists
 * the unique frame names referenced; `frames` is the playback
 * sequence as integer indices into `frameSet`. Repeated indices
 * encode hold counts. More compact than the flat-string-array form
 * for animations with held frames, and matches the integer-indexed
 * `events` keying for consistency.
 */
type WireAnimation = {
  frameSet: string[]
  frames: number[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

/**
 * Aseprite frame-tag (= named animation) shape. Aseprite stores tags
 * as integer ranges into the frames array; our reader normalizes
 * these into our `animations` map by looking up frame names by index.
 */
export type AsepriteFrameTag = {
  name: string
  from: number
  to: number
  /** Newer Aseprite versions use these direction labels. */
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'
  color?: string
  /** "" = infinite, "N" = repeat N times. Newer Aseprite. */
  repeat?: string
  data?: string
}

/**
 * SpriteSheetJSONHash shape (from `packages/three-flatland/src/sprites/
 * types.ts`) with all our additions under `meta`. The root keys are
 * `frames` + `meta` only — strict TP/Aseprite shape — so any TP- or
 * Aseprite-emitted file validates here, and any consumer of TP- or
 * Aseprite-shaped JSON can read our atlases (they'll just see the
 * frames + textures they know about, and ignore our richer
 * `meta.animations`).
 *
 * The sibling schema at `packages/three-flatland/src/sprites/
 * atlas.schema.json` validates this structure. `meta` is intentionally
 * loose (`additionalProperties: true`) so any future tool-specific
 * extension can land there without schema edits. Running ajv at save
 * time is cheap insurance: rects come from our own code, but the
 * schema is the publishable spec so a drift would silently break
 * downstream consumers.
 */
export type AtlasJson = {
  $schema?: string
  meta: {
    app: string
    version: string
    image: string
    size: { w: number; h: number }
    scale: string
    /**
     * Our richer animation map. Lives under `meta` so the root keys
     * stay TP/Aseprite-shaped (`frames` + `meta` only). Anyone with
     * a TP/Aseprite loader still reads our atlases; consumers that
     * want our animations look here. Wire shape (`WireAnimation`):
     * indexed for compactness — `frameSet` lists unique names,
     * `frames` is integer indices into `frameSet`. Use the
     * `AnimationInput` API at the boundary (builder + reader); they
     * convert.
     */
    animations?: Record<string, WireAnimation>
    /** Aseprite-emitted animation tags — surfaced for typed access by the importer. */
    frameTags?: readonly AsepriteFrameTag[]
    layers?: readonly unknown[]
    slices?: readonly unknown[]
    // `meta` is `additionalProperties: true`; further extensions land here.
  }
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      /**
       * Aseprite-only per-frame display time (ms). The reader uses it
       * to derive an animation's fps when only `meta.frameTags` is
       * present (no `meta.animations`). Our writer doesn't emit it
       * today — fps is captured per-animation, not per-frame.
       */
      duration?: number
    }
  >
}

export function buildAtlasJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
  /**
   * Optional animation map. Empty animations (no frames) are filtered
   * out before serialisation — Ajv's `frames` constraint requires at
   * least one entry, so a user mid-edit can save without an empty
   * in-progress anim blocking the write.
   */
  animations?: Record<string, AnimationInput>
}): AtlasJson {
  const frames: AtlasJson['frames'] = {}
  const used = new Set<string>()

  input.rects.forEach((r, i) => {
    const key = uniqueKey(r.name ?? `frame_${i}`, used)
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
    }
  })

  // Convert each name-based AnimationInput → indexed WireAnimation
  // for storage. Empty animations (no frames) are dropped — the
  // schema requires `frameSet` and `frames` non-empty, and a user
  // mid-edit shouldn't have an in-progress empty animation block
  // the save.
  const animations: Record<string, WireAnimation> = {}
  if (input.animations) {
    for (const [name, a] of Object.entries(input.animations)) {
      if (a.frames.length === 0) continue
      animations[name] = animationInputToWire(a)
    }
  }

  return {
    $schema: 'https://three-flatland.dev/schemas/atlas.v1.json',
    meta: {
      app: 'fl-sprite-atlas',
      version: '1.0',
      image: input.image.fileName,
      size: { w: input.image.width, h: input.image.height },
      scale: '1',
      ...(Object.keys(animations).length > 0 ? { animations } : {}),
    },
    frames,
  }
}

/**
 * Derive the sidecar URI from the image URI:
 *   /path/to/knight.png → /path/to/knight.atlas.json
 *
 * Explicitly uses `.atlas.json` not just `.json` so it doesn't collide
 * with arbitrary `knight.json` files the user might already have.
 */
export function sidecarUriForImage(imageUri: vscode.Uri): vscode.Uri {
  const path = imageUri.path
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : ''
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const dot = fileName.lastIndexOf('.')
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName
  const sidecar = `${dir}/${base}.atlas.json`
  return imageUri.with({ path: sidecar })
}

export async function writeAtlasSidecar(
  imageUri: vscode.Uri,
  json: AtlasJson
): Promise<vscode.Uri> {
  // Validate before writing so a schema-invalid blob never hits disk.
  // We control the build path so this should never throw in practice,
  // but it's cheap insurance if the shape ever drifts.
  assertValidAtlas(json)
  const uri = sidecarUriForImage(imageUri)
  const text = JSON.stringify(json, null, 2) + '\n'
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  return uri
}

/**
 * Try to read the sidecar for the given image. Returns `null` if no
 * sidecar exists yet (fresh atlas). Throws if the file exists but the
 * contents are malformed or fail schema validation — caller decides
 * whether to surface the error or fall back to empty.
 */
export type LoadedAtlas = {
  json: AtlasJson
  rects: RectInput[]
  animations: Record<string, AnimationInput>
}

export async function readAtlasSidecar(imageUri: vscode.Uri): Promise<LoadedAtlas | null> {
  const uri = sidecarUriForImage(imageUri)
  let bytes: Uint8Array
  try {
    bytes = await vscode.workspace.fs.readFile(uri)
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
      return null
    }
    throw err
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Atlas sidecar is not valid JSON: ${msg}`)
  }
  assertValidAtlas(parsed)
  // Animation source priority on read:
  //   1. `parsed.meta.animations` — our shape (the v1 location).
  //      Dereferenced from indexed wire format to flat name-based
  //      `AnimationInput` here so callers don't have to learn the
  //      indexed shape.
  //   2. `parsed.meta.frameTags` — Aseprite's animation tags;
  //      converted to our model so an Aseprite-exported atlas opens
  //      with named animations already populated.
  //   3. {} — no animations.
  // Step 2 is a normalization that's lossy where Aseprite's per-frame
  // durations vary inside a tag (collapsed to a single fps via median).
  let animations: Record<string, AnimationInput> = {}
  if (parsed.meta.animations && Object.keys(parsed.meta.animations).length > 0) {
    for (const [name, wire] of Object.entries(parsed.meta.animations)) {
      animations[name] = wireAnimationToInput(wire)
    }
  } else if (parsed.meta.frameTags && parsed.meta.frameTags.length > 0) {
    animations = importAsepriteFrameTags(parsed)
  }
  return {
    json: parsed,
    rects: atlasToRects(parsed),
    animations,
  }
}

/**
 * Convert the API `AnimationInput` (flat name-based frames sequence)
 * into the indexed wire `WireAnimation` (frameSet + indices). Builds
 * `frameSet` by walking `frames` in order and recording each new name
 * the first time it appears — preserves first-encounter order so the
 * resulting `frameSet` reads naturally in JSON.
 */
function animationInputToWire(input: AnimationInput): WireAnimation {
  const frameSet: string[] = []
  const indexByName = new Map<string, number>()
  const frames: number[] = []
  for (const name of input.frames) {
    let idx = indexByName.get(name)
    if (idx === undefined) {
      idx = frameSet.length
      frameSet.push(name)
      indexByName.set(name, idx)
    }
    frames.push(idx)
  }
  return {
    frameSet,
    frames,
    fps: input.fps,
    loop: input.loop,
    pingPong: input.pingPong,
    ...(input.events ? { events: input.events } : {}),
  }
}

/**
 * Convert the indexed wire shape back to a flat name-based
 * `AnimationInput`. Out-of-bounds indices are skipped with a console
 * warning — schema validation should catch these before they reach
 * here, but defending so a malformed file doesn't blow up the
 * reader entirely.
 */
function wireAnimationToInput(wire: WireAnimation): AnimationInput {
  const frames: string[] = []
  for (const idx of wire.frames) {
    const name = wire.frameSet[idx]
    if (name == null) {
      console.warn(`Atlas: animation frame index ${idx} out of bounds for frameSet (length ${wire.frameSet.length})`)
      continue
    }
    frames.push(name)
  }
  return {
    frames,
    fps: wire.fps,
    loop: wire.loop,
    pingPong: wire.pingPong,
    ...(wire.events ? { events: wire.events } : {}),
  }
}

/**
 * Convert Aseprite's `meta.frameTags` (ranges into the frames array)
 * into our `animations` map (named, frame-name based). Direction maps
 * to our `loop` / `pingPong` flags; reverse-mode tags physically
 * reverse the frame array on import. FPS is derived from the median
 * `frames[].duration` of the tagged frames — variable per-frame
 * timing within a tag is a lossy collapse, but Aseprite's typical
 * use case has uniform timing within a tag.
 */
function importAsepriteFrameTags(json: AtlasJson): Record<string, AnimationInput> {
  const frameNames = Object.keys(json.frames)
  const out: Record<string, AnimationInput> = {}
  const used = new Set<string>()
  for (const tag of json.meta.frameTags ?? []) {
    if (tag.from < 0 || tag.to >= frameNames.length || tag.from > tag.to) continue
    const slice = frameNames.slice(tag.from, tag.to + 1)
    if (slice.length === 0) continue
    const dir = tag.direction ?? 'forward'
    const reverseInPlace = dir === 'reverse' || dir === 'pingpong_reverse'
    const isPingPong = dir === 'pingpong' || dir === 'pingpong_reverse'
    const orderedFrames = reverseInPlace ? [...slice].reverse() : slice
    // Median of the per-frame durations inside the tag's range. Falls
    // back to 100ms (10 fps) when no frame carries a duration.
    const durations = slice
      .map((name) => json.frames[name]?.duration)
      .filter((d): d is number => typeof d === 'number' && d > 0)
      .sort((a, b) => a - b)
    const medianMs = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : 100
    const fps = Math.max(1, Math.round(1000 / medianMs))
    const name = uniqueKey(tag.name, used)
    out[name] = {
      frames: orderedFrames,
      fps,
      loop: true,
      pingPong: isPingPong,
    }
  }
  return out
}

/**
 * Project a validated AtlasJson back into the webview's RectInput[] model.
 * Frame keys become `name`; ids are freshly generated (sidecar has no
 * durable id concept). Future phases may preserve extra per-frame fields
 * we currently drop (pivot, rotated, trimmed, spriteSourceSize).
 */
export function atlasToRects(json: AtlasJson): RectInput[] {
  const out: RectInput[] = []
  for (const [name, frame] of Object.entries(json.frames)) {
    out.push({
      id: randomUUID(),
      x: frame.frame.x,
      y: frame.frame.y,
      w: frame.frame.w,
      h: frame.frame.h,
      name,
    })
  }
  return out
}

function uniqueKey(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  // Append a suffix on collisions so duplicate names don't clobber each
  // other in the hash-style frames dict.
  let i = 1
  while (used.has(`${candidate}_${i}`)) i++
  const key = `${candidate}_${i}`
  used.add(key)
  return key
}
