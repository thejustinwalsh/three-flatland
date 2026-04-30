import { buildAtlasJson, readAnimationsFromJson } from './build'
import { packRects } from './maxrects'
import type {
  AnimationInput,
  AtlasJson,
  AtlasMergeMeta,
  RectInput,
} from './types'

// One source contributing frames + animations to the merged output.
// `renames` carries user-resolved name overrides for that source.
export type MergeSource = {
  uri: string
  alias: string
  json: AtlasJson
  renames: {
    frames?: Record<string, string>
    animations?: Record<string, string>
  }
}

export type MergeInput = {
  sources: ReadonlyArray<MergeSource>
  maxSize: number
  padding: number
  powerOfTwo: boolean
  outputFileName?: string
}

// A name collision across sources after applying per-source renames.
export type NameConflict = {
  name: string
  sources: Array<{ uri: string; alias: string; originalName: string }>
}

export type MergeResult =
  | {
      kind: 'ok'
      atlas: AtlasJson
      // For each source frame: where its rect ends up in the packed atlas.
      // Caller (the webview) uses this to composite the source pixels.
      placements: Array<{
        sourceUri: string
        sourceAlias: string
        sourceFrameName: string
        mergedFrameName: string
        srcRect: { x: number; y: number; w: number; h: number }
        dstRect: { x: number; y: number; w: number; h: number }
      }>
      utilization: number
    }
  | { kind: 'conflicts'; frameConflicts: NameConflict[]; animationConflicts: NameConflict[] }
  | { kind: 'nofit' }

