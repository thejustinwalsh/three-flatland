# Atlas Merge Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a VSCode tool that merges multiple `*.atlas.json` sources into one packed atlas (PNG + sidecar), with visual conflict resolution and a portable, vscode-free merge engine.

**Architecture:** Pure merge engine (`@three-flatland/io/atlas/{build,maxrects,merge}`) consumed by both the existing atlas tool and a new `tools/vscode/extension/tools/merge/` host plus `tools/vscode/webview/merge/` webview. Sources are loaded via the host bridge; packing and PNG composition run in the webview; saving goes back through the host with a save dialog.

**Tech Stack:** TypeScript, Vite (webview MPA, auto-discovers `webview/<tool>/`), tsup (`@three-flatland/io`), Vitest, React, StyleX, `@three-flatland/preview` (Viewport, RectOverlay, AnimationDrawer), `@three-flatland/bridge`, ajv (existing schema validation), VSCode webview API.

**Source spec:** `planning/superpowers/specs/2026-04-30-atlas-merge-design.md`

---

## File map

**New (pure):**
- `tools/io/src/atlas/types.ts`
- `tools/io/src/atlas/build.ts`
- `tools/io/src/atlas/maxrects.ts`
- `tools/io/src/atlas/maxrects.test.ts`
- `tools/io/src/atlas/merge.ts`
- `tools/io/src/atlas/merge.test.ts`
- `tools/io/src/atlas/index.ts`

**Modified:**
- `tools/io/package.json` — add `./atlas` subpath export
- `tools/io/tsup.config.ts` — add new entries
- `tools/io/src/index.ts` — re-export atlas namespace
- `tools/vscode/extension/tools/atlas/sidecar.ts` — thin wrapper around `@three-flatland/io/atlas`
- `tools/vscode/extension/index.ts` — register merge tool
- `tools/vscode/package.json` — `threeFlatland.merge.openMergeTool` command + menu

**New (vscode host):**
- `tools/vscode/extension/tools/merge/register.ts`
- `tools/vscode/extension/tools/merge/host.ts`

**New (webview):**
- `tools/vscode/webview/merge/index.html`
- `tools/vscode/webview/merge/main.tsx`
- `tools/vscode/webview/merge/App.tsx`
- `tools/vscode/webview/merge/mergeStore.ts`
- `tools/vscode/webview/merge/SourcesView.tsx`
- `tools/vscode/webview/merge/MergedView.tsx`
- `tools/vscode/webview/merge/ConflictsPanel.tsx`
- `tools/vscode/webview/merge/Toolbar.tsx`

---

## Task 1: Set up `@three-flatland/io/atlas` subpath

**Files:**
- Create: `tools/io/src/atlas/index.ts` (empty stub)
- Modify: `tools/io/package.json` — add `./atlas` export
- Modify: `tools/io/tsup.config.ts` — add atlas entry
- Modify: `tools/io/src/index.ts` — re-export

- [ ] **Step 1: Add the directory and stub**

Create `tools/io/src/atlas/index.ts` with:

```ts
// Pure, vscode-free atlas helpers. Both the VSCode atlas tool and the
// merge tool import from here; a future CLI binary wraps these too.
export {}
```

- [ ] **Step 2: Add subpath export to `tools/io/package.json`**

Inside the existing `"exports"` object, add a sibling to `"."`:

```json
    "./atlas": {
      "source": "./src/atlas/index.ts",
      "import": {
        "types": "./dist/atlas/index.d.ts",
        "default": "./dist/atlas/index.js"
      }
    }
```

- [ ] **Step 3: Add atlas entry to `tools/io/tsup.config.ts`**

Replace the `entry` array:

```ts
entry: ['src/index.ts', 'src/image.ts', 'src/atlas/index.ts'],
```

- [ ] **Step 4: Build the io package**

Run: `pnpm --filter @three-flatland/io build`
Expected: `tools/io/dist/atlas/index.js` and `index.d.ts` present.

- [ ] **Step 5: Commit**

```bash
git add tools/io/package.json tools/io/tsup.config.ts tools/io/src/atlas
git commit -m "feat(io): add @three-flatland/io/atlas subpath"
```

---

## Task 2: Move atlas types and pure builders into `io/atlas`

The existing `tools/vscode/extension/tools/atlas/sidecar.ts` mixes vscode I/O with pure JSON builders. Extract the pure parts.

**Files:**
- Create: `tools/io/src/atlas/types.ts`
- Create: `tools/io/src/atlas/build.ts`
- Modify: `tools/io/src/atlas/index.ts` — re-export

- [ ] **Step 1: Create `tools/io/src/atlas/types.ts`**

```ts
// Wire format stored under meta.animations[name]. frameSet lists unique
// frame names; frames is a playback sequence of integer indices into
// frameSet (repeated indices encode hold counts).
export type WireAnimation = {
  frameSet: string[]
  frames: number[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

// API shape used by builders + in-memory tool models. Frame names are
// post-duplication (holds = repeated names). Converters in build.ts
// translate to/from WireAnimation at the JSON boundary.
export type AnimationInput = {
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

export type RectInput = {
  id: string
  x: number
  y: number
  w: number
  h: number
  name?: string
}

export type AsepriteFrameTag = {
  name: string
  from: number
  to: number
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'
  color?: string
  repeat?: string
  data?: string
}

// Strict superset of TexturePacker JSON-Hash + Aseprite shapes — see
// packages/three-flatland/src/sprites/atlas.schema.json.
export type AtlasJson = {
  $schema?: string
  meta: {
    app: string
    version: string
    image: string
    size: { w: number; h: number }
    scale: string
    animations?: Record<string, WireAnimation>
    frameTags?: readonly AsepriteFrameTag[]
    layers?: readonly unknown[]
    slices?: readonly unknown[]
    merge?: AtlasMergeMeta
    [k: string]: unknown
  }
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      pivot?: { x: number; y: number }
      duration?: number
    }
  >
}

// Informational record of the sources a merged atlas was built from.
// Lives under meta because the existing schema's meta is
// additionalProperties: true.
export type AtlasMergeMeta = {
  version: '1'
  sources: Array<{
    uri: string
    alias: string
    frames: number
    animations: number
  }>
}
```

- [ ] **Step 2: Create `tools/io/src/atlas/build.ts`**

```ts
import type {
  AnimationInput,
  AtlasJson,
  AtlasMergeMeta,
  RectInput,
  WireAnimation,
} from './types'

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
      image: input.image.fileName,
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
```

- [ ] **Step 3: Update `tools/io/src/atlas/index.ts`**

```ts
export type {
  AnimationInput,
  AsepriteFrameTag,
  AtlasJson,
  AtlasMergeMeta,
  RectInput,
  WireAnimation,
} from './types'

export {
  animationInputToWire,
  atlasToRects,
  buildAtlasJson,
  importAsepriteFrameTags,
  readAnimationsFromJson,
  uniqueKey,
  wireAnimationToInput,
} from './build'
```

- [ ] **Step 4: Build and typecheck**

Run: `pnpm --filter @three-flatland/io build && pnpm --filter @three-flatland/io typecheck`
Expected: clean build, no type errors.

- [ ] **Step 5: Commit**

```bash
git add tools/io/src/atlas/
git commit -m "feat(io/atlas): extract pure types and builders"
```

---

## Task 3: Refactor `sidecar.ts` to consume `io/atlas`

The vscode-coupled sidecar reader/writer/uri-helper stay in the atlas tool; everything else delegates to `io/atlas`.

**Files:**
- Modify: `tools/vscode/extension/tools/atlas/sidecar.ts`
- Modify: `tools/vscode/extension/tools/atlas/validateAtlas.ts` (import path)

- [ ] **Step 1: Rewrite `sidecar.ts`**

Replace its entire contents with:

