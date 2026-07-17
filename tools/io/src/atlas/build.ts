import type { AnimationInput, AtlasJson, AtlasMergeMeta, RectInput, WireAnimation } from './types'

function formatFromFileName(name: string): 'png' | 'webp' | 'avif' | 'ktx2' {
  const lastDot = name.lastIndexOf('.')
  const ext = lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : ''
  if (ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'ktx2') return ext
  return 'png'
}

export function buildAtlasJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
  animations?: Record<string, AnimationInput>
  merge?: AtlasMergeMeta
}): AtlasJson {
  const frames: AtlasJson['frames'] = {}
  const used = new Set<string>()

  input.rects.forEach((r, i) => {
    const key = uniqueKey(r.name ?? `frame_${i}`, used)
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      ...baseFramePassthrough(r, { w: r.w, h: r.h }),
      // Native is our own superset — everything a rect carries is valid
      // here, unlike buildTexturePackerJson/buildAsepriteJson in
      // formats.ts, which only forward the subset their real format
      // understands (see baseFramePassthrough's doc comment).
      ...(r.duration !== undefined ? { duration: r.duration } : {}),
      ...(r.mesh ? { mesh: r.mesh } : {}),
      ...(r.vertices ? { vertices: r.vertices } : {}),
      ...(r.verticesUV ? { verticesUV: r.verticesUV } : {}),
      ...(r.triangles ? { triangles: r.triangles } : {}),
    }
  })

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
      sources: [{ format: formatFromFileName(input.image.fileName), uri: input.image.fileName }],
      size: { w: input.image.width, h: input.image.height },
      scale: '1',
      ...(Object.keys(animations).length > 0 ? { animations } : {}),
      ...(input.merge ? { merge: input.merge } : {}),
    },
    frames,
  }
}

// The Frame fields valid in ALL THREE formats — `rotated`/`trimmed`/
// `spriteSourceSize`/`sourceSize`/`pivot`. Everything else a `Frame` can
// carry is format-specific and must NOT be blindly forwarded: `duration`
// is Aseprite-only, `vertices`/`verticesUV`/`triangles` are
// TexturePacker-only, `mesh` is ours-only — a TexturePacker-loaded rect's
// `vertices` (or our own `mesh`) leaking into an Aseprite-format save (or
// vice versa) would produce a file that ISN'T a genuinely faithful
// export, which is exactly what the strict per-format schemas in
// packages/schemas/src/atlas exist to catch. `buildAtlasJson` (below) is
// the exception — it's our own superset, so it adds all of those back on
// top of this base. See `buildTexturePackerJson`/`buildAsepriteJson` in
// formats.ts for the other two.
//
// `rotated`/`trimmed`/`spriteSourceSize`/`sourceSize` are non-optional on
// the wire, so a rect that was ever loaded from a real atlas always
// carries real values for them; a freshly-packed rect (never
// round-tripped through `atlasToRects`) has them `undefined`, and this
// falls back to today's defaults (`rotated:false, trimmed:false,
// sourceSize:fullSize`) in that case.
export function baseFramePassthrough(
  r: Pick<RectInput, 'rotated' | 'trimmed' | 'spriteSourceSize' | 'sourceSize' | 'pivot'>,
  fallbackSize: { w: number; h: number }
): Pick<AtlasJson['frames'][string], 'rotated' | 'trimmed' | 'spriteSourceSize' | 'sourceSize' | 'pivot'> {
  return {
    rotated: r.rotated ?? false,
    trimmed: r.trimmed ?? false,
    spriteSourceSize: r.spriteSourceSize ?? { x: 0, y: 0, ...fallbackSize },
    sourceSize: r.sourceSize ?? fallbackSize,
    ...(r.pivot ? { pivot: r.pivot } : {}),
  }
}

export function atlasToRects(json: AtlasJson, idGen: () => string): RectInput[] {
  const out: RectInput[] = []
  for (const [name, frame] of Object.entries(json.frames)) {
    out.push({
      id: idGen(),
      x: frame.frame.x,
      y: frame.frame.y,
      w: frame.frame.w,
      h: frame.frame.h,
      name,
      rotated: frame.rotated,
      trimmed: frame.trimmed,
      spriteSourceSize: frame.spriteSourceSize,
      sourceSize: frame.sourceSize,
      ...(frame.pivot ? { pivot: frame.pivot } : {}),
      ...(frame.duration !== undefined ? { duration: frame.duration } : {}),
      ...(frame.mesh ? { mesh: frame.mesh } : {}),
      ...(frame.vertices ? { vertices: frame.vertices } : {}),
      ...(frame.verticesUV ? { verticesUV: frame.verticesUV } : {}),
      ...(frame.triangles ? { triangles: frame.triangles } : {}),
    })
  }
  return out
}

export function animationInputToWire(input: AnimationInput): WireAnimation {
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

export function wireAnimationToInput(wire: WireAnimation): AnimationInput {
  const frames: string[] = []
  for (const idx of wire.frames) {
    const name = wire.frameSet[idx]
    if (name == null) {
      console.warn(`Atlas: animation frame index ${idx} out of bounds for frameSet (length ${wire.frameSet.length})`)
      continue
    }
    frames.push(name)
  }
  // The schema makes fps/loop/pingPong optional on the wire — in-memory model
  // requires them, so default here. fps=12 matches the SpriteSheetLoader default.
  return {
    frames,
    fps: wire.fps ?? 12,
    loop: wire.loop ?? true,
    pingPong: wire.pingPong ?? false,
    ...(wire.events ? { events: wire.events } : {}),
  }
}

export function importAsepriteFrameTags(json: AtlasJson): Record<string, AnimationInput> {
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
      // Passthrough — carried through unedited so a save back to Aseprite's
      // format (formats.ts's animationInputToFrameTag) can reproduce the
      // exact same tag if this animation isn't touched. See AnimationInput's
      // doc comment in types.ts.
      ...(tag.direction ? { direction: tag.direction } : {}),
      ...(tag.color ? { color: tag.color } : {}),
      ...(tag.repeat ? { repeat: tag.repeat } : {}),
      ...(tag.data ? { data: tag.data } : {}),
    }
  }
  return out
}

export function uniqueKey(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  let i = 1
  while (used.has(`${candidate}_${i}`)) i++
  const key = `${candidate}_${i}`
  used.add(key)
  return key
}

export function readAnimationsFromJson(json: AtlasJson): Record<string, AnimationInput> {
  if (json.meta.animations && Object.keys(json.meta.animations).length > 0) {
    const out: Record<string, AnimationInput> = {}
    for (const [name, wire] of Object.entries(json.meta.animations)) {
      out[name] = wireAnimationToInput(wire)
    }
    return out
  }
  if (json.meta.frameTags && json.meta.frameTags.length > 0) {
    return importAsepriteFrameTags(json)
  }
  return {}
}