export function computeMerge(input: MergeInput): MergeResult {
  // Phase 1: resolve final frame and animation names per source.
  type Resolved = {
    src: MergeSource
    frameNameMap: Map<string, string> // original → merged
    animMap: Map<string, { name: string; anim: AnimationInput }>
    // Pack order: animation frames first (in declaration/playback order),
    // then any frames not referenced by any animation.
    orderedMergedFrames: string[]
  }
  const resolved: Resolved[] = input.sources.map((src) => {
    const frameNameMap = new Map<string, string>()
    for (const original of Object.keys(src.json.frames)) {
      frameNameMap.set(original, src.renames.frames?.[original] ?? original)
    }
    const animsIn = readAnimationsFromJson(src.json)
    const animMap = new Map<string, { name: string; anim: AnimationInput }>()
    for (const [original, anim] of Object.entries(animsIn)) {
      const merged = src.renames.animations?.[original] ?? original
      // Rewrite the animation's frames[] list against the new frame names.
      const rewritten: AnimationInput = {
        ...anim,
        frames: anim.frames.map((n) => frameNameMap.get(n) ?? n),
      }
      animMap.set(original, { name: merged, anim: rewritten })
    }
    // Build pack order: animations first (declaration order, frames in
    // playback order), then unanimated leftovers.
    const orderedMergedFrames: string[] = []
    const seen = new Set<string>()
    for (const { anim } of animMap.values()) {
      for (const merged of anim.frames) {
        if (seen.has(merged)) continue
        seen.add(merged)
        orderedMergedFrames.push(merged)
      }
    }
    for (const merged of frameNameMap.values()) {
      if (seen.has(merged)) continue
      seen.add(merged)
      orderedMergedFrames.push(merged)
    }
    return { src, frameNameMap, animMap, orderedMergedFrames }
  })

  // Phase 2: detect conflicts.
  const frameOwners = new Map<string, Array<{ uri: string; alias: string; originalName: string }>>()
  for (const r of resolved) {
    for (const [original, merged] of r.frameNameMap) {
      const arr = frameOwners.get(merged) ?? []
      arr.push({ uri: r.src.uri, alias: r.src.alias, originalName: original })
      frameOwners.set(merged, arr)
    }
  }
  const animOwners = new Map<string, Array<{ uri: string; alias: string; originalName: string }>>()
  for (const r of resolved) {
    for (const [original, { name: merged }] of r.animMap) {
      const arr = animOwners.get(merged) ?? []
      arr.push({ uri: r.src.uri, alias: r.src.alias, originalName: original })
      animOwners.set(merged, arr)
    }
  }
  const frameConflicts: NameConflict[] = []
  for (const [name, owners] of frameOwners) {
    if (owners.length > 1) frameConflicts.push({ name, sources: owners })
  }
  const animationConflicts: NameConflict[] = []
  for (const [name, owners] of animOwners) {
    if (owners.length > 1) animationConflicts.push({ name, sources: owners })
  }
  if (frameConflicts.length > 0 || animationConflicts.length > 0) {
    return { kind: 'conflicts', frameConflicts, animationConflicts }
  }

  // Phase 3: collect rects to pack, ordered by animation membership for
  // spatial locality (frames from the same animation tend to pack near
  // each other; helps cache locality and visual coherence).
  const packInput: Array<{ id: string; w: number; h: number }> = []
  for (const r of resolved) {
    const mergedToOriginal = new Map<string, string>()
    for (const [original, merged] of r.frameNameMap) {
      mergedToOriginal.set(merged, original)
    }
    for (const merged of r.orderedMergedFrames) {
      const original = mergedToOriginal.get(merged)!
      const f = r.src.json.frames[original]!
      packInput.push({ id: merged, w: f.frame.w, h: f.frame.h })
    }
  }
  const packed = packRects({
    rects: packInput,
    maxSize: input.maxSize,
    padding: input.padding,
    powerOfTwo: input.powerOfTwo,
  })
  if (packed.kind === 'nofit') return { kind: 'nofit' }

  // Phase 4: build placements + merged rects.
  const placements: Array<{
    sourceUri: string
    sourceAlias: string
    sourceFrameName: string
    mergedFrameName: string
    srcRect: { x: number; y: number; w: number; h: number }
    dstRect: { x: number; y: number; w: number; h: number }
  }> = []
  const rects: RectInput[] = []
  for (const r of resolved) {
    const mergedToOriginal = new Map<string, string>()
    for (const [original, merged] of r.frameNameMap) {
      mergedToOriginal.set(merged, original)
    }
    for (const merged of r.orderedMergedFrames) {
      const original = mergedToOriginal.get(merged)!
      const f = r.src.json.frames[original]!
      const dst = packed.placements.get(merged)!
      placements.push({
        sourceUri: r.src.uri,
        sourceAlias: r.src.alias,
        sourceFrameName: original,
        mergedFrameName: merged,
        srcRect: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
        dstRect: dst,
      })
      rects.push({ id: merged, name: merged, x: dst.x, y: dst.y, w: dst.w, h: dst.h })
    }
  }

  // Phase 5: collect animations.
  const animations: Record<string, AnimationInput> = {}
  for (const r of resolved) {
    for (const { name, anim } of r.animMap.values()) {
      animations[name] = anim
    }
  }

  // Phase 6: build merge meta.
  const merge: AtlasMergeMeta = {
    version: '1',
    sources: resolved.map((r) => ({
      uri: r.src.uri,
      alias: r.src.alias,
      frames: r.frameNameMap.size,
      animations: r.animMap.size,
    })),
  }

  const atlas = buildAtlasJson({
    image: {
      fileName: input.outputFileName ?? 'merged.png',
      width: packed.size.w,
      height: packed.size.h,
    },
    rects,
    animations,
    merge,
  })

  return { kind: 'ok', atlas, placements, utilization: packed.utilization }
}

// Helper: derive an alias from a sidecar URI (filename minus .atlas.json).
export function aliasFromUri(uri: string): string {
  const last = uri.split('/').pop() ?? uri
  return last.replace(/\.atlas\.json$/, '')
}

// Helper: produce a per-source rename map that prefixes every frame and
// animation with `${alias}/`. Used by the "Namespace this source" bulk action.
export function namespaceSource(src: { json: AtlasJson; alias: string }): {
  frames: Record<string, string>
  animations: Record<string, string>
} {
  const frames: Record<string, string> = {}
  for (const name of Object.keys(src.json.frames)) {
    frames[name] = `${src.alias}/${name}`
  }
  const animations: Record<string, string> = {}
  const animsIn = readAnimationsFromJson(src.json)
  for (const name of Object.keys(animsIn)) {
    animations[name] = `${src.alias}/${name}`
  }
  return { frames, animations }
}