```ts
import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import {
  atlasToRects as atlasToRectsImpl,
  buildAtlasJson as buildAtlasJsonImpl,
  readAnimationsFromJson,
  type AnimationInput,
  type AtlasJson,
  type AtlasMergeMeta,
  type RectInput,
} from '@three-flatland/io/atlas'
import { assertValidAtlas } from './validateAtlas'

export type { AnimationInput, AtlasJson, RectInput }

export function buildAtlasJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
  animations?: Record<string, AnimationInput>
  merge?: AtlasMergeMeta
}): AtlasJson {
  return buildAtlasJsonImpl(input)
}

export function atlasToRects(json: AtlasJson): RectInput[] {
  return atlasToRectsImpl(json, () => randomUUID())
}

export function sidecarUriForImage(imageUri: vscode.Uri): vscode.Uri {
  const path = imageUri.path
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : ''
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const dot = fileName.lastIndexOf('.')
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName
  return imageUri.with({ path: `${dir}/${base}.atlas.json` })
}

export async function writeAtlasSidecar(
  imageUri: vscode.Uri,
  json: AtlasJson
): Promise<vscode.Uri> {
  assertValidAtlas(json)
  const uri = sidecarUriForImage(imageUri)
  const text = JSON.stringify(json, null, 2) + '\n'
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  return uri
}

export type LoadedAtlas = {
  json: AtlasJson
  rects: RectInput[]
  animations: Record<string, AnimationInput>
}

export async function readAtlasSidecar(
  imageUri: vscode.Uri
): Promise<LoadedAtlas | null> {
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
  return {
    json: parsed,
    rects: atlasToRects(parsed),
    animations: readAnimationsFromJson(parsed),
  }
}
```

- [ ] **Step 2: Confirm validateAtlas.ts import still resolves**

`validateAtlas.ts` imports `AtlasJson` from `./sidecar` — now re-exported above. No change required.

Run: `pnpm --filter @three-flatland/vscode typecheck`
Expected: clean typecheck.

- [ ] **Step 3: Smoke test the atlas tool**

Run: `pnpm --filter @three-flatland/vscode build`
Expected: clean build. Manual smoke test: open a `.png` with an existing sidecar in the atlas tool — frames + animations still load identically.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/extension/tools/atlas/sidecar.ts
git commit -m "refactor(atlas): delegate pure builders to @three-flatland/io/atlas"
```

---

## Task 4: MaxRects packer (TDD)

**Files:**
- Create: `tools/io/src/atlas/maxrects.ts`
- Create: `tools/io/src/atlas/maxrects.test.ts`

- [ ] **Step 1: Write the failing test**

`tools/io/src/atlas/maxrects.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { packRects, type PackInput } from './maxrects'

