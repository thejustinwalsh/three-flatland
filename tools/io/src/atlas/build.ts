import type {
  AnimationInput,
  AtlasJson,
  AtlasMergeMeta,
  RectInput,
  WireAnimation,
} from './types'

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
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
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
      console.warn(
        `Atlas: animation frame index ${idx} out of bounds for frameSet (length ${wire.frameSet.length})`
      )
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

export function importAsepriteFrameTags(
  json: AtlasJson
): Record<string, AnimationInput> {
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

export function readAnimationsFromJson(
  json: AtlasJson
): Record<string, AnimationInput> {
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
