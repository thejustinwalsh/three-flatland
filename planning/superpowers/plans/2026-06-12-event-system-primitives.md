# Event System — Plan 1: Primitive Raycasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Sprite2D` and `TileMap2D` pickable by any three.js `Raycaster` (and therefore by R3F pointer events) via canonical `raycast()` overrides with `radius`/`bounds`/`alpha`/`none` hit-test modes.

**Architecture:** Per spec `planning/superpowers/specs/2026-06-12-event-system-design.md` §5–§7: the event identity is the user-facing primitive (`intersection.object === sprite`), hit testing happens on the local Z=0 plane of a **centered unit quad** (anchor and scale live entirely in `updateMatrix()`, so raycast code never touches anchor), and `'none'` nulls the instance `raycast` property so R3F skips the object at registration. New shared modules live in `packages/three-flatland/src/events/`.

**Tech Stack:** three@0.183.1 (`Raycaster`, `Intersection`), vitest (`pnpm` workspace, run via `npx vitest --typecheck --run <path>`), repo style: no semicolons, single quotes, `import type`.

**Key spec references:** §6 (modes), §7.1 (Sprite2D), §7.2 (TileMap2D), §11 (defect ledger → regression tests).

---

## File structure

| File | Responsibility |
|---|---|
| Create `packages/three-flatland/src/events/HitTestMode.ts` | Mode union + `resolveHitTestMode` fallback (port of PoC, unchanged semantics) |
| Create `packages/three-flatland/src/events/raycastHelpers.ts` | `rayPlaneZ0` (local Z=0 intersection, near/far) + `createIntersection` (cloned point per hit — spec §11.2) |
| Create `packages/three-flatland/src/events/AlphaMap.ts` | CPU alpha store: `sampleAtlasUV` (Y-flip), `sampleFrame` (frame-rect mapping), `fromTexture` runtime fallback |
| Create `packages/three-flatland/src/events/index.ts` | Barrel |
| Modify `packages/three-flatland/src/sprites/Sprite2D.ts` | `hitTestMode`/`hitRadius`/`alphaMap`/`alphaThreshold` + `raycast()` override |
| Modify `packages/three-flatland/src/tilemap/TileMap2D.ts` | `raycast()` override (returns `false`) + `tileFromIntersection()` |
| Modify `packages/three-flatland/src/index.ts` | `export * from './events'` |
| Tests | `src/events/*.test.ts`, `src/sprites/Sprite2D.raycast.test.ts`, `src/tilemap/TileMap2D.raycast.test.ts` |

All commands run from the repo root. The three-flatland package dir is `packages/three-flatland`.

---

### Task 1: HitTestMode module

**Files:**
- Create: `packages/three-flatland/src/events/HitTestMode.ts`
- Test: `packages/three-flatland/src/events/HitTestMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveHitTestMode, ALL_HIT_TEST_MODES } from './HitTestMode'

describe('HitTestMode', () => {
  it('exposes all four modes', () => {
    expect(ALL_HIT_TEST_MODES).toEqual(['radius', 'bounds', 'alpha', 'none'])
  })

  it('returns the requested mode when supported', () => {
    expect(resolveHitTestMode('alpha', ['radius', 'bounds', 'alpha', 'none'], 'Sprite2D')).toBe(
      'alpha'
    )
  })

  it('falls back to bounds first, then radius, then first supported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveHitTestMode('alpha', ['bounds', 'none'], 'TileMap2D')).toBe('bounds')
    expect(resolveHitTestMode('alpha', ['radius', 'none'], 'X')).toBe('radius')
    expect(resolveHitTestMode('alpha', ['none'], 'X')).toBe('none')
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/events/HitTestMode.test.ts`
Expected: FAIL — cannot resolve `./HitTestMode`

- [ ] **Step 3: Write the implementation**