describe('packRects', () => {
  const rect = (id: string, w: number, h: number) => ({ id, w, h })

  it('packs a single rect at origin with padding offset', () => {
    const input: PackInput = {
      rects: [rect('a', 10, 10)],
      maxSize: 64,
      padding: 2,
      powerOfTwo: false,
    }
    const result = packRects(input)
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.placements.get('a')).toEqual({ x: 2, y: 2, w: 10, h: 10 })
    // 2 (left pad) + 10 + 2 (right pad) = 14, rounded up to multiple of 4 = 16
    expect(result.size).toEqual({ w: 16, h: 16 })
  })

  it('returns nofit when largest rect exceeds maxSize', () => {
    const result = packRects({
      rects: [rect('big', 100, 100)],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    expect(result.kind).toBe('nofit')
  })

  it('rounds output up to power of two when requested', () => {
    const result = packRects({
      rects: [rect('a', 10, 10)],
      maxSize: 64,
      padding: 0,
      powerOfTwo: true,
    })
    if (result.kind !== 'ok') throw new Error('expected ok')
    // 10x10 → next power of two ≥ 10 is 16
    expect(result.size).toEqual({ w: 16, h: 16 })
  })

  it('places non-overlapping rects with padding gutters', () => {
    const result = packRects({
      rects: [rect('a', 10, 10), rect('b', 10, 10)],
      maxSize: 64,
      padding: 2,
      powerOfTwo: false,
    })
    if (result.kind !== 'ok') throw new Error('expected ok')
    const a = result.placements.get('a')!
    const b = result.placements.get('b')!
    // Centers must be ≥ 10 + padding apart on at least one axis
    const dx = Math.abs(a.x - b.x)
    const dy = Math.abs(a.y - b.y)
    expect(dx >= 10 + 2 || dy >= 10 + 2).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tools/io/src/atlas/maxrects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the packer**

`tools/io/src/atlas/maxrects.ts`:

```ts
// MaxRects best-short-side-fit (BSSF), no rotation. Single-bin pack into
// a square output ≤ maxSize on each side. Output dimensions are rounded
// up to a multiple of 4 (BC/ETC2 block size); when powerOfTwo is true,
// rounded to the next power of two instead. Padding is applied as a
// gutter on every side of every rect AND as an outer margin.

export type PackInput = {
  rects: ReadonlyArray<{ id: string; w: number; h: number }>
  maxSize: number
  padding: number
  powerOfTwo: boolean
}

export type Placement = { x: number; y: number; w: number; h: number }

export type PackResult =
  | { kind: 'ok'; placements: Map<string, Placement>; size: { w: number; h: number }; utilization: number }
  | { kind: 'nofit' }

type FreeRect = { x: number; y: number; w: number; h: number }

export function packRects(input: PackInput): PackResult {
  const { maxSize, padding, powerOfTwo } = input
  // Inflate every rect by padding on right + bottom (left + top are
  // handled by leaving padding as outer margin / between-cells gutter).
  const inflated = input.rects.map((r) => ({
    id: r.id,
    w: r.w + padding,
    h: r.h + padding,
    rawW: r.w,
    rawH: r.h,
  }))
  // BSSF works best when the largest dimensions are placed first.
  inflated.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))

  const placements = new Map<string, Placement>()
  // Inner area is maxSize minus the outer padding margin on right + bottom.
  const inner = maxSize - padding
  const free: FreeRect[] = [{ x: padding, y: padding, w: inner, h: inner }]
  let usedW = 0
  let usedH = 0

  for (const r of inflated) {
    const fit = findBestNode(free, r.w, r.h)
    if (!fit) return { kind: 'nofit' }
    placements.set(r.id, { x: fit.x, y: fit.y, w: r.rawW, h: r.rawH })
    usedW = Math.max(usedW, fit.x + r.rawW + padding)
    usedH = Math.max(usedH, fit.y + r.rawH + padding)
    splitFree(free, fit, r.w, r.h)
    pruneFree(free)
  }

  const w = roundOutput(usedW, powerOfTwo)
  const h = roundOutput(usedH, powerOfTwo)
  if (w > maxSize || h > maxSize) return { kind: 'nofit' }
  const usedArea = inflated.reduce((s, r) => s + r.rawW * r.rawH, 0)
  return {
    kind: 'ok',
    placements,
    size: { w, h },
    utilization: usedArea / (w * h),
  }
}

function findBestNode(
  free: FreeRect[],
  w: number,
  h: number
): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null
  for (const f of free) {
    if (f.w < w || f.h < h) continue
    const leftoverShort = Math.min(f.w - w, f.h - h)
    if (best === null || leftoverShort < best.score) {
      best = { x: f.x, y: f.y, score: leftoverShort }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

function splitFree(free: FreeRect[], used: { x: number; y: number }, w: number, h: number): void {
  const ux = used.x
  const uy = used.y
  const ux2 = ux + w
  const uy2 = uy + h
  const next: FreeRect[] = []
  for (const f of free) {
    const fx2 = f.x + f.w
    const fy2 = f.y + f.h
    if (ux >= fx2 || ux2 <= f.x || uy >= fy2 || uy2 <= f.y) {
      next.push(f)
      continue
    }
    if (ux > f.x) next.push({ x: f.x, y: f.y, w: ux - f.x, h: f.h })
    if (ux2 < fx2) next.push({ x: ux2, y: f.y, w: fx2 - ux2, h: f.h })
    if (uy > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: uy - f.y })
    if (uy2 < fy2) next.push({ x: f.x, y: uy2, w: f.w, h: fy2 - uy2 })
  }
  free.length = 0
  free.push(...next)
}

function pruneFree(free: FreeRect[]): void {
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (contains(free[j]!, free[i]!)) {
        free.splice(i, 1)
        i--
        break
      }
      if (contains(free[i]!, free[j]!)) {
        free.splice(j, 1)
        j--
      }
    }
  }
}

function contains(a: FreeRect, b: FreeRect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h
}

function roundOutput(n: number, powerOfTwo: boolean): number {
  if (powerOfTwo) {
    let p = 1
    while (p < n) p *= 2
    return p
  }
  return Math.ceil(n / 4) * 4
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `pnpm vitest run tools/io/src/atlas/maxrects.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Re-export from `io/atlas/index.ts`**

Append to the existing `index.ts`:

```ts
export { packRects, type PackInput, type PackResult, type Placement } from './maxrects'
```

- [ ] **Step 6: Build io and commit**

Run: `pnpm --filter @three-flatland/io build`

```bash
git add tools/io/src/atlas/maxrects.ts tools/io/src/atlas/maxrects.test.ts tools/io/src/atlas/index.ts
git commit -m "feat(io/atlas): MaxRects-BSSF packer"
```

---

## Task 5: Merge orchestrator (TDD)

**Files:**
- Create: `tools/io/src/atlas/merge.ts`
- Create: `tools/io/src/atlas/merge.test.ts`

- [ ] **Step 1: Write failing tests**

`tools/io/src/atlas/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AtlasJson } from './types'
import { computeMerge, type MergeSource } from './merge'

function makeSource(alias: string, frames: Record<string, [number, number, number, number]>): MergeSource {
  const json: AtlasJson = {
    meta: { app: 'x', version: '1', image: `${alias}.png`, size: { w: 64, h: 64 }, scale: '1' },
    frames: Object.fromEntries(
      Object.entries(frames).map(([n, [x, y, w, h]]) => [
        n,
        {
          frame: { x, y, w, h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w, h },
          sourceSize: { w, h },
        },
      ])
    ),
  }
  return { uri: `file:///${alias}.atlas.json`, alias, json, renames: {} }
}

describe('computeMerge', () => {
  it('passes unique frame names through unchanged', () => {
    const r = computeMerge({
      sources: [
        makeSource('knight', { hand: [0, 0, 8, 8] }),
        makeSource('goblin', { foot: [0, 0, 8, 8] }),
      ],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(Object.keys(r.atlas.frames).sort()).toEqual(['foot', 'hand'])
  })

  it('detects frame name conflicts and reports them', () => {
    const r = computeMerge({
      sources: [
        makeSource('knight', { idle_0: [0, 0, 8, 8] }),
        makeSource('goblin', { idle_0: [0, 0, 8, 8] }),
      ],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    expect(r.kind).toBe('conflicts')
    if (r.kind !== 'conflicts') throw new Error()
    expect(r.frameConflicts).toHaveLength(1)
    expect(r.frameConflicts[0]!.name).toBe('idle_0')
    expect(r.frameConflicts[0]!.sources.map((s) => s.alias).sort()).toEqual(['goblin', 'knight'])
  })

  it('applies a per-source rename to resolve a conflict', () => {
    const knight = makeSource('knight', { idle_0: [0, 0, 8, 8] })
    const goblin = makeSource('goblin', { idle_0: [0, 0, 8, 8] })
    knight.renames = { frames: { idle_0: 'knight/idle_0' } }
    const r = computeMerge({
      sources: [knight, goblin],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(Object.keys(r.atlas.frames).sort()).toEqual(['idle_0', 'knight/idle_0'])
  })

  it('rewrites animation frame references when frames are renamed', () => {
    const src: MergeSource = {
      uri: 'file:///a.atlas.json',
      alias: 'a',
      json: {
        meta: {
          app: 'x',
          version: '1',
          image: 'a.png',
          size: { w: 64, h: 64 },
          scale: '1',
          animations: {
            walk: { frameSet: ['idle_0'], frames: [0], fps: 12, loop: true, pingPong: false },
          },
        },
        frames: {
          idle_0: {
            frame: { x: 0, y: 0, w: 8, h: 8 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
            sourceSize: { w: 8, h: 8 },
          },
        },
      },
      renames: { frames: { idle_0: 'a/idle_0' } },
    }
    const r = computeMerge({ sources: [src], maxSize: 64, padding: 0, powerOfTwo: false })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.atlas.meta.animations!.walk!.frameSet).toEqual(['a/idle_0'])
  })

  it('records merge sources in meta.merge.sources', () => {
    const r = computeMerge({
      sources: [makeSource('knight', { hand: [0, 0, 8, 8] })],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.atlas.meta.merge?.sources[0]).toMatchObject({ alias: 'knight', frames: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tools/io/src/atlas/merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the merge orchestrator**

`tools/io/src/atlas/merge.ts`:

```ts
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
    return { src, frameNameMap, animMap }
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

  // Phase 3: collect rects to pack. id = mergedFrameName.
  const packInput: Array<{ id: string; w: number; h: number }> = []
  for (const r of resolved) {
    for (const [original, merged] of r.frameNameMap) {
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
    for (const [original, merged] of r.frameNameMap) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tools/io/src/atlas/merge.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Re-export from `io/atlas/index.ts`**

Append:

```ts
export {
  aliasFromUri,
  computeMerge,
  namespaceSource,
  type MergeInput,
  type MergeResult,
  type MergeSource,
  type NameConflict,
} from './merge'
```

- [ ] **Step 6: Build io and commit**

Run: `pnpm --filter @three-flatland/io build`

```bash
git add tools/io/src/atlas/merge.ts tools/io/src/atlas/merge.test.ts tools/io/src/atlas/index.ts
git commit -m "feat(io/atlas): merge orchestrator with conflict detection"
```

---

## Task 6: Register merge command + multi-select handler (placeholder webview)

**Files:**
- Create: `tools/vscode/extension/tools/merge/register.ts`
- Create: `tools/vscode/extension/tools/merge/host.ts`
- Modify: `tools/vscode/extension/index.ts`
- Modify: `tools/vscode/package.json`

- [ ] **Step 1: Add command and menu contributions**

Edit `tools/vscode/package.json`. Inside `contributes.commands`, append:

```json
      ,{
        "command": "threeFlatland.merge.openMergeTool",
        "title": "Merge atlases…",
        "category": "FL"
      }
```

Inside `contributes.menus.explorer/context`, append a sibling entry:

```json
        ,{
          "command": "threeFlatland.merge.openMergeTool",
          "when": "resourceFilename =~ /\\.atlas\\.json$/",
          "group": "navigation@11"
        }
```

Inside `contributes.menus.commandPalette`, append:

```json
        ,{
          "command": "threeFlatland.merge.openMergeTool",
          "when": "resourceFilename =~ /\\.atlas\\.json$/"
        }
```

- [ ] **Step 2: Create `tools/vscode/extension/tools/merge/host.ts` (panel + bridge skeleton)**

```ts
import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'merge'

export async function openMergePanel(
  context: vscode.ExtensionContext,
  sidecarUris: vscode.Uri[]
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.merge',
    `Merge: ${sidecarUris.map((u) => labelFor(u)).join(', ')}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ...sidecarUris.map((u) => vscode.Uri.joinPath(u, '..')),
      ],
    }
  )

  const renderHtml = async () =>
    composeToolHtml({
      webview: panel.webview,
      tool: TOOL,
      extensionUri: context.extensionUri,
      injectCode: '',
    })
  panel.webview.html = await renderHtml()

  const bridge = createHostBridge(panel.webview)

  bridge.on('merge/ready', async () => {
    log(`merge/ready (sources=${sidecarUris.length})`)
    bridge.emit('merge/init', {
      sources: sidecarUris.map((u) => ({ uri: u.toString() })),
    })
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })
  const disposeReload = setupDevReload(context.extensionUri, TOOL, () => {
    bridge.emit('dev/reload', { tool: TOOL })
  })

  panel.onDidDispose(() => {
    disposeReload.dispose()
    bridge.dispose()
  })
}

function labelFor(uri: vscode.Uri): string {
  const name = uri.path.split('/').pop() ?? uri.fsPath
  return name.replace(/\.atlas\.json$/, '')
}
```

- [ ] **Step 3: Create `tools/vscode/extension/tools/merge/register.ts`**

```ts
import * as vscode from 'vscode'
import { openMergePanel } from './host'

export function registerMergeTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.merge.openMergeTool',
      // VSCode multi-select passes (clickedUri, allSelectedUris).
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        const uris = (allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : [])
          .filter((u) => u.path.endsWith('.atlas.json'))
        if (uris.length === 0) {
          void vscode.window.showErrorMessage(
            'FL Merge: select one or more .atlas.json files first.'
          )
          return
        }
        await openMergePanel(context, uris)
      }
    )
  )
}
```

- [ ] **Step 4: Wire into the extension entry**

Edit `tools/vscode/extension/index.ts`:

```ts
import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { getChannel, log } from './log'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(getChannel())
  log('activate: @three-flatland/vscode')
  registerAtlasTool(context)
  registerMergeTool(context)
  log(`activate: extensionUri = ${context.extensionUri.fsPath}`)
}

export function deactivate(): void {
  log('deactivate')
}
```

- [ ] **Step 5: Build the host (note: webview not yet present, so `composeToolHtml` returns the missing-bundle placeholder)**

Run: `pnpm --filter @three-flatland/vscode run build:host`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add tools/vscode/extension/tools/merge tools/vscode/extension/index.ts tools/vscode/package.json
git commit -m "feat(merge): register VSCode command + multi-select handler"
```

---

## Task 7: Webview shell (`webview/merge/`)

The Vite config auto-discovers `webview/<tool>/index.html` — adding the directory is enough for the build to pick it up.

**Files:**
- Create: `tools/vscode/webview/merge/index.html`
- Create: `tools/vscode/webview/merge/main.tsx`
- Create: `tools/vscode/webview/merge/App.tsx`

- [ ] **Step 1: Create `index.html`**

Copy `tools/vscode/webview/atlas/index.html` to `tools/vscode/webview/merge/index.html`, changing the `<title>` to `FL Atlas Merge`.

- [ ] **Step 2: Create `main.tsx`**

```tsx
import '../styles.css'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
;(globalThis as unknown as { __vscodeElements_disableRegistryWarning__?: boolean })
  .__vscodeElements_disableRegistryWarning__ = true
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
import '@vscode/codicons/dist/codicon.css'
import { App } from './App'

function tagCodiconStylesheet() {
  if (document.getElementById('vscode-codicon-stylesheet')) return
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
  if (link) link.id = 'vscode-codicon-stylesheet'
}
tagCodiconStylesheet()

let vscodeApi: ReturnType<typeof getVSCodeApi> | null = null
try {
  vscodeApi = getVSCodeApi()
} catch {}

function send(level: string, args: unknown[]) {
  vscodeApi?.postMessage({
    kind: 'request',
    id: `log-${Math.random().toString(36).slice(2)}`,
    method: 'client/log',
    params: { level, args },
  })
}
window.addEventListener('error', (e) =>
  send('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`])
)
window.addEventListener('unhandledrejection', (e) =>
  send('unhandledrejection', [String(e.reason)])
)
send('info', ['merge webview boot'])

try {
  const bridge = createClientBridge()
  bridge.on('dev/reload', () => window.dispatchEvent(new Event('fl:dev-changed')))
  window.addEventListener('fl:reload-request', () => {
    void bridge.request('dev/reload-request')
  })
} catch {}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <Suspense fallback={<vscode-progress-ring />}>
      <App />
    </Suspense>
  </StrictMode>
)
```

- [ ] **Step 3: Create stub `App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'

export function App(): JSX.Element {
  const [sources, setSources] = useState<{ uri: string }[]>([])
  useEffect(() => {
    const bridge = createClientBridge()
    bridge.on<{ sources: { uri: string }[] }>('merge/init', (params) => {
      setSources(params.sources)
      return { ok: true }
    })
    void bridge.request('merge/ready')
    return () => bridge.dispose()
  }, [])
  return (
    <div style={{ padding: 16 }}>
      <h2>FL Atlas Merge</h2>
      <p>Sources:</p>
      <ul>
        {sources.map((s) => (
          <li key={s.uri}>{s.uri}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Build webview and verify the panel opens**

Run: `pnpm --filter @three-flatland/vscode build`
Expected: `dist/webview/merge/index.html` produced.

Manual smoke: launch the extension dev host (F5), multi-select two `.atlas.json` files in the Explorer, right-click → **Merge atlases…**. Webview shows the source URIs.

- [ ] **Step 5: Commit**

```bash
git add tools/vscode/webview/merge
git commit -m "feat(merge): webview shell with bridge + source list stub"
```

---

## Task 8: Bridge protocol — host loads parsed source atlases

Currently the host only sends URIs. Read each sidecar, validate, and ship the parsed `AtlasJson` plus the image's `webview` URI to the webview.

**Files:**
- Modify: `tools/vscode/extension/tools/merge/host.ts`

- [ ] **Step 1: Update host to parse and validate sources before emitting `merge/init`**

Replace the body of the `bridge.on('merge/ready', …)` handler with:

```ts
  bridge.on('merge/ready', async () => {
    log(`merge/ready (sources=${sidecarUris.length})`)
    const sources: Array<{
      uri: string
      imageUri: string
      alias: string
      json: unknown
    }> = []
    const errors: Array<{ uri: string; message: string }> = []
    for (const sidecar of sidecarUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(sidecar)
        const text = new TextDecoder('utf-8').decode(bytes)
        const json = JSON.parse(text) as { meta?: { image?: string } }
        const metaImage = json?.meta?.image
        if (typeof metaImage !== 'string' || metaImage.length === 0) {
          throw new Error('meta.image missing')
        }
        const imageUri = vscode.Uri.joinPath(sidecar, '..', metaImage)
        sources.push({
          uri: sidecar.toString(),
          imageUri: panel.webview.asWebviewUri(imageUri).toString(),
          alias: labelFor(sidecar),
          json,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ uri: sidecar.toString(), message })
      }
    }
    bridge.emit('merge/init', { sources, errors })
    return { ok: true }
  })
```

- [ ] **Step 2: Update App.tsx to consume the richer payload**

Replace the `useEffect` body in `App.tsx`:

```tsx
    bridge.on<{
      sources: Array<{ uri: string; imageUri: string; alias: string; json: unknown }>
      errors: Array<{ uri: string; message: string }>
    }>('merge/init', (params) => {
      setSources(params.sources as never)
      if (params.errors.length > 0) {
        console.warn('merge/init errors:', params.errors)
      }
      return { ok: true }
    })
```

(Adjust the `useState` type to match.)

- [ ] **Step 3: Build + smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Smoke: open the merge tool — see source aliases listed.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/extension/tools/merge/host.ts tools/vscode/webview/merge/App.tsx
git commit -m "feat(merge): host parses + ships AtlasJson sources to webview"
```

---

## Task 9: `mergeStore` — state, derived merge, schema validation

Use a plain Zustand-style store (no dependency added — implement with `useSyncExternalStore`).

**Files:**
- Create: `tools/vscode/webview/merge/mergeStore.ts`

- [ ] **Step 1: Create the store**

```ts
import { useSyncExternalStore } from 'react'
import { computeMerge, type MergeResult, type MergeSource } from '@three-flatland/io/atlas'
import type { AtlasJson } from '@three-flatland/io/atlas'

// All state the webview needs. Derived merge result is recomputed on
// any change.
export type MergeState = {
  sources: Array<{
    uri: string
    imageUri: string
    alias: string
    json: AtlasJson
    renames: { frames?: Record<string, string>; animations?: Record<string, string> }
  }>
  knobs: { maxSize: number; padding: number; powerOfTwo: boolean }
  outputFileName: string
  // Derived (cached on each setState).
  result: MergeResult
}

const listeners = new Set<() => void>()
let state: MergeState = {
  sources: [],
  knobs: { maxSize: 4096, padding: 2, powerOfTwo: false },
  outputFileName: 'merged.png',
  result: { kind: 'ok', atlas: emptyAtlas(), placements: [], utilization: 0 },
}

function emptyAtlas(): AtlasJson {
  return {
    meta: { app: 'fl-sprite-atlas', version: '1.0', image: 'merged.png', size: { w: 0, h: 0 }, scale: '1' },
    frames: {},
  }
}

function derive(next: MergeState): MergeState {
  const sources: MergeSource[] = next.sources.map((s) => ({
    uri: s.uri,
    alias: s.alias,
    json: s.json,
    renames: s.renames,
  }))
  const result = computeMerge({ ...next.knobs, sources, outputFileName: next.outputFileName })
  return { ...next, result }
}

export function setMergeState(updater: (s: MergeState) => MergeState): void {
  state = derive(updater(state))
  listeners.forEach((l) => l())
}

export function useMergeState(): MergeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state
  )
}

// Convenience setters used by the UI.
export const mergeActions = {
  setSources(sources: MergeState['sources']): void {
    setMergeState((s) => ({ ...s, sources }))
  },
  setAlias(uri: string, alias: string): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => (src.uri === uri ? { ...src, alias } : src)),
    }))
  },
  setFrameRename(uri: string, original: string, merged: string | null): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => {
        if (src.uri !== uri) return src
        const next = { ...(src.renames.frames ?? {}) }
        if (merged === null) delete next[original]
        else next[original] = merged
        return { ...src, renames: { ...src.renames, frames: next } }
      }),
    }))
  },
  setAnimRename(uri: string, original: string, merged: string | null): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => {
        if (src.uri !== uri) return src
        const next = { ...(src.renames.animations ?? {}) }
        if (merged === null) delete next[original]
        else next[original] = merged
        return { ...src, renames: { ...src.renames, animations: next } }
      }),
    }))
  },
  setKnobs(knobs: Partial<MergeState['knobs']>): void {
    setMergeState((s) => ({ ...s, knobs: { ...s.knobs, ...knobs } }))
  },
  setOutputFileName(name: string): void {
    setMergeState((s) => ({ ...s, outputFileName: name }))
  },
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @three-flatland/vscode typecheck`
Expected: clean (the store is unused yet — TypeScript ESM module imports are evaluated lazily, so the unused import block is fine).

- [ ] **Step 3: Commit**

```bash
git add tools/vscode/webview/merge/mergeStore.ts
git commit -m "feat(merge): mergeStore with derived result"
```

---

## Task 10: Wire the store to the bridge; add the basic Sources / Merged tab shell

**Files:**
- Modify: `tools/vscode/webview/merge/App.tsx`

- [ ] **Step 1: Replace `App.tsx` with the tab shell**

```tsx
import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import type { AtlasJson } from '@three-flatland/io/atlas'
import { aliasFromUri } from '@three-flatland/io/atlas'
import { mergeActions, useMergeState } from './mergeStore'
import { SourcesView } from './SourcesView'
import { MergedView } from './MergedView'

type Tab = 'sources' | 'merged'

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('sources')
  const state = useMergeState()
  useEffect(() => {
    const bridge = createClientBridge()
    bridge.on<{
      sources: Array<{ uri: string; imageUri: string; alias: string; json: AtlasJson }>
      errors: Array<{ uri: string; message: string }>
    }>('merge/init', (p) => {
      mergeActions.setSources(
        p.sources.map((s) => ({
          uri: s.uri,
          imageUri: s.imageUri,
          alias: s.alias || aliasFromUri(s.uri),
          json: s.json,
          renames: {},
        }))
      )
      return { ok: true }
    })
    void bridge.request('merge/ready')
    return () => bridge.dispose()
  }, [])

  const conflictCount =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <TabButton active={tab === 'sources'} onClick={() => setTab('sources')} label={`Sources${conflictCount > 0 ? ` (${conflictCount})` : ''}`} />
        <TabButton active={tab === 'merged'} onClick={() => setTab('merged')} label="Merged" />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'sources' ? <SourcesView /> : <MergedView />}
      </div>
    </div>
  )
}

function TabButton(p: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      onClick={p.onClick}
      style={{
        background: p.active ? 'var(--vscode-tab-activeBackground)' : 'transparent',
        color: 'var(--vscode-tab-activeForeground)',
        border: 'none',
        borderBottom: p.active ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
        padding: '8px 14px',
        cursor: 'pointer',
      }}
    >
      {p.label}
    </button>
  )
}
```

- [ ] **Step 2: Create stub `SourcesView.tsx` and `MergedView.tsx`**

`SourcesView.tsx`:

```tsx
import { useMergeState } from './mergeStore'

export function SourcesView(): JSX.Element {
  const { sources } = useMergeState()
  return (
    <div style={{ padding: 12 }}>
      {sources.map((s) => (
        <div key={s.uri}>
          {s.alias} — {Object.keys(s.json.frames).length} frames
        </div>
      ))}
    </div>
  )
}
```

`MergedView.tsx`:

```tsx
import { useMergeState } from './mergeStore'

export function MergedView(): JSX.Element {
  const { result } = useMergeState()
  return <pre style={{ padding: 12, fontSize: 11 }}>{JSON.stringify(result, null, 2)}</pre>
}
```

- [ ] **Step 3: Build, smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Smoke: tabs render; Sources lists aliases; Merged shows JSON-dumped result.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/merge
git commit -m "feat(merge): tab shell + store/bridge wiring"
```

---

## Task 11: Sources view — artboard canvas with rect overlays

Render each source image at a tiled position on a single pannable SVG/HTML viewport, with rects overlaid. Reuse `Viewport` and `RectOverlay` from `@three-flatland/preview`.

**Files:**
- Modify: `tools/vscode/webview/merge/SourcesView.tsx`

- [ ] **Step 1: Implement the artboards canvas**

```tsx
import { useMemo } from 'react'
import { Viewport, RectOverlay, type Rect } from '@three-flatland/preview'
import { useMergeState } from './mergeStore'

const ARTBOARD_GAP = 32

type Layout = {
  x: number
  y: number
  w: number
  h: number
  src: ReturnType<typeof useMergeState>['sources'][number]
}

function layoutArtboards(sources: ReturnType<typeof useMergeState>['sources']): {
  boards: Layout[]
  total: { w: number; h: number }
} {
  // Simple flow layout: place artboards left-to-right, wrapping when the
  // running width would exceed ~2 * average source width. Good enough for
  // v1 — replace with bin-packing later if we want denser layouts.
  if (sources.length === 0) return { boards: [], total: { w: 0, h: 0 } }
  const widths = sources.map((s) => s.json.meta.size.w)
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length
  const wrapWidth = Math.max(avg * 2, ...widths)
  const boards: Layout[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const src of sources) {
    const w = src.json.meta.size.w
    const h = src.json.meta.size.h
    if (x + w > wrapWidth && x > 0) {
      x = 0
      y += rowH + ARTBOARD_GAP
      rowH = 0
    }
    boards.push({ x, y, w, h, src })
    x += w + ARTBOARD_GAP
    rowH = Math.max(rowH, h)
  }
  const total = {
    w: Math.max(...boards.map((b) => b.x + b.w)),
    h: Math.max(...boards.map((b) => b.y + b.h)),
  }
  return { boards, total }
}

export function SourcesView(): JSX.Element {
  const { sources, result } = useMergeState()
  const { boards, total } = useMemo(() => layoutArtboards(sources), [sources])

  // Build a Set of "<sourceUri>::<originalFrameName>" strings that are in conflict
  // so the overlay can red-ring them.
  const conflictSet = useMemo(() => {
    const s = new Set<string>()
    if (result.kind === 'conflicts') {
      for (const c of result.frameConflicts) {
        for (const owner of c.sources) s.add(`${owner.uri}::${owner.originalName}`)
      }
    }
    return s
  }, [result])

  if (boards.length === 0) {
    return <div style={{ padding: 12 }}>No sources loaded.</div>
  }

  return (
    <Viewport viewBox={{ x: 0, y: 0, w: total.w, h: total.h }} style={{ width: '100%', height: '100%' }}>
      {boards.map((b) => (
        <g key={b.src.uri} transform={`translate(${b.x} ${b.y})`}>
          <image href={b.src.imageUri} x={0} y={0} width={b.w} height={b.h} />
          <RectOverlay
            rects={Object.entries(b.src.json.frames).map(([name, f]) => ({
              id: `${b.src.uri}::${name}`,
              x: f.frame.x,
              y: f.frame.y,
              w: f.frame.w,
              h: f.frame.h,
              stroke: conflictSet.has(`${b.src.uri}::${name}`)
                ? 'var(--vscode-editorError-foreground)'
                : 'var(--vscode-focusBorder)',
            })) as readonly Rect[]}
          />
          <text x={0} y={-8} fill="var(--vscode-foreground)" fontSize={12}>
            {b.src.alias} — {Object.keys(b.src.json.frames).length} frames
          </text>
        </g>
      ))}
    </Viewport>
  )
}
```

> **Note:** `RectOverlay`'s `stroke` per-rect prop matches the existing `Rect` type in `@three-flatland/preview`. If the live API differs, adapt the prop name (check `tools/preview/src/RectOverlay.tsx` before writing). The `Viewport` accepts a `viewBox` prop or wrapper component — confirm signature in `tools/preview/src/Viewport.ts`.

- [ ] **Step 2: Build, smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Smoke: artboards render side-by-side; rects overlaid; conflicts red-ring on duplicate names.

- [ ] **Step 3: Commit**

```bash
git add tools/vscode/webview/merge/SourcesView.tsx
git commit -m "feat(merge): artboard canvas with rect overlays + conflict highlights"
```

---

## Task 12: ConflictsPanel + inline rename

**Files:**
- Create: `tools/vscode/webview/merge/ConflictsPanel.tsx`
- Modify: `tools/vscode/webview/merge/App.tsx`

- [ ] **Step 1: Implement the panel**

```tsx
import { useState } from 'react'
import { mergeActions, useMergeState } from './mergeStore'
import type { NameConflict } from '@three-flatland/io/atlas'

export function ConflictsPanel(): JSX.Element {
  const { result } = useMergeState()
  if (result.kind === 'ok') {
    return <div style={{ padding: 12, color: 'var(--vscode-descriptionForeground)' }}>No conflicts.</div>
  }
  if (result.kind === 'nofit') {
    return <div style={{ padding: 12, color: 'var(--vscode-editorError-foreground)' }}>Doesn't fit at current max size — try a larger size or reduce padding.</div>
  }
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      {result.frameConflicts.length > 0 && (
        <Section title={`Frame conflicts (${result.frameConflicts.length})`}>
          {result.frameConflicts.map((c) => (
            <ConflictRow key={`f:${c.name}`} conflict={c} kind="frames" />
          ))}
        </Section>
      )}
      {result.animationConflicts.length > 0 && (
        <Section title={`Animation conflicts (${result.animationConflicts.length})`}>
          {result.animationConflicts.map((c) => (
            <ConflictRow key={`a:${c.name}`} conflict={c} kind="animations" />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section(p: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <details open style={{ marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{p.title}</summary>
      <div style={{ marginTop: 6 }}>{p.children}</div>
    </details>
  )
}

function ConflictRow(p: { conflict: NameConflict; kind: 'frames' | 'animations' }): JSX.Element {
  return (
    <div style={{ marginBottom: 8, fontSize: 12 }}>
      <div style={{ marginBottom: 4 }}>
        <code>{p.conflict.name}</code> — {p.conflict.sources.length} sources
      </div>
      {p.conflict.sources.map((s) => (
        <RenameRow key={`${s.uri}-${s.originalName}`} sourceUri={s.uri} alias={s.alias} originalName={s.originalName} kind={p.kind} />
      ))}
    </div>
  )
}

function RenameRow(p: {
  sourceUri: string
  alias: string
  originalName: string
  kind: 'frames' | 'animations'
}): JSX.Element {
  const state = useMergeState()
  const src = state.sources.find((s) => s.uri === p.sourceUri)
  const current = src?.renames[p.kind]?.[p.originalName] ?? p.originalName
  const [draft, setDraft] = useState(current)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8, marginBottom: 4 }}>
      <span style={{ minWidth: 60, color: 'var(--vscode-descriptionForeground)' }}>{p.alias}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const apply = p.kind === 'frames' ? mergeActions.setFrameRename : mergeActions.setAnimRename
          apply(p.sourceUri, p.originalName, draft === p.originalName ? null : draft)
        }}
        style={{
          flex: 1,
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          padding: '2px 6px',
          fontSize: 12,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Mount the panel as a right pane in App.tsx**

Update App.tsx so when `tab === 'sources'`, the layout is split: `SourcesView` on the left, `ConflictsPanel` on the right (resizable later — fixed width for v1).

```tsx
        {tab === 'sources' ? (
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}><SourcesView /></div>
            <div style={{ width: 320, borderLeft: '1px solid var(--vscode-panel-border)' }}>
              <ConflictsPanel />
            </div>
          </div>
        ) : (
          <MergedView />
        )}
```

Add the import at the top: `import { ConflictsPanel } from './ConflictsPanel'`

- [ ] **Step 3: Smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Test: select sources with overlapping frame names — conflicts list shows; renaming clears the red ring.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/merge/ConflictsPanel.tsx tools/vscode/webview/merge/App.tsx
git commit -m "feat(merge): conflicts panel with inline rename"
```

---

## Task 13: Toolbar — alias edit, namespace bulk action, settings popover

**Files:**
- Create: `tools/vscode/webview/merge/Toolbar.tsx`
- Modify: `tools/vscode/webview/merge/App.tsx`

- [ ] **Step 1: Implement the toolbar**

```tsx
import { namespaceSource } from '@three-flatland/io/atlas'
import { mergeActions, useMergeState } from './mergeStore'

export function Toolbar(p: { onSave: () => void }): JSX.Element {
  const state = useMergeState()
  const conflicts =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0
  const nofit = state.result.kind === 'nofit'
  const canSave = state.result.kind === 'ok'
  return (
    <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid var(--vscode-panel-border)', alignItems: 'center' }}>
      <button onClick={namespaceAll} disabled={state.sources.length === 0}>Namespace all</button>
      <SettingsPopover />
      <div style={{ flex: 1 }} />
      {state.result.kind === 'ok' && (
        <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
          {state.result.atlas.meta.size.w}×{state.result.atlas.meta.size.h} · {(state.result.utilization * 100).toFixed(0)}% used
        </span>
      )}
      {nofit && <span style={{ color: 'var(--vscode-editorError-foreground)' }}>Doesn't fit</span>}
      {conflicts > 0 && <span>Conflicts: {conflicts}</span>}
      <button onClick={p.onSave} disabled={!canSave} title={canSave ? 'Save' : 'Resolve conflicts and ensure pack fits before saving'}>
        Pack & Save…
      </button>
    </div>
  )
}

function namespaceAll(): void {
  // For each source, generate the namespaced rename map and merge it into renames.
  const cur = currentSources()
  for (const src of cur) {
    const { frames, animations } = namespaceSource({ json: src.json, alias: src.alias })
    for (const [orig, merged] of Object.entries(frames)) {
      mergeActions.setFrameRename(src.uri, orig, merged)
    }
    for (const [orig, merged] of Object.entries(animations)) {
      mergeActions.setAnimRename(src.uri, orig, merged)
    }
  }
}

function currentSources() {
  // Cheap escape hatch since we're outside a hook.
  return JSON.parse(JSON.stringify((globalThis as { __FL_MERGE_STATE__?: unknown }).__FL_MERGE_STATE__ ?? null)) ?? []
}

function SettingsPopover(): JSX.Element {
  const { knobs } = useMergeState()
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <label>Max
        <select
          value={knobs.maxSize}
          onChange={(e) => mergeActions.setKnobs({ maxSize: Number(e.target.value) })}
          style={{ marginLeft: 4 }}
        >
          {[1024, 2048, 4096, 8192].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>Pad
        <input
          type="number"
          min={0}
          max={16}
          value={knobs.padding}
          onChange={(e) => mergeActions.setKnobs({ padding: Number(e.target.value) })}
          style={{ width: 48, marginLeft: 4 }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={knobs.powerOfTwo}
          onChange={(e) => mergeActions.setKnobs({ powerOfTwo: e.target.checked })}
        />
        POT
      </label>
    </div>
  )
}
```

> **Note:** the `currentSources()` helper above is a placeholder — replace with a proper hook approach by lifting the namespace action up into `App.tsx` where `useMergeState()` is in scope. Recommended fix: pass `onNamespaceAll` as a prop from `App.tsx`, where it can read state via the hook.

- [ ] **Step 2: Lift namespaceAll into App.tsx and pass via prop**

Replace the `Toolbar` component's `namespaceAll` reference with a prop, and in `App.tsx` define:

```tsx
function useNamespaceAll(): () => void {
  const state = useMergeState()
  return () => {
    for (const src of state.sources) {
      const { frames, animations } = namespaceSource({ json: src.json, alias: src.alias })
      for (const [orig, merged] of Object.entries(frames)) {
        mergeActions.setFrameRename(src.uri, orig, merged)
      }
      for (const [orig, merged] of Object.entries(animations)) {
        mergeActions.setAnimRename(src.uri, orig, merged)
      }
    }
  }
}
```

Add the import for `namespaceSource` from `@three-flatland/io/atlas`. Then change the Toolbar signature to accept `onNamespaceAll: () => void` and use it for the button onClick. Remove the broken `currentSources()` helper.

- [ ] **Step 3: Mount Toolbar in App.tsx above the tab content**

```tsx
<Toolbar onSave={handleSave} onNamespaceAll={namespaceAll} />
```

(Define `handleSave` as a no-op placeholder for now — Task 15 fills it.)

- [ ] **Step 4: Smoke + commit**

Run: `pnpm --filter @three-flatland/vscode build`. Test: settings change re-packs; "Namespace all" applies prefixes and clears all conflicts.

```bash
git add tools/vscode/webview/merge/Toolbar.tsx tools/vscode/webview/merge/App.tsx
git commit -m "feat(merge): toolbar with namespace-all + packing knobs"
```

---

## Task 14: Merged view — composited canvas + rect overlay + animation drawer

**Files:**
- Modify: `tools/vscode/webview/merge/MergedView.tsx`

- [ ] **Step 1: Implement the merged view**

```tsx
import { useEffect, useRef, useState } from 'react'
import { AnimationDrawer, RectOverlay, Viewport, type Rect } from '@three-flatland/preview'
import { useMergeState } from './mergeStore'
import type { MergeResult } from '@three-flatland/io/atlas'

export function MergedView(): JSX.Element {
  const state = useMergeState()
  const result = state.result

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (result.kind !== 'ok') {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = null
      }
      setImageUrl(null)
      return
    }
    let cancelled = false
    void compositeAtlas(result, state.sources).then((blob) => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
      lastUrlRef.current = url
      setImageUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [result, state.sources])

  if (result.kind === 'conflicts') {
    return <div style={{ padding: 12 }}>Resolve conflicts to preview the merged atlas.</div>
  }
  if (result.kind === 'nofit') {
    return <div style={{ padding: 12 }}>Doesn't fit at current max size.</div>
  }

  const w = result.atlas.meta.size.w
  const h = result.atlas.meta.size.h
  const rects: Rect[] = Object.entries(result.atlas.frames).map(([name, f]) => ({
    id: name,
    x: f.frame.x,
    y: f.frame.y,
    w: f.frame.w,
    h: f.frame.h,
    name,
  }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Viewport viewBox={{ x: 0, y: 0, w, h }} style={{ width: '100%', height: '100%' }}>
          {imageUrl && <image href={imageUrl} x={0} y={0} width={w} height={h} />}
          <RectOverlay rects={rects} />
        </Viewport>
      </div>
      <AnimationDrawer atlas={result.atlas} imageUrl={imageUrl ?? ''} />
    </div>
  )
}

async function compositeAtlas(
  result: Extract<MergeResult, { kind: 'ok' }>,
  sources: ReturnType<typeof useMergeState>['sources']
): Promise<Blob | null> {
  const { atlas, placements } = result
  const canvas = new OffscreenCanvas(atlas.meta.size.w, atlas.meta.size.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Decode each unique source image once.
  const bitmapByUri = new Map<string, ImageBitmap>()
  for (const src of sources) {
    if (bitmapByUri.has(src.uri)) continue
    const res = await fetch(src.imageUri)
    const blob = await res.blob()
    bitmapByUri.set(src.uri, await createImageBitmap(blob))
  }
  for (const p of placements) {
    const bmp = bitmapByUri.get(p.sourceUri)
    if (!bmp) continue
    ctx.drawImage(
      bmp,
      p.srcRect.x, p.srcRect.y, p.srcRect.w, p.srcRect.h,
      p.dstRect.x, p.dstRect.y, p.dstRect.w, p.dstRect.h
    )
  }
  for (const bmp of bitmapByUri.values()) bmp.close()
  return await canvas.convertToBlob({ type: 'image/png' })
}
```

> **Note:** confirm `AnimationDrawer`'s actual prop names against `tools/preview/src/AnimationDrawer.tsx` — it may take `frames`/`animations`/`texture` rather than `atlas`/`imageUrl`. Adapt before merging.

- [ ] **Step 2: Smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Test: with a clean (no-conflict) merge, Merged tab shows packed image with rect overlays + animation drawer.

- [ ] **Step 3: Commit**

```bash
git add tools/vscode/webview/merge/MergedView.tsx
git commit -m "feat(merge): merged view with composited PNG + animation drawer"
```

---

## Task 15: Pack & Save flow

**Files:**
- Modify: `tools/vscode/extension/tools/merge/host.ts`
- Modify: `tools/vscode/webview/merge/App.tsx`

- [ ] **Step 1: Add the host-side save handler**

Add inside `openMergePanel`, after the existing `bridge.on(…)` calls:

```ts
  bridge.on<{
    pngBytes: number[]
    sidecar: unknown
    defaultName: string
    sourcesToDelete: string[]
  }>('merge/save', async ({ pngBytes, sidecar, defaultName, sourcesToDelete }) => {
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(sidecarUris[0]!, '..', defaultName),
      filters: { Image: ['png'] },
      saveLabel: 'Save merged atlas',
    })
    if (!target) return { ok: false, cancelled: true }
    const sidecarUri = target.with({ path: target.path.replace(/\.png$/, '') + '.atlas.json' })
    const png = new Uint8Array(pngBytes)
    const sidecarText = JSON.stringify(sidecar, null, 2) + '\n'
    await vscode.workspace.fs.writeFile(target, png)
    await vscode.workspace.fs.writeFile(sidecarUri, Buffer.from(sidecarText, 'utf8'))
    for (const uri of sourcesToDelete) {
      try {
        await vscode.workspace.fs.delete(vscode.Uri.parse(uri), { useTrash: true })
      } catch (err) {
        log(`merge/save: trash failed ${uri}: ${err instanceof Error ? err.message : err}`)
        // Best-effort; don't fail the whole save if a delete fails.
      }
    }
    return { ok: true, pngUri: target.toString(), sidecarUri: sidecarUri.toString() }
  })
```

- [ ] **Step 2: Validate the sidecar before save (host-side)**

At the top of host.ts add:

```ts
import { assertValidAtlas } from '../atlas/validateAtlas'
```

In the `merge/save` handler, immediately before writing, validate:

```ts
    try {
      assertValidAtlas(sidecar)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Merged sidecar failed schema: ${msg}`)
    }
```

- [ ] **Step 3: Wire the webview save flow**

In `App.tsx`, replace the `handleSave` placeholder with:

```tsx
  async function handleSave(): Promise<void> {
    if (state.result.kind !== 'ok') return
    const blob = await compositePngBlob(state.result, state.sources)
    if (!blob) return
    const buf = new Uint8Array(await blob.arrayBuffer())
    const bridge = createClientBridge()
    try {
      await bridge.request('merge/save', {
        pngBytes: Array.from(buf),
        sidecar: state.result.atlas,
        defaultName: state.outputFileName,
        sourcesToDelete: deleteOriginals ? state.sources.map((s) => s.uri) : [],
      })
    } finally {
      bridge.dispose()
    }
  }
```

Move the `compositeAtlas` function out of `MergedView.tsx` into a shared helper `composite.ts`:

`tools/vscode/webview/merge/composite.ts`:

```ts
import type { MergeResult } from '@three-flatland/io/atlas'
import type { MergeState } from './mergeStore'

export async function compositePngBlob(
  result: Extract<MergeResult, { kind: 'ok' }>,
  sources: MergeState['sources']
): Promise<Blob | null> {
  const { atlas, placements } = result
  const canvas = new OffscreenCanvas(atlas.meta.size.w, atlas.meta.size.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const bitmapByUri = new Map<string, ImageBitmap>()
  for (const src of sources) {
    if (bitmapByUri.has(src.uri)) continue
    const res = await fetch(src.imageUri)
    bitmapByUri.set(src.uri, await createImageBitmap(await res.blob()))
  }
  for (const p of placements) {
    const bmp = bitmapByUri.get(p.sourceUri)
    if (!bmp) continue
    ctx.drawImage(
      bmp,
      p.srcRect.x, p.srcRect.y, p.srcRect.w, p.srcRect.h,
      p.dstRect.x, p.dstRect.y, p.dstRect.w, p.dstRect.h
    )
  }
  for (const bmp of bitmapByUri.values()) bmp.close()
  return await canvas.convertToBlob({ type: 'image/png' })
}
```

Update `MergedView.tsx` to import `compositePngBlob` from `./composite` and remove its local copy.

- [ ] **Step 4: Add the "Delete originals after success" checkbox to App.tsx**

Add a `deleteOriginals` state hook in `App` and a checkbox in the toolbar (or pass through to Toolbar):

```tsx
const [deleteOriginals, setDeleteOriginals] = useState(false)
```

Pass `deleteOriginals` and `setDeleteOriginals` down to Toolbar; render a checkbox `<label><input type="checkbox" checked={deleteOriginals} onChange={(e) => setDeleteOriginals(e.target.checked)}/> Delete originals on success</label>`. Defaults to off per spec.

- [ ] **Step 5: Smoke**

Run: `pnpm --filter @three-flatland/vscode build`
Test: with a no-conflict merge, click Pack & Save, choose a path. Verify:
1. `<name>.png` and `<name>.atlas.json` written.
2. Sidecar contains `meta.merge.sources` with the source URIs + counts.
3. With the delete-originals checkbox on, source `.atlas.json` files move to trash.

- [ ] **Step 6: Commit**

```bash
git add tools/vscode/extension/tools/merge/host.ts tools/vscode/webview/merge/App.tsx tools/vscode/webview/merge/composite.ts tools/vscode/webview/merge/MergedView.tsx tools/vscode/webview/merge/Toolbar.tsx
git commit -m "feat(merge): pack & save flow with optional delete-originals"
```

---

## Task 16: Error handling polish

**Files:**
- Modify: `tools/vscode/webview/merge/App.tsx`
- Modify: `tools/vscode/webview/merge/SourcesView.tsx`

- [ ] **Step 1: Surface init errors**

In `App.tsx`'s `merge/init` handler, save errors to local state:

```tsx
const [initErrors, setInitErrors] = useState<Array<{ uri: string; message: string }>>([])
```

If `initErrors.length > 0`, render a banner above the tabs:

```tsx
{initErrors.length > 0 && (
  <div style={{
    padding: 8,
    background: 'var(--vscode-inputValidation-errorBackground)',
    color: 'var(--vscode-inputValidation-errorForeground)',
    borderBottom: '1px solid var(--vscode-inputValidation-errorBorder)',
    fontSize: 12,
  }}>
    {initErrors.length} source(s) failed to load:
    <ul style={{ margin: '4px 0 0 16px' }}>
      {initErrors.map((e) => <li key={e.uri}><code>{e.uri}</code>: {e.message}</li>)}
    </ul>
  </div>
)}
```

- [ ] **Step 2: Show a placeholder for missing source images**

In `SourcesView.tsx`, when an `<image href>` fails to load, the SVG `<image>` simply renders nothing. Add a fallback:

```tsx
<image
  href={b.src.imageUri}
  x={0}
  y={0}
  width={b.w}
  height={b.h}
  onError={(e) => (e.currentTarget as SVGImageElement).style.opacity = '0'}
/>
{/* under-image placeholder — rendered before <image> via z-order */}
```

Render a `<rect>` at the same coords filled with a checker pattern beneath the `<image>` so the artboard is still visible if the image fails to resolve.

- [ ] **Step 3: Disable Pack & Save when any source image is unloadable**

Track image-load failures in the merge state (via a `imageLoadFailed: Set<string>` field, populated by an `onError` handler that calls a new `mergeActions.markImageFailed(uri)`). In `Toolbar.tsx`'s save-button `disabled` check, OR-in `state.imageLoadFailed.size > 0`. Show a tooltip explaining why it's blocked.

(Implementation: add `imageLoadFailed: Set<string>` to `MergeState`, default `new Set()`, with a `markImageFailed` action.)

- [ ] **Step 4: Smoke + commit**

Run: `pnpm --filter @three-flatland/vscode build`
Test: an invalid sidecar produces a banner; a missing image disables Save.

```bash
git add tools/vscode/webview/merge tools/vscode/extension/tools/merge
git commit -m "feat(merge): error handling for invalid sidecars + missing images"
```

---

## Task 17: README + spec link in design system docs (small)

**Files:**
- Optional: add a short section to `tools/vscode/README.md` (if it exists) referencing the merge tool.

- [ ] **Step 1: If `tools/vscode/README.md` exists, add a brief "Atlas Merge" section linking to the spec; otherwise skip.**

- [ ] **Step 2: Commit (only if README updated)**

---

## Self-review checklist (do before declaring complete)

- [ ] **Spec coverage:**
  - User flow (multi-select + ephemeral panel) → Tasks 6, 7, 8
  - Sources tab artboards + conflict highlights → Tasks 11, 12
  - Merged tab + animation drawer → Task 14
  - Hybrid conflict resolution + namespace bulk → Tasks 12, 13
  - Packing knobs + multiple-of-4 floor → Task 4
  - Output (PNG + sidecar) + delete-originals → Task 15
  - `meta.merge.sources` informational field → Tasks 2 (type), 5 (population), 15 (validate before write)
  - Package extraction (`io/atlas/{build,maxrects,merge}`) → Tasks 1–5
  - Error handling: invalid sidecars, missing images, doesn't-fit → Task 16
  - Schema validation before write → Task 15 step 2
  - Tests for pure modules → Tasks 4, 5

- [ ] **No placeholders:** every step has executable code or commands. Two `> Note:` blocks call out APIs to confirm against the live `preview` package — those are pointers to verify, not TODOs.

- [ ] **Type/name consistency:** `MergeSource`, `MergeResult`, `NameConflict`, `mergeActions`, `useMergeState`, `compositePngBlob`, `AtlasMergeMeta` all match across tasks.

---

## Execution Handoff

**Plan complete and saved to `planning/superpowers/plans/2026-04-30-atlas-merge.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