```ts
/** Hit-testing strategy for pointer raycasts. See spec §6. */
export type HitTestMode = 'radius' | 'bounds' | 'alpha' | 'none'

export const ALL_HIT_TEST_MODES: readonly HitTestMode[] = ['radius', 'bounds', 'alpha', 'none']

/**
 * Resolve a requested mode against a class's supported set, falling
 * back (bounds → radius → first supported) with a dev-only warning.
 */
export function resolveHitTestMode(
  requested: HitTestMode,
  supported: readonly HitTestMode[],
  className: string
): HitTestMode {
  if (supported.includes(requested)) return requested
  const fallback = supported.includes('bounds')
    ? 'bounds'
    : supported.includes('radius')
      ? 'radius'
      : supported[0]!
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `three-flatland: ${className} does not support hitTestMode '${requested}', using '${fallback}'`
    )
  }
  return fallback
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/events/HitTestMode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/events/HitTestMode.ts packages/three-flatland/src/events/HitTestMode.test.ts
git commit -m "feat(events): hit-test mode union with resolve fallback"
```

---

### Task 2: raycastHelpers — local Z=0 plane intersection

**Files:**
- Create: `packages/three-flatland/src/events/raycastHelpers.ts`
- Test: `packages/three-flatland/src/events/raycastHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Object3D, Raycaster } from 'three'
import { rayPlaneZ0, createIntersection } from './raycastHelpers'

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

describe('rayPlaneZ0', () => {
  it('intersects the local Z=0 plane of a transformed object', () => {
    const obj = new Object3D()
    obj.position.set(10, 5, 0)
    obj.scale.set(2, 2, 1)
    obj.updateMatrixWorld(true)
    // World (11, 6) is local (0.5, 0.5) after inverse translate+scale
    const hit = rayPlaneZ0(makeRaycaster(11, 6), obj)
    expect(hit).not.toBeNull()
    expect(hit!.localX).toBeCloseTo(0.5)
    expect(hit!.localY).toBeCloseTo(0.5)
    expect(hit!.distance).toBeCloseTo(10)
  })

  it('returns null for a ray parallel to the plane', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0)
    r.ray.direction.set(1, 0, 0)
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })

  it('returns null when the hit is outside near/far', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, 10)
    r.far = 5
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })

  it('returns null when the plane is behind the ray origin', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, -10) // origin behind plane, looking away
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })
})

describe('createIntersection', () => {
  it('clones the world point per intersection (spec §11.2 regression)', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const a = createIntersection(rayPlaneZ0(makeRaycaster(1, 1), obj)!, obj, 0, 0)
    const b = createIntersection(rayPlaneZ0(makeRaycaster(2, 2), obj)!, obj, 0, 0)
    expect(a.point).not.toBe(b.point)
    expect(a.point.x).toBeCloseTo(1)
    expect(b.point.x).toBeCloseTo(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/events/raycastHelpers.test.ts`
Expected: FAIL — cannot resolve `./raycastHelpers`

- [ ] **Step 3: Write the implementation**

```ts
import { Matrix4, Ray, Vector2, Vector3 } from 'three'
import type { Intersection, Object3D, Raycaster } from 'three'

const _invMatrix = new Matrix4()
const _localRay = new Ray()
const _worldPoint = new Vector3()

/** Result of a local Z=0 plane intersection. Scratch values — consume
 * immediately or go through createIntersection (which clones). */
export interface RayPlaneHit {
  localX: number
  localY: number
  distance: number
}

/**
 * Intersect the raycaster's ray with `object`'s local Z=0 plane.
 * Returns local hit coordinates + world distance, or null when the ray
 * is parallel, the plane is behind the origin, or the hit falls
 * outside `raycaster.near`/`far`. Allocation-free.
 */
export function rayPlaneZ0(raycaster: Raycaster, object: Object3D): RayPlaneHit | null {
  _invMatrix.copy(object.matrixWorld).invert()
  _localRay.copy(raycaster.ray).applyMatrix4(_invMatrix)
  const dz = _localRay.direction.z
  if (dz === 0) return null
  const t = -_localRay.origin.z / dz
  if (t < 0) return null
  const localX = _localRay.origin.x + _localRay.direction.x * t
  const localY = _localRay.origin.y + _localRay.direction.y * t
  _worldPoint.set(localX, localY, 0).applyMatrix4(object.matrixWorld)
  const distance = raycaster.ray.origin.distanceTo(_worldPoint)
  if (distance < raycaster.near || distance > raycaster.far) return null
  return { localX, localY, distance }
}

/**
 * Build a standard three.js Intersection from a RayPlaneHit. The world
 * point is freshly allocated per call — safe to store (spec §11.2).
 */
export function createIntersection(
  hit: RayPlaneHit,
  object: Object3D,
  u: number,
  v: number
): Intersection {
  return {
    distance: hit.distance,
    point: new Vector3(hit.localX, hit.localY, 0).applyMatrix4(object.matrixWorld),
    object,
    uv: new Vector2(u, v),
    face: null,
    faceIndex: undefined,
  } as unknown as Intersection
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/events/raycastHelpers.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/events/raycastHelpers.ts packages/three-flatland/src/events/raycastHelpers.test.ts
git commit -m "feat(events): ray-to-local-plane helpers with per-hit point cloning"
```

---

### Task 3: AlphaMap

**Files:**
- Create: `packages/three-flatland/src/events/AlphaMap.ts`
- Test: `packages/three-flatland/src/events/AlphaMap.test.ts`

`SpriteFrame` (`packages/three-flatland/src/sprites/types.ts`) stores `x/y/width/height` **normalized 0–1 in UV space (y-up, origin bottom-left)**; raw pixel data is row-major from the **top**. `sampleAtlasUV` owns that Y flip.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { AlphaMap } from './AlphaMap'
import type { SpriteFrame } from '../sprites/types'

// 4×4 alpha data, row-major from the TOP (like canvas getImageData):
// top half opaque (255), bottom half transparent (0)
const data = new Uint8Array([
  255, 255, 255, 255,
  255, 255, 255, 255,
  0, 0, 0, 0,
  0, 0, 0, 0,
])

describe('AlphaMap', () => {
  const map = new AlphaMap(data, 4, 4)

  it('samples atlas UV with bottom-left origin (Y flip)', () => {
    expect(map.sampleAtlasUV(0.25, 0.875)).toBe(255) // near top
    expect(map.sampleAtlasUV(0.25, 0.125)).toBe(0) // near bottom
  })

  it('clamps out-of-range UVs', () => {
    expect(map.sampleAtlasUV(-1, 2)).toBe(255) // clamps to top-left
    expect(map.sampleAtlasUV(2, -1)).toBe(0) // clamps to bottom-right
  })

  it('maps frame-local UV through the frame rect', () => {
    // Frame covering the top half of the atlas (UV y 0.5..1.0)
    const frame: SpriteFrame = {
      name: 'top',
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
      sourceWidth: 4,
      sourceHeight: 2,
    }
    expect(map.sampleFrame(0.5, 0.5, frame)).toBe(255)
    // Frame covering the bottom half
    const bottom: SpriteFrame = { ...frame, name: 'bottom', y: 0 }
    expect(map.sampleFrame(0.5, 0.5, bottom)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/events/AlphaMap.test.ts`
Expected: FAIL — cannot resolve `./AlphaMap`

- [ ] **Step 3: Write the implementation**

```ts
import type { Texture } from 'three'
import type { SpriteFrame } from '../sprites/types'

/**
 * CPU-side alpha-channel store for pixel-perfect hit testing
 * (`hitTestMode: 'alpha'`). 1 byte per pixel.
 *
 * Spec §10: populated from a baked `.alpha.png` sidecar when present;
 * `fromTexture` is the runtime readback fallback.
 */
export class AlphaMap {
  constructor(
    /** Alpha values, row-major from the top (canvas pixel order). */
    readonly data: Uint8Array,
    readonly width: number,
    readonly height: number
  ) {}

  /** Sample at atlas UV (0–1, bottom-left origin). Returns 0–255. */
  sampleAtlasUV(u: number, v: number): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(u * this.width)))
    const yFromTop = Math.min(this.height - 1, Math.max(0, Math.floor((1 - v) * this.height)))
    return this.data[yFromTop * this.width + x] ?? 0
  }

  /** Sample at sprite-local UV (0–1 within the frame quad). Returns 0–255. */
  sampleFrame(localU: number, localV: number, frame: SpriteFrame): number {
    return this.sampleAtlasUV(frame.x + localU * frame.width, frame.y + localV * frame.height)
  }

  /**
   * Runtime fallback: extract the alpha channel from a loaded texture
   * via canvas readback. Synchronous and main-thread — prefer the
   * baked sidecar (spec §10). Returns null when the image is missing
   * or the canvas is tainted.
   */
  static fromTexture(texture: Texture): AlphaMap | null {
    const image = texture.image as
      | { width: number; height: number }
      | undefined
    if (!image || !image.width || !image.height) return null
    try {
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(image.width, image.height)
          : (() => {
              const c = document.createElement('canvas')
              c.width = image.width
              c.height = image.height
              return c
            })()
      const ctx = canvas.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null
      if (!ctx) return null
      ctx.drawImage(image as CanvasImageSource, 0, 0)
      const rgba = ctx.getImageData(0, 0, image.width, image.height).data
      const alpha = new Uint8Array(image.width * image.height)
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!
      return new AlphaMap(alpha, image.width, image.height)
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/events/AlphaMap.test.ts`
Expected: PASS (3 tests). (`fromTexture` is exercised in Plan 3's loader tests where DOM mocks exist; in this node-run suite the pure sampling paths are the contract.)

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/events/AlphaMap.ts packages/three-flatland/src/events/AlphaMap.test.ts
git commit -m "feat(events): AlphaMap CPU alpha store with frame-rect sampling"
```

---

### Task 4: events barrel + root export + react subpath

**Files:**
- Create: `packages/three-flatland/src/events/index.ts`
- Modify: `packages/three-flatland/src/index.ts` (after the `// Color`-style section pattern — insert after `export * from './GlobalUniforms'`)
- Modify: `packages/three-flatland/package.json` (exports map — add `./events` + `./events/*` entries following the exact shape of the `./tilemap` + `./tilemap/*` entries at lines ~175–196)

- [ ] **Step 1: Create the barrel**

```ts
export { type HitTestMode, ALL_HIT_TEST_MODES, resolveHitTestMode } from './HitTestMode'
export { rayPlaneZ0, createIntersection, type RayPlaneHit } from './raycastHelpers'
export { AlphaMap } from './AlphaMap'
```

- [ ] **Step 2: Wire the root index**

In `packages/three-flatland/src/index.ts`, after the `// Global Uniforms` block add:

```ts
// Events / hit-testing
export * from './events'
```

- [ ] **Step 3: Add package.json exports**

Duplicate the `./tilemap` and `./tilemap/*` export entries, renaming `tilemap` → `events` in all six path strings of each entry. Keep ordering: insert before `./react/*`.

- [ ] **Step 4: Regenerate react subpath wrappers**

Run: `pnpm sync:react`
Expected output: `core: Created src/react/events/index.ts`

- [ ] **Step 5: Verify typecheck and commit**

Run: `pnpm --filter=three-flatland typecheck` — Expected: clean.

```bash
git add packages/three-flatland/src/events/index.ts packages/three-flatland/src/index.ts packages/three-flatland/package.json packages/three-flatland/src/react/events/index.ts
git commit -m "feat(events): export events module + react subpath wrapper"
```

---

### Task 5: Sprite2D hit-test fields and the `'none'` raycast-null trick

**Files:**
- Modify: `packages/three-flatland/src/sprites/Sprite2D.ts` (fields near `_anchor` at ~line 96; imports at top)
- Test: `packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Texture } from 'three'
import { Sprite2D } from './Sprite2D'

function makeSprite(): Sprite2D {
  const texture = new Texture()
  // @ts-expect-error - mocking image for tests
  texture.image = { width: 100, height: 100 }
  return new Sprite2D({ texture })
}

describe('Sprite2D hitTestMode', () => {
  it('defaults to radius', () => {
    expect(makeSprite().hitTestMode).toBe('radius')
  })

  it("'none' nulls the instance raycast property (R3F registration gate)", () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'none'
    expect(sprite.raycast).toBeNull()
  })

  it("leaving 'none' restores the prototype raycast (spec §11.5)", () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'none'
    sprite.hitTestMode = 'bounds'
    expect(typeof sprite.raycast).toBe('function')
    expect(Object.prototype.hasOwnProperty.call(sprite, 'raycast')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`
Expected: FAIL — `hitTestMode` is undefined

- [ ] **Step 3: Add fields + accessors to Sprite2D**

Imports at the top of `Sprite2D.ts`:

```ts
import { resolveHitTestMode } from '../events/HitTestMode'
import type { HitTestMode } from '../events/HitTestMode'
import type { AlphaMap } from '../events/AlphaMap'
```

Class members (place after the `_anchor`/`_frame` private fields, ~line 100):

```ts
  /** Hit-test modes this class supports. See spec §6. */
  static readonly supportedHitTestModes: readonly HitTestMode[] = [
    'radius',
    'bounds',
    'alpha',
    'none',
  ]

  /** CPU alpha store for `hitTestMode: 'alpha'`. Spec §8.4: assigned
   * from `SpriteSheet.alphaMap` or set directly. */
  alphaMap: AlphaMap | null = null

  /** Alpha cutoff (0–1) for `'alpha'` mode. */
  alphaThreshold = 0.5

  private _hitTestMode: HitTestMode = 'radius'
  private _hitRadius: number | null = null

  /**
   * Hit radius in local quad units (0.5 touches the quad edges, which
   * is the default). Scale is carried by the world matrix, so this is
   * an inscribed ellipse in world space for non-uniform scale.
   */
  get hitRadius(): number | null {
    return this._hitRadius
  }

  set hitRadius(value: number | null) {
    this._hitRadius = value
  }

  get hitTestMode(): HitTestMode {
    return this._hitTestMode
  }

  set hitTestMode(value: HitTestMode) {
    const resolved = resolveHitTestMode(value, Sprite2D.supportedHitTestModes, 'Sprite2D')
    if (resolved === this._hitTestMode) return
    this._hitTestMode = resolved
    if (resolved === 'none') {
      // R3F checks `object.raycast !== null` at registration — nulling
      // the instance property removes us from the interaction list.
      ;(this as { raycast: unknown }).raycast = null
    } else if (Object.prototype.hasOwnProperty.call(this, 'raycast')) {
      // Restore prototype lookup.
      delete (this as { raycast?: unknown }).raycast
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/sprites/Sprite2D.ts packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts
git commit -m "feat(sprites): Sprite2D hitTestMode plumbing with raycast-null none mode"
```

---

### Task 6: Sprite2D.raycast() — radius and bounds modes

**Files:**
- Modify: `packages/three-flatland/src/sprites/Sprite2D.ts`
- Test: `packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`

The local quad is **centered**: `[-0.5, 0.5]²`. `updateMatrix()` (Sprite2D.ts:1421) bakes anchor and scale into the matrix, so after `rayPlaneZ0`'s inverse transform there is no anchor math (spec §7.1).

- [ ] **Step 1: Add the failing tests**

Append to `Sprite2D.raycast.test.ts`:

```ts
import { Raycaster } from 'three'

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

describe('Sprite2D.raycast', () => {
  it('bounds mode hits inside the scaled quad and misses outside', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.position.set(10, 10, 0)
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(10, 10).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(19, 19).intersectObject(sprite)).toHaveLength(1) // inside corner
    expect(makeRaycaster(21, 21).intersectObject(sprite)).toHaveLength(0) // outside
  })

  it('radius mode misses the quad corner that bounds mode hits', () => {
    const sprite = makeSprite()
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(9, 9).intersectObject(sprite)).toHaveLength(0) // corner, outside circle
    expect(makeRaycaster(0, 9).intersectObject(sprite)).toHaveLength(1) // edge midpoint, inside
  })

  it('radius mode is an inscribed ellipse under non-uniform scale (spec §11.6)', () => {
    const sprite = makeSprite()
    sprite.scale.set(100, 10, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(45, 0).intersectObject(sprite)).toHaveLength(1) // wide axis
    expect(makeRaycaster(0, 4.5).intersectObject(sprite)).toHaveLength(1) // short axis
    expect(makeRaycaster(45, 4.5).intersectObject(sprite)).toHaveLength(0) // ellipse corner
  })

  it('hitRadius overrides the default 0.5 local radius', () => {
    const sprite = makeSprite()
    sprite.scale.set(20, 20, 1)
    sprite.hitRadius = 1.0 // beyond the quad
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(15, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('respects anchor without any raycast-side math (spec §11.4)', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.anchor = [0, 0] // bottom-left anchor: quad now spans position..position+scale
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(10, 10).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(-5, -5).intersectObject(sprite)).toHaveLength(0)
  })

  it('populates the canonical intersection record', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    const [hit] = makeRaycaster(5, 5).intersectObject(sprite)
    expect(hit!.object).toBe(sprite)
    expect(hit!.distance).toBeCloseTo(10)
    expect(hit!.point.x).toBeCloseTo(5)
    expect(hit!.uv!.x).toBeCloseTo(0.75)
    expect(hit!.uv!.y).toBeCloseTo(0.75)
  })

  it('pushes at most one intersection per call (spec §11.3)', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('honors near/far', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, 10)
    r.far = 5
    expect(r.intersectObject(sprite)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`
Expected: the Task 5 tests PASS; the new `Sprite2D.raycast` describe FAILS (inherited `Mesh.raycast` tests triangles of the unit geometry, so scaled hits like `(19, 19)` miss).

- [ ] **Step 3: Implement the raycast override**

Add to `Sprite2D.ts` imports:

```ts
import { rayPlaneZ0, createIntersection } from '../events/raycastHelpers'
```

Add the method (near `updateMatrix`, ~line 1410), plus the module-level warning latch above the class:

```ts
let _warnedMissingAlphaMap = false
```

```ts
  /**
   * Canonical three.js raycast. Hit-tests the local Z=0 centered unit
   * quad per the active `hitTestMode`; anchor and scale are already in
   * the world matrix. Spec §7.1.
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (this._hitTestMode === 'none') return
    const hit = rayPlaneZ0(raycaster, this)
    if (!hit) return
    const { localX, localY } = hit

    let inside: boolean
    if (this._hitTestMode === 'radius') {
      const r = this._hitRadius ?? 0.5
      inside = localX * localX + localY * localY <= r * r
    } else {
      inside = localX >= -0.5 && localX <= 0.5 && localY >= -0.5 && localY <= 0.5
      if (inside && this._hitTestMode === 'alpha') {
        if (this.alphaMap) {
          const u = localX + 0.5
          const v = localY + 0.5
          const alpha = this._frame
            ? this.alphaMap.sampleFrame(u, v, this._frame)
            : this.alphaMap.sampleAtlasUV(u, v)
          inside = alpha >= this.alphaThreshold * 255
        } else if (!_warnedMissingAlphaMap && process.env.NODE_ENV !== 'production') {
          _warnedMissingAlphaMap = true
          console.warn(
            "three-flatland: hitTestMode 'alpha' without an alphaMap — falling back to bounds. " +
              'Load with `alpha: true` or assign sprite.alphaMap.'
          )
        }
      }
    }
    if (!inside) return
    intersects.push(createIntersection(hit, this, localX + 0.5, localY + 0.5))
  }
```

Add `Raycaster` and `Intersection` to the existing `three` type imports in `Sprite2D.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Run the existing sprite suite for regressions**

Run: `npx vitest --run packages/three-flatland/src/sprites`
Expected: all PASS (the override replaces inherited Mesh triangle raycast; no existing test asserts Mesh raycast behavior)

- [ ] **Step 6: Commit**

```bash
git add packages/three-flatland/src/sprites/Sprite2D.ts packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts
git commit -m "feat(sprites): Sprite2D.raycast with radius/bounds modes on the local unit quad"
```

---

### Task 7: Sprite2D alpha mode

**Files:**
- Modify: `packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts` (tests only — implementation landed in Task 6)

- [ ] **Step 1: Write the failing tests**

Add `import { AlphaMap } from '../events/AlphaMap'` to the imports at the top of the file, then append inside the `Sprite2D.raycast` describe:

```ts
  it('alpha mode rejects transparent pixels and accepts opaque ones', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    // 2×2: top row opaque, bottom row transparent (data is top-first)
    sprite.alphaMap = new AlphaMap(new Uint8Array([255, 255, 0, 0]), 2, 2)
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 5).intersectObject(sprite)).toHaveLength(1) // upper half
    expect(makeRaycaster(0, -5).intersectObject(sprite)).toHaveLength(0) // lower half
  })

  it('alphaThreshold gates the sample', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    sprite.alphaMap = new AlphaMap(new Uint8Array([100, 100, 100, 100]), 2, 2)
    sprite.updateMatrixWorld(true)
    sprite.alphaThreshold = 0.5 // 100 < 127.5 → miss
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(0)
    sprite.alphaThreshold = 0.3 // 100 >= 76.5 → hit
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('alpha mode without an alphaMap falls back to bounds with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1) // bounds result
    makeRaycaster(0, 0).intersectObject(sprite)
    expect(warn).toHaveBeenCalledTimes(1) // one-shot latch
    warn.mockRestore()
  })
```

Add `vi` to the vitest import at the top of the file.

- [ ] **Step 2: Run tests**

Run: `npx vitest --run packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts`
Expected: PASS — Task 6 already implemented alpha mode. If any fail, the implementation diverges from spec §7.1; fix the implementation, not the test. (The warn-latch test depends on module state; if it ran after another alpha-warning test in the same file, reset expectations accordingly — keep it as the only missing-alphaMap test.)

- [ ] **Step 3: Commit**

```bash
git add packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts
git commit -m "test(sprites): alpha hit-test mode coverage (threshold, fallback latch)"
```

---

### Task 8: TileMap2D.raycast() + tileFromIntersection

**Files:**
- Modify: `packages/three-flatland/src/tilemap/TileMap2D.ts`
- Test: `packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts` (new file)

TileMap2D local space: origin bottom-left, X right, Y up, `widthInPixels × heightInPixels`. `getTileAtWorld(localX, localY, layerIndex)` (TileMap2D.ts:537) already converts Y-up world-local coords to Tiled's Y-down tile rows. **`raycast` must return `false`** to stop three's traversal from recursing into the TileLayer InstancedMesh children (spec §7.2, §11.1).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Raycaster, Texture } from 'three'
import { TileMap2D } from './TileMap2D'
import type { TileMapData } from './types'

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

function makeMapData(): TileMapData {
  const texture = new Texture()
  // @ts-expect-error - mocking image for tests
  texture.image = { width: 64, height: 64 }
  return {
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [
      {
        name: 't',
        firstGid: 1,
        tileWidth: 16,
        tileHeight: 16,
        imageWidth: 64,
        imageHeight: 64,
        columns: 4,
        tileCount: 16,
        tiles: new Map(),
        texture,
      },
    ],
    tileLayers: [
      {
        name: 'ground',
        id: 1,
        width: 4,
        height: 4,
        // Tiled rows are top-first: ring of 1s with an empty 2×2 center
        data: new Uint32Array([1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]),
      },
    ],
    objectLayers: [],
  }
}

describe('TileMap2D.raycast', () => {
  function makeMap(): TileMap2D {
    const map = new TileMap2D()
    map.data = makeMapData()
    map.updateMatrixWorld(true)
    return map
  }

  it('hits a solid tile and reports layer + world point', () => {
    const map = makeMap()
    // (8, 8) is in the bottom-left corner tile (solid ring)
    const hits = makeRaycaster(8, 8).intersectObject(map, true)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.object).toBe(map)
    expect(hits[0]!.faceIndex).toBe(0) // layer index
    expect(hits[0]!.point.x).toBeCloseTo(8)
  })

  it('misses empty tiles (gid 0)', () => {
    const map = makeMap()
    // (32, 32) is the empty 2×2 center
    expect(makeRaycaster(32, 32).intersectObject(map, true)).toHaveLength(0)
  })

  it('misses outside the map bounds', () => {
    const map = makeMap()
    expect(makeRaycaster(100, 100).intersectObject(map, true)).toHaveLength(0)
  })

  it('blocks traversal into TileLayer children (spec §11.1 phantom-hit regression)', () => {
    const map = makeMap()
    // Even over an EMPTY tile, recursive traversal must not produce
    // hits from the child InstancedMesh base geometry.
    const hits = makeRaycaster(32, 32).intersectObject(map, true)
    expect(hits).toHaveLength(0)
    // And over a solid tile, exactly one hit — the map's, not a child's.
    const solid = makeRaycaster(8, 8).intersectObject(map, true)
    expect(solid).toHaveLength(1)
    expect(solid[0]!.object).toBe(map)
  })

  it('tileFromIntersection resolves layer/tile coords/gid', () => {
    const map = makeMap()
    const [hit] = makeRaycaster(8, 8).intersectObject(map, true)
    const tile = map.tileFromIntersection(hit!)
    expect(tile).toEqual({ layer: 0, tileX: 0, tileY: 3, gid: 1 }) // Tiled Y-down: bottom row = 3
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts`
Expected: FAIL — Group has no raycast hits of its own and `tileFromIntersection` doesn't exist. (If the phantom-hit test FAILS with hits > 0 before implementation, that demonstrates the §11.1 bug live.)

- [ ] **Step 3: Implement**

Imports in `TileMap2D.ts`:

```ts
import { Matrix4, Vector3 } from 'three'
import type { Raycaster, Intersection } from 'three'
import { rayPlaneZ0, createIntersection } from '../events/raycastHelpers'
```

(Merge with existing three imports — `Vector3` is already imported.)

Module-level scratch above the class:

```ts
const _tileInvMatrix = new Matrix4()
const _tileLocalPoint = new Vector3()
```

Methods (place after `getTileAtWorld`, ~line 543):

```ts
  /**
   * Canonical three.js raycast: O(1) arithmetic tile lookup on the
   * local Z=0 plane. Top-most layer with a non-zero GID wins;
   * `faceIndex` carries the layer index. Returns `false` to stop
   * three's traversal from recursing into TileLayer children
   * (spec §7.2 / §11.1).
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]): false {
    const hit = rayPlaneZ0(raycaster, this)
    if (!hit) return false
    const { localX, localY } = hit
    if (localX < 0 || localX >= this._widthInPixels || localY < 0 || localY >= this._heightInPixels) {
      return false
    }
    for (let i = this.tileLayers.length - 1; i >= 0; i--) {
      const gid = this.getTileAtWorld(localX, localY, i)
      if (gid === 0) continue
      const u = (localX % this._tileWidth) / this._tileWidth
      const v = (localY % this._tileHeight) / this._tileHeight
      const intersection = createIntersection(hit, this, u, v)
      intersection.faceIndex = i
      intersects.push(intersection)
      break
    }
    return false
  }

  /**
   * Resolve a raycast intersection produced by this tilemap into
   * layer + tile coordinates (Tiled Y-down) + GID. Returns null for
   * foreign intersections. Spec §7.2.
   */
  tileFromIntersection(
    hit: Intersection
  ): { layer: number; tileX: number; tileY: number; gid: number } | null {
    if (hit.object !== this || hit.faceIndex === undefined || hit.faceIndex === null) return null
    _tileLocalPoint.copy(hit.point).applyMatrix4(_tileInvMatrix.copy(this.matrixWorld).invert())
    const { x: tileX, y: tileY } = this.worldToTile(_tileLocalPoint.x, _tileLocalPoint.y)
    const gid = this.tileLayers[hit.faceIndex]?.getTileAt(tileX, tileY) ?? 0
    return { layer: hit.faceIndex, tileX, tileY, gid }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the tilemap + full package suites**

Run: `npx vitest --run packages/three-flatland/src/tilemap && npx vitest --typecheck --run packages/three-flatland/src`
Expected: all PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add packages/three-flatland/src/tilemap/TileMap2D.ts packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts
git commit -m "feat(tilemap): TileMap2D raycast with O(1) tile lookup and child-traversal block"
```

---

### Task 9: Final verification gate

- [ ] **Step 1: Full test + typecheck + lint**

```bash
npx vitest --typecheck --run packages/three-flatland/src
pnpm --filter=three-flatland typecheck
npx eslint packages/three-flatland/src/events packages/three-flatland/src/sprites packages/three-flatland/src/tilemap
npx prettier --check 'packages/three-flatland/src/events/**' 'packages/three-flatland/src/sprites/Sprite2D*.ts' 'packages/three-flatland/src/tilemap/TileMap2D*.ts'
```

Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Commit any straggler fixes**

```bash
git add -A && git commit -m "chore(events): lint/format cleanup for primitive raycasting" || echo "nothing to fix"
```
