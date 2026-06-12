# Lighting Unification Implementation Plan (Epic 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-home three-flatland's bespoke 2D lighting onto three.js's standard TSL lighting seams (`LightsNode` + `LightingModel` + `lightingContext`) using real three.js light subclasses, layer-based scene isolation, and a per-material lights node — with zero performance or visual regression.

**Architecture:** Keep the existing ForwardPlus tiler and SDF shadow pass (they have no three.js equivalent), but wrap the tiler as a `FlatlandLightsNode extends LightsNode` and move the stylization (cel/rim/glow) into a `Flatland2DLightingModel extends LightingModel`. Sprite materials become real lit `NodeMaterial`s (`lights = true`, `lightsNode` = the tiled node, `normalNode` from `NormalMapProvider`) instead of carrying a monolithic `colorTransform`. Light primitives become subclasses of `THREE.PointLight`/`SpotLight`/`DirectionalLight`/`AmbientLight` carrying flatland extras (`importance`, `category`, `lit2D`) and a hierarchical lighting layer; a `lightCollector` selects which lights feed sprites, and layer-exclusion keeps 2D lights out of the 3D scene's default light node.

**Tech Stack:** TypeScript, three.js r183 (`three/webgpu`, `three/tsl`), Koota ECS, Vitest 2.1.8 (GPU mocked, node-graph-shape assertions), Playwright (`e2e/smoke-examples.spec.ts`), vitexec (live-browser screenshot + perf capture), pnpm + turborepo.

---

## Decisions (locked for this plan — flag the author if you need to change one)

- **D1 — Light primitives become subclasses.** Introduce `PointLight2D`, `SpotLight2D`, `DirectionalLight2D`, `AmbientLight2D` extending the matching `three` light. Each carries `importance`, `category` (+ cached `_categoryBucket`), a `lit2D = true` marker, and resolves a hierarchical `lightingLayer`. The legacy `Light2D` becomes a **deprecated factory** that returns the right subclass from `{ type }`, preserving `new Light2D({ type: 'point' })`. A codemod migrates call sites to the explicit subclasses.
- **D2 — Keep ForwardPlus; wrap it.** `FlatlandLightsNode extends LightsNode` owns tiling + SDF shadow injection. We do **not** import three's `examples/jsm` `TiledLightsNode` (fork-and-own territory); we mirror its integration contract (`setupLights` override emitting a texture loop).
- **D3 — Stylization moves to a LightingModel.** `Flatland2DLightingModel extends LightingModel`: `direct()` = N·L diffuse (+ rim), `indirect()` = ambient, `finish()` = cel-band / pixel-snap / glow shaping. Per-instance `lit` is preserved as a `select(readLitFlag(), litOutgoing, baseColor)` at the output — never a material split.
- **D4 — Sprite material becomes lit.** `EffectMaterial` keeps extending `MeshBasicNodeMaterial` (already a `NodeMaterial`) but sets `lights = true`, assigns `lightsNode`, and overrides `setupLightingModel()`. The 4-phase `colorNode` now produces **albedo only** (base + flip + atlas + color-chain `MaterialEffect`s); lighting is applied by `lightingContext`, not `colorTransform`. `colorTransform` is retained as a deprecated no-op-compatible shim for one release.
- **D5 — `lightCollector` selector.** Primitive: `(lights: Light[]) => Light[]`. Sugar: `string[]` token list compiled to a predicate over `category`. Default: lights whose `lightingLayer` matches the group/root. Exposed as a prop on `Flatland` and `SpriteGroup`.
- **D6 — Isolation via layer + per-material lightsNode.** 2D lights default onto `FLATLAND_LIGHTING_LAYER` (constant), which the flatland camera does **not** enable → excluded from the scene's default `LightsNode` → 3D meshes never see them. Sprites pull them in via `material.lightsNode`.
- **D7 — Regression gate.** Visual: vitexec screenshot goldens + pixel-diff. Performance: draw-call count + frame time captured via vitexec/Playwright stats. Both gates run at the end of every phase that can affect output (Phases 4–9).

---

## File Structure

**New files**
- `packages/three-flatland/src/lights/lights2d.ts` — `PointLight2D`, `SpotLight2D`, `DirectionalLight2D`, `AmbientLight2D`, shared `FlatlandLightMixin` helpers, `isFlatlandLight()`.
- `packages/three-flatland/src/lights/FlatlandLightsNode.ts` — `LightsNode` subclass wrapping ForwardPlus + SDF.
- `packages/three-flatland/src/lights/Flatland2DLightingModel.ts` — `LightingModel` subclass for the 2D stylization.
- `packages/three-flatland/src/lights/lightCollector.ts` — collector types + default + token-sugar compiler.
- `packages/three-flatland/src/lights/lightingLayers.ts` — `FLATLAND_LIGHTING_LAYER` constant + layer-propagation helper.
- `packages/three-flatland/codemods/light2d-to-subclasses.md` — consumer migration artifact.
- `test/regression/lighting-visual.spec.ts` — vitexec visual + perf gate (new top-level `test/regression/` dir).
- `test/regression/golden/` — committed golden PNGs.

**Modified files**
- `packages/three-flatland/src/lights/Light2D.ts` — convert class → deprecated factory + re-export subclasses.
- `packages/three-flatland/src/lights/index.ts` — export new symbols.
- `packages/three-flatland/src/lights/LightEffect.ts` — effect builds a `FlatlandLightsNode` + `Flatland2DLightingModel` bundle (not a raw `ColorTransformFn`).
- `packages/three-flatland/src/materials/EffectMaterial.ts` — lit-material wiring; albedo-only `colorNode`.
- `packages/three-flatland/src/materials/Sprite2DMaterial.ts` — `lightsNode`/`lightingModel`/`normalNode` plumbing.
- `packages/three-flatland/src/Flatland.ts` — `setLighting`, Light2D add/remove (tag-based), `lightCollector`, camera layer setup.
- `packages/three-flatland/src/pipeline/SpriteGroup.ts` — `lightCollector` prop + layer propagation.
- `packages/three-flatland/src/ecs/systems/lightSyncSystem.ts`, `lightEffectSystem.ts`, `lightMaterialAssignSystem.ts` — feed/update the node; install model once.
- `packages/three-flatland/src/ecs/traits.ts` — `LightingContext` field updates.
- `packages/presets/src/lighting/DefaultLightEffect.ts` — port loop math into `FlatlandLightsNode`/`Flatland2DLightingModel`.
- `packages/presets/src/lighting/NormalMapProvider.ts` — also drive `material.normalNode`.
- `examples/three/lighting/main.ts`, `examples/react/lighting/App.tsx` — migrate to subclasses; no visual change.
- `docs/` lighting pages (located in Task 9.3).

---

## Phase 0 — Safety Net (build BEFORE touching any lighting code)

Goal: make the current behavior fully observable so the migration can prove zero regression. Nothing in this phase changes production code.

### Task 0.1: Characterization tests for the current tiler + store

**Files:**
- Test: `packages/three-flatland/src/lights/ForwardPlusLighting.characterization.test.ts`
- Test: `packages/three-flatland/src/lights/LightStore.characterization.test.ts`

- [ ] **Step 1: Write characterization tests that lock current tiler output**

Capture the exact tile-assignment bytes for a fixed light set so any future refactor that changes assignment is caught. Mirror the existing test style (raw `Float32Array` reads, no GPU).

```typescript
// ForwardPlusLighting.characterization.test.ts
import { describe, it, expect } from 'vitest'
import { Vector2 } from 'three'
import { ForwardPlusLighting, TILE_SIZE, MAX_LIGHTS_PER_TILE } from './ForwardPlusLighting'
import { Light2D } from './Light2D'

describe('ForwardPlusLighting characterization (pre-unification baseline)', () => {
  it('produces a stable tile assignment for a fixed scene', () => {
    const fp = new ForwardPlusLighting()
    fp.init(128, 128)
    fp.setWorldBounds(new Vector2(128, 128), new Vector2(0, 0))

    const lights = [
      new Light2D({ type: 'point', position: [32, 32], intensity: 1, distance: 40, importance: 1 }),
      new Light2D({ type: 'point', position: [96, 96], intensity: 2, distance: 60, importance: 10 }),
      new Light2D({ type: 'ambient', intensity: 0.3 }),
    ]
    fp.update(lights)

    const data = Array.from(fp.tileTexture!.image.data as Float32Array)
    // Snapshot the assignment; future refactors must reproduce it byte-for-byte
    // unless the author intentionally updates this snapshot.
    expect(data).toMatchSnapshot()
    expect(TILE_SIZE).toBe(16)
    expect(MAX_LIGHTS_PER_TILE).toBe(16)
  })

  it('evicts lower-importance fill lights when a tile saturates', () => {
    const fp = new ForwardPlusLighting()
    fp.init(TILE_SIZE, TILE_SIZE) // single tile
    fp.setWorldBounds(new Vector2(TILE_SIZE, TILE_SIZE), new Vector2(0, 0))
    const lights = Array.from({ length: MAX_LIGHTS_PER_TILE + 4 }, (_, i) =>
      new Light2D({ type: 'point', position: [8, 8], intensity: 1, distance: 100, importance: i })
    )
    fp.update(lights)
    const data = fp.tileTexture!.image.data as Float32Array
    const slots: number[] = []
    for (let i = 0; i < MAX_LIGHTS_PER_TILE; i++) slots.push(data[i] | 0)
    // Highest-importance lights survive; index 0 (importance 0) is evicted.
    expect(slots).not.toContain(1) // lightIdx 0 + 1
    expect(slots.filter((s) => s !== 0).length).toBe(MAX_LIGHTS_PER_TILE)
  })
})
```

- [ ] **Step 2: Run to verify they pass against current code**

Run: `pnpm --filter three-flatland test -- ForwardPlusLighting.characterization`
Expected: PASS (snapshot written on first run).

- [ ] **Step 3: Add LightStore characterization (texel layout lock)**

```typescript
// LightStore.characterization.test.ts
import { describe, it, expect } from 'vitest'
import { LightStore } from './LightStore'
import { Light2D } from './Light2D'

describe('LightStore characterization (pre-unification baseline)', () => {
  it('packs Light2D into the documented 4-row texel layout', () => {
    const store = new LightStore()
    const light = new Light2D({
      type: 'spot', position: [10, 20], color: 0x804020, intensity: 1.5,
      distance: 200, decay: 2, angle: 0.5, penumbra: 0.25, category: 'torch',
    })
    store.sync([light])
    const tex = (store as unknown as { _lightsTexture: { image: { data: Float32Array }; needsUpdate: boolean } })._lightsTexture
    const d = tex.image.data
    const lineSize = tex.image && (store as unknown as { _maxLights: number })._maxLights * 4
    // Row 0: posX, posY, colorR, colorG
    expect(d[0]).toBeCloseTo(10)
    expect(d[1]).toBeCloseTo(20)
    expect(tex.needsUpdate).toBe(true)
    expect(d).toMatchSnapshot() // full layout lock
  })
})
```

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter three-flatland test -- characterization`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/ForwardPlusLighting.characterization.test.ts \
        packages/three-flatland/src/lights/LightStore.characterization.test.ts \
        packages/three-flatland/src/lights/__snapshots__/
git commit -m "test(lighting): characterization snapshots for tiler + store baseline"
```

### Task 0.2: Characterization test for the colorTransform context + per-instance lit gate

**Files:**
- Test: `packages/three-flatland/src/materials/EffectMaterial.lighting.characterization.test.ts`

- [ ] **Step 1: Write a node-shape test that locks the lighting application contract**

The migration must keep the same inputs available to lighting (color, atlasUV, worldPosition, resolved channels) and must keep the per-instance `lit` select. Assert node-graph shape (the established pattern).

```typescript
import { describe, it, expect, vi } from 'vitest'
import { vec4, vec2 } from 'three/tsl'
import { wrapWithLightFlags } from '../lights/wrapWithLightFlags'

const isNodeShaped = (v: unknown) => typeof (v as { toVar?: unknown }).toVar === 'function'

describe('lighting application contract (pre-unification baseline)', () => {
  it('wrapWithLightFlags gates the lit color with a per-instance select', () => {
    const lightFn = vi.fn((ctx: { color: unknown }) => vec4(1, 1, 1, 1))
    const wrapped = wrapWithLightFlags(lightFn as never)
    const ctx = { color: vec4(0.5, 0.5, 0.5, 1), atlasUV: vec2(0, 0), worldPosition: vec2(0, 0) }
    const out = wrapped(ctx as never)
    expect(lightFn).toHaveBeenCalledOnce()
    expect(isNodeShaped(out)).toBe(true) // a select() node
  })
})
```

- [ ] **Step 2: Run, then commit**

Run: `pnpm --filter three-flatland test -- EffectMaterial.lighting.characterization`
Expected: PASS.

```bash
git add packages/three-flatland/src/materials/EffectMaterial.lighting.characterization.test.ts
git commit -m "test(lighting): lock colorTransform lit-gate contract"
```

### Task 0.3: vitexec visual + perf baseline harness

**Files:**
- Create: `test/regression/lighting-visual.spec.ts`
- Create: `test/regression/capture.ts` (shared vitexec helper)
- Create: `test/regression/golden/.gitkeep`
- Modify: `package.json` (root) — add `test:regression` script

- [ ] **Step 1: Add the regression script**

In root `package.json` `scripts`, add:

```json
"test:regression": "tsx test/regression/run.ts"
```

- [ ] **Step 2: Write a deterministic capture helper using vitexec**

The lighting example exposes `__captureScene()` / `__endCapture()` console helpers and renders at base `/three/lighting/`. Drive a deterministic frame (fixed light positions, paused animation) and screenshot it.

```typescript
// test/regression/capture.ts
import { execFileSync } from 'node:child_process'

/** Run a vitexec snippet against the dev server and return stdout (browser logs). */
export function vitexec(snippet: string, args: string[] = []): string {
  return execFileSync('pnpm', ['exec', 'vitexec', snippet, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

/** Capture a deterministic screenshot of a lighting example to `outPath`. */
export function captureLightingScreenshot(path: string, outPath: string): void {
  vitexec(
    `
    // Pause animation and pin lights for determinism (example exposes a debug hook).
    globalThis.__flatlandDebug?.pauseAnimation?.();
    globalThis.__flatlandDebug?.pinLights?.();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    console.log('draws', JSON.stringify(globalThis.__flatlandDebug?.stats?.() ?? {}));
    `,
    ['--path', path, '--gpu', '--screenshot', outPath]
  )
}
```

- [ ] **Step 3: Add the deterministic debug hook to the example (test-only, behind a flag)**

Modify `examples/three/lighting/main.ts` to expose `globalThis.__flatlandDebug` when `import.meta.env.DEV`. It must expose `pauseAnimation()`, `pinLights()` (set every light to a fixed position/intensity/seed), and `stats()` returning `{ draws, fps }` from the renderer info.

```typescript
// near the end of examples/three/lighting/main.ts, after the render loop is set up
if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).__flatlandDebug = {
    pauseAnimation: () => { paused = true },          // `paused` gates the rAF update
    pinLights: () => {
      // deterministic, flicker-free pose for golden capture
      switchableTorches.forEach((t, i) => { t.intensity = 1.28; t.position.set(i === 0 ? -120 : 120, 40, 0) })
    },
    stats: () => ({ draws: renderer.info.render.drawCalls, fps: lastFps }),
  }
}
```

(`paused`, `switchableTorches`, `lastFps`, `renderer` already exist in the example; wire to the real symbols when implementing.)

- [ ] **Step 4: Write the regression spec (golden compare + draw-call assertion)**

```typescript
// test/regression/lighting-visual.spec.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { captureLightingScreenshot } from './capture'

const GOLDEN_DIR = join(__dirname, 'golden')
const CASES = [
  { name: 'three-lighting', path: '/three/lighting/' },
  { name: 'react-lighting', path: '/react/lighting/' },
]

describe('lighting visual regression', () => {
  for (const c of CASES) {
    it(`${c.name} matches golden within threshold`, () => {
      const actualPath = join(GOLDEN_DIR, `${c.name}.actual.png`)
      captureLightingScreenshot(c.path, actualPath)
      const goldenPath = join(GOLDEN_DIR, `${c.name}.png`)
      if (!existsSync(goldenPath)) {
        // First run: seed the golden, fail loudly so the author reviews + commits it.
        throw new Error(`No golden for ${c.name}; review ${actualPath} and copy to ${goldenPath}`)
      }
      const golden = PNG.sync.read(readFileSync(goldenPath))
      const actual = PNG.sync.read(readFileSync(actualPath))
      expect(actual.width).toBe(golden.width)
      const diff = new PNG({ width: golden.width, height: golden.height })
      const mismatched = pixelmatch(golden.data, actual.data, diff.data, golden.width, golden.height, { threshold: 0.1 })
      const ratio = mismatched / (golden.width * golden.height)
      expect(ratio).toBeLessThan(0.005) // <0.5% pixels may differ (AA/dither tolerance)
    })
  }
})
```

- [ ] **Step 5: Install dev deps for pixel diffing**

Run: `pnpm add -Dw pixelmatch pngjs @types/pixelmatch @types/pngjs`
Expected: added to root devDependencies.

- [ ] **Step 6: Seed goldens against CURRENT (pre-migration) code and commit**

Run (dev server must be up via `pnpm dev`): `pnpm test:regression` once to produce `*.actual.png`, review them visually, copy each to `<name>.png`.
Expected: goldens reflect current correct lighting.

```bash
git add test/regression/ package.json pnpm-lock.yaml \
        examples/three/lighting/main.ts
git commit -m "test(lighting): vitexec visual+perf regression baseline (goldens from current build)"
```

### Task 0.4: Coverage gap audit

**Files:** none (analysis task producing a checklist appended to this plan's tracking issue)

- [ ] **Step 1: Run coverage on the lights + materials surface**

Run: `pnpm --filter three-flatland test -- --coverage lights materials`
Expected: HTML/text coverage report.

- [ ] **Step 2: Confirm each public symbol has a behavioral test**

Verify there is at least one test asserting behavior (not just construction) for every export in `packages/three-flatland/src/lights/index.ts` and the `colorTransform`/`requiredChannels`/`lit` paths in `EffectMaterial`. For any uncovered symbol, add a characterization test in the matching `*.test.ts` before proceeding. Commit each addition:

```bash
git add packages/three-flatland/src/lights/<file>.test.ts
git commit -m "test(lighting): cover <symbol> behavior before unification"
```

- [ ] **Step 3: Gate check** — Do not start Phase 1 until `pnpm test` is green and `pnpm test:regression` passes against current code.

---

## Phase 1 — Architecture Spike (de-risk the seam before committing to it)

Goal: prove a sprite material can render through `lightsNode` + `LightingModel` with no extra draw calls, using a trivial passthrough, before porting real math. Output: validated signatures for `FlatlandLightsNode` and `Flatland2DLightingModel` that Phases 3–4 build on.

### Task 1.1: Spike a minimal lit sprite material

**Files:**
- Create (spike, throwaway): `packages/three-flatland/src/lights/__spike__/litSprite.spike.test.ts`

- [ ] **Step 1: Write a test that builds a NodeMaterial through the lighting pipeline and asserts node-shape**

```typescript
import { describe, it, expect } from 'vitest'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import LightsNode from 'three/src/nodes/lighting/LightsNode.js'
import LightingModel from 'three/src/nodes/core/LightingModel.js'
import { vec3 } from 'three/tsl'
import { PointLight } from 'three'

const isNodeShaped = (v: unknown) => typeof (v as { toVar?: unknown }).toVar === 'function'

describe('spike: lit sprite material wiring', () => {
  it('a NodeMaterial accepts a custom lightsNode + lighting model', () => {
    class StubModel extends LightingModel {
      direct({ lightColor, reflectedLight }: { lightColor: { toVar?: unknown }; reflectedLight: { directDiffuse: { addAssign: (n: unknown) => void } } }) {
        reflectedLight.directDiffuse.addAssign(lightColor)
      }
    }
    const mat = new MeshBasicNodeMaterial()
    mat.lights = true
    mat.lightsNode = new LightsNode().setLights([new PointLight()])
    ;(mat as unknown as { setupLightingModel: () => LightingModel }).setupLightingModel = () => new StubModel()
    expect(mat.lights).toBe(true)
    expect(isNodeShaped(mat.lightsNode as unknown)).toBe(false) // it's a LightsNode, not a value node
    expect(mat.lightsNode).toBeInstanceOf(LightsNode)
  })
})
```

- [ ] **Step 2: Run the spike test**

Run: `pnpm --filter three-flatland test -- litSprite.spike`
Expected: PASS — confirms the import paths and the `lights`/`lightsNode`/`setupLightingModel` triad exist in r183.

- [ ] **Step 3: Live draw-call proof via vitexec (manual, one-shot)**

In a scratch branch off the spike, temporarily flip one example sprite material to `lights = true` + a stub `LightsNode` + stub model, run the example, and capture draw calls:

Run: `pnpm exec vitexec "console.log('draws', globalThis.__flatlandDebug.stats().draws)" --path /three/lighting/ --gpu`
Expected: draw-call count equals the pre-spike baseline (proves lit materials do not split the batch).

- [ ] **Step 4: Record validated signatures, delete the spike, commit the finding**

Append the confirmed import paths + triad to this plan as a comment, delete `__spike__/`, and commit:

```bash
git rm -r packages/three-flatland/src/lights/__spike__
git commit -m "chore(lighting): architecture spike validated (lit material, no batch split) [no prod change]"
```

> **If Step 3 shows extra draw calls**, STOP and escalate: the batch-neutrality assumption is wrong and the whole approach needs rethinking before Phase 2.

---

## Phase 2 — Light Primitives (data layer)

### Task 2.1: Shared flatland-light mixin + layer constant

**Files:**
- Create: `packages/three-flatland/src/lights/lightingLayers.ts`
- Test: `packages/three-flatland/src/lights/lightingLayers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { Object3D } from 'three'
import { FLATLAND_LIGHTING_LAYER, applyLightingLayer } from './lightingLayers'

describe('lightingLayers', () => {
  it('defines a non-default layer (>0) reserved for flatland lights', () => {
    expect(FLATLAND_LIGHTING_LAYER).toBeGreaterThan(0)
    expect(FLATLAND_LIGHTING_LAYER).toBeLessThan(32)
  })
  it('applyLightingLayer sets exactly the given layer', () => {
    const o = new Object3D()
    applyLightingLayer(o, FLATLAND_LIGHTING_LAYER)
    expect(o.layers.test({ mask: 1 << FLATLAND_LIGHTING_LAYER } as never)).toBe(true)
    expect(o.layers.test({ mask: 1 } as never)).toBe(false) // not on default layer 0
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- lightingLayers`
Expected: FAIL ("Cannot find module './lightingLayers'").

- [ ] **Step 3: Implement**

```typescript
// lightingLayers.ts
import type { Object3D } from 'three'

/** Dedicated layer for flatland 2D lights; the flatland camera does NOT enable it,
 *  so these lights are excluded from the scene's default LightsNode (3D meshes never see them). */
export const FLATLAND_LIGHTING_LAYER = 10

/** Put an object on exactly `layer` (clears layer 0). */
export function applyLightingLayer(object: Object3D, layer: number): void {
  object.layers.set(layer)
}
```

- [ ] **Step 4: Run to verify pass; commit**

Run: `pnpm --filter three-flatland test -- lightingLayers`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/lightingLayers.ts packages/three-flatland/src/lights/lightingLayers.test.ts
git commit -m "feat(lighting): FLATLAND_LIGHTING_LAYER constant + layer helper"
```

### Task 2.2: `PointLight2D` (reference subclass)

**Files:**
- Create: `packages/three-flatland/src/lights/lights2d.ts`
- Test: `packages/three-flatland/src/lights/lights2d.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { PointLight } from 'three'
import { PointLight2D, isFlatlandLight } from './lights2d'
import { FLATLAND_LIGHTING_LAYER } from './lightingLayers'

describe('PointLight2D', () => {
  it('extends three PointLight and is no-arg constructible (R3F rule)', () => {
    const l = new PointLight2D()
    expect(l).toBeInstanceOf(PointLight)
    expect(isFlatlandLight(l)).toBe(true)
  })
  it('defaults onto the flatland lighting layer', () => {
    const l = new PointLight2D()
    expect(l.layers.test({ mask: 1 << FLATLAND_LIGHTING_LAYER } as never)).toBe(true)
  })
  it('carries flatland extras with neutral defaults', () => {
    const l = new PointLight2D()
    expect(l.importance).toBe(1)
    expect(l.category).toBeUndefined()
    expect(l.lit2D).toBe(true)
  })
  it('hashes category to a 2-bit bucket on set', () => {
    const l = new PointLight2D()
    l.category = 'slime'
    expect(l._categoryBucket).toBeGreaterThanOrEqual(0)
    expect(l._categoryBucket).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- lights2d`
Expected: FAIL ("Cannot find module './lights2d'").

- [ ] **Step 3: Implement `PointLight2D` + guard**

```typescript
// lights2d.ts
import { PointLight, SpotLight, DirectionalLight, AmbientLight, type Object3D } from 'three'
import { categoryToBucket } from './categoryHash'
import { FLATLAND_LIGHTING_LAYER, applyLightingLayer } from './lightingLayers'

const FLATLAND_LIGHT = Symbol.for('three-flatland.light')

export function isFlatlandLight(o: unknown): o is { importance: number; category?: string; _categoryBucket: number; lit2D: true } {
  return !!o && (o as Record<symbol, unknown>)[FLATLAND_LIGHT] === true
}

export class PointLight2D extends PointLight {
  readonly [FLATLAND_LIGHT] = true as const
  readonly lit2D = true as const
  importance = 1
  private _category: string | undefined = undefined
  _categoryBucket = 0
  constructor() {
    super()
    applyLightingLayer(this, FLATLAND_LIGHTING_LAYER)
  }
  get category(): string | undefined { return this._category }
  set category(v: string | undefined) {
    if (this._category === v) return
    this._category = v
    this._categoryBucket = categoryToBucket(v ?? '')
  }
}
```

- [ ] **Step 4: Run to verify pass; commit**

Run: `pnpm --filter three-flatland test -- lights2d`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/lights2d.ts packages/three-flatland/src/lights/lights2d.test.ts
git commit -m "feat(lighting): PointLight2D subclass with flatland extras + layer default"
```

### Task 2.3: `SpotLight2D`, `DirectionalLight2D`, `AmbientLight2D`

**Files:**
- Modify: `packages/three-flatland/src/lights/lights2d.ts`
- Test: `packages/three-flatland/src/lights/lights2d.test.ts`

- [ ] **Step 1: Extend the test for the three remaining subclasses**

```typescript
import { SpotLight, DirectionalLight, AmbientLight } from 'three'
import { SpotLight2D, DirectionalLight2D, AmbientLight2D } from './lights2d'

describe('other Light2D subclasses', () => {
  it('SpotLight2D extends SpotLight, tagged + layered', () => {
    const l = new SpotLight2D()
    expect(l).toBeInstanceOf(SpotLight)
    expect(isFlatlandLight(l)).toBe(true)
    expect(l.importance).toBe(1)
  })
  it('DirectionalLight2D extends DirectionalLight, tagged', () => {
    expect(new DirectionalLight2D()).toBeInstanceOf(DirectionalLight)
    expect(isFlatlandLight(new DirectionalLight2D())).toBe(true)
  })
  it('AmbientLight2D extends AmbientLight, tagged (no importance/category use)', () => {
    const l = new AmbientLight2D()
    expect(l).toBeInstanceOf(AmbientLight)
    expect(isFlatlandLight(l)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- lights2d`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement, factoring the shared extras into a helper**

Add a `defineFlatlandExtras(proto)` mixin applied in each constructor so importance/category/layer logic is not duplicated. Each subclass mirrors `PointLight2D`'s body but extends its respective base:

```typescript
function initFlatlandLight(self: Object3D & { importance?: number; _categoryBucket?: number }): void {
  self.importance = 1
  self._categoryBucket = 0
  applyLightingLayer(self, FLATLAND_LIGHTING_LAYER)
}

export class SpotLight2D extends SpotLight {
  readonly [FLATLAND_LIGHT] = true as const
  readonly lit2D = true as const
  importance = 1
  private _category: string | undefined
  _categoryBucket = 0
  constructor() { super(); initFlatlandLight(this) }
  get category() { return this._category }
  set category(v: string | undefined) { if (this._category === v) return; this._category = v; this._categoryBucket = categoryToBucket(v ?? '') }
}

export class DirectionalLight2D extends DirectionalLight {
  readonly [FLATLAND_LIGHT] = true as const
  readonly lit2D = true as const
  importance = 1
  _categoryBucket = 0
  constructor() { super(); initFlatlandLight(this) }
}

export class AmbientLight2D extends AmbientLight {
  readonly [FLATLAND_LIGHT] = true as const
  readonly lit2D = true as const
  importance = 1
  _categoryBucket = 0
  constructor() { super(); initFlatlandLight(this) }
}
```

- [ ] **Step 4: Run to verify pass; commit**

Run: `pnpm --filter three-flatland test -- lights2d`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/lights2d.ts packages/three-flatland/src/lights/lights2d.test.ts
git commit -m "feat(lighting): SpotLight2D, DirectionalLight2D, AmbientLight2D subclasses"
```

### Task 2.4: Convert `Light2D` to a deprecated factory

**Files:**
- Modify: `packages/three-flatland/src/lights/Light2D.ts`
- Test: `packages/three-flatland/src/lights/Light2D.test.ts`

- [ ] **Step 1: Add a test asserting the factory returns the right subclass and maps options**

```typescript
import { describe, it, expect } from 'vitest'
import { Light2D } from './Light2D'
import { PointLight2D, SpotLight2D, DirectionalLight2D, AmbientLight2D } from './lights2d'

describe('Light2D deprecated factory', () => {
  it('maps {type} to the matching subclass', () => {
    expect(new Light2D({ type: 'point' })).toBeInstanceOf(PointLight2D)
    expect(new Light2D({ type: 'spot' })).toBeInstanceOf(SpotLight2D)
    expect(new Light2D({ type: 'directional' })).toBeInstanceOf(DirectionalLight2D)
    expect(new Light2D({ type: 'ambient' })).toBeInstanceOf(AmbientLight2D)
  })
  it('maps legacy options onto the subclass', () => {
    const l = new Light2D({ type: 'point', position: [10, 20], intensity: 2, distance: 50, importance: 7, category: 'fire' }) as PointLight2D
    expect(l.position.x).toBe(10)
    expect(l.position.y).toBe(20)
    expect(l.intensity).toBe(2)
    expect(l.distance).toBe(50)
    expect(l.importance).toBe(7)
    expect(l.category).toBe('fire')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- Light2D.test`
Expected: FAIL (factory not yet implemented; existing class behavior differs).

- [ ] **Step 3: Replace the class with a factory that constructs subclasses**

Rewrite `Light2D.ts` so `Light2D` is a function returning a subclass instance, preserving `new Light2D(opts)` (a constructor returning an object yields that object). Keep `Light2DOptions`/`Light2DType` types. Map `position`, `direction`, `color`, `intensity`, `distance`, `decay`, `angle`, `penumbra`, `castsShadow`, `importance`, `category` onto the subclass. Mark `@deprecated` in TSDoc pointing to the subclasses.

```typescript
import { Color } from 'three'
import { PointLight2D, SpotLight2D, DirectionalLight2D, AmbientLight2D } from './lights2d'
export type Light2DType = 'point' | 'directional' | 'spot' | 'ambient'
export interface Light2DOptions { /* unchanged from current file */ }

/** @deprecated Use PointLight2D / SpotLight2D / DirectionalLight2D / AmbientLight2D directly. */
export function Light2D(options: Light2DOptions = {}) {
  const type = options.type ?? 'point'
  const light = type === 'spot' ? new SpotLight2D()
    : type === 'directional' ? new DirectionalLight2D()
    : type === 'ambient' ? new AmbientLight2D()
    : new PointLight2D()
  if (options.position) light.position.set(options.position[0] ?? (options.position as { x: number }).x, /* y */ Array.isArray(options.position) ? options.position[1] : (options.position as { y: number }).y, 0)
  if (options.color != null) (light as { color: Color }).color = new Color(options.color)
  if (options.intensity != null) light.intensity = options.intensity
  if ('distance' in light && options.distance != null) (light as { distance: number }).distance = options.distance
  if ('decay' in light && options.decay != null) (light as { decay: number }).decay = options.decay
  if (options.importance != null) (light as { importance: number }).importance = options.importance
  if (options.category != null) (light as { category?: string }).category = options.category
  // spot-only: angle, penumbra; directional/spot: direction → target
  return light
}
```

(When implementing, faithfully port the `direction → target` and `angle`/`penumbra` mapping from the current class; cover them with the test from Step 1 extended accordingly.)

- [ ] **Step 4: Run full lights suite (factory + characterization must still pass); commit**

Run: `pnpm --filter three-flatland test -- lights`
Expected: PASS (characterization snapshots from Phase 0 still hold because subclasses produce identical store packing).

```bash
git add packages/three-flatland/src/lights/Light2D.ts packages/three-flatland/src/lights/Light2D.test.ts
git commit -m "refactor(lighting)!: Light2D becomes deprecated factory over real-light subclasses"
```

### Task 2.5: Export new symbols + regenerate React wrappers

**Files:**
- Modify: `packages/three-flatland/src/lights/index.ts`

- [ ] **Step 1: Add exports**

```typescript
export { PointLight2D, SpotLight2D, DirectionalLight2D, AmbientLight2D, isFlatlandLight } from './lights2d'
export { FLATLAND_LIGHTING_LAYER, applyLightingLayer } from './lightingLayers'
```

- [ ] **Step 2: Regenerate React subpaths and typecheck**

Run: `pnpm sync:react && pnpm typecheck`
Expected: no changes needed beyond barrel (category dir unchanged), typecheck PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/three-flatland/src/lights/index.ts packages/three-flatland/src/react/lights/
git commit -m "feat(lighting): export Light2D subclasses + layer helpers"
```

---

## Phase 3 — `FlatlandLightsNode` (tiler + shadow as a LightsNode)

### Task 3.1: `FlatlandLightsNode` skeleton extending `LightsNode`

**Files:**
- Create: `packages/three-flatland/src/lights/FlatlandLightsNode.ts`
- Test: `packages/three-flatland/src/lights/FlatlandLightsNode.test.ts`

- [ ] **Step 1: Write the failing test (construction + light feeding)**

```typescript
import { describe, it, expect } from 'vitest'
import { Vector2 } from 'three'
import LightsNode from 'three/src/nodes/lighting/LightsNode.js'
import { FlatlandLightsNode } from './FlatlandLightsNode'
import { PointLight2D } from './lights2d'

describe('FlatlandLightsNode', () => {
  it('is a LightsNode', () => {
    expect(new FlatlandLightsNode()).toBeInstanceOf(LightsNode)
  })
  it('accepts flatland lights and world bounds, packs the tiler', () => {
    const node = new FlatlandLightsNode()
    node.setWorldBounds(new Vector2(128, 128), new Vector2(0, 0))
    const l = new PointLight2D(); l.position.set(32, 32, 0); l.intensity = 1; l.distance = 40
    node.updateLights([l])
    // The internal ForwardPlus tile texture is populated (CPU side, no GPU).
    expect(node.tileTexture).toBeDefined()
    expect((node.tileTexture!.image.data as Float32Array).some((v) => v !== 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- FlatlandLightsNode`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the skeleton — own a `ForwardPlusLighting`, expose update**

```typescript
import LightsNode from 'three/src/nodes/lighting/LightsNode.js'
import { Vector2, type Light } from 'three'
import { ForwardPlusLighting } from './ForwardPlusLighting'
import { LightStore } from './LightStore'

export class FlatlandLightsNode extends LightsNode {
  readonly forwardPlus = new ForwardPlusLighting()
  readonly store = new LightStore()
  private _bounds = { size: new Vector2(), offset: new Vector2() }
  get tileTexture() { return this.forwardPlus.tileTexture }

  setWorldBounds(size: Vector2, offset: Vector2): void {
    this._bounds.size.copy(size); this._bounds.offset.copy(offset)
    this.forwardPlus.setWorldBounds(size, offset)
  }
  updateLights(lights: Light[]): void {
    this.store.sync(lights)
    this.forwardPlus.update(lights)
  }
}
```

(`LightStore.sync` and `ForwardPlus.update` already accept the light shape; flatland subclasses satisfy it because they expose `position`, `color`, `intensity`, `distance`, `importance`, `_categoryBucket`. Verify property reads in `LightStore.sync` accept the subclass — adjust `LightStore` to read from `Light` props rather than the old `Light2D` getters if needed, covered by Task 3.2.)

- [ ] **Step 4: Run to verify pass; commit**

Run: `pnpm --filter three-flatland test -- FlatlandLightsNode`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/FlatlandLightsNode.ts packages/three-flatland/src/lights/FlatlandLightsNode.test.ts
git commit -m "feat(lighting): FlatlandLightsNode skeleton wrapping ForwardPlus + LightStore"
```

### Task 3.2: Adapt `LightStore.sync` to read from three.js light subclasses

**Files:**
- Modify: `packages/three-flatland/src/lights/LightStore.ts`
- Test: `packages/three-flatland/src/lights/LightStore.test.ts`

- [ ] **Step 1: Add a test that `sync` packs a `PointLight2D` identically to the legacy snapshot**

```typescript
import { PointLight2D, SpotLight2D } from './lights2d'

it('packs PointLight2D the same as the legacy Light2D layout', () => {
  const store = new LightStore()
  const l = new PointLight2D()
  l.position.set(10, 20, 0); l.intensity = 1.5; l.distance = 200; l.decay = 2; l.category = 'torch'
  store.sync([l])
  const d = (store as unknown as { _lightsTexture: { image: { data: Float32Array } } })._lightsTexture.image.data
  expect(d[0]).toBeCloseTo(10) // posX
  expect(d[1]).toBeCloseTo(20) // posY
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- LightStore.test`
Expected: FAIL if `sync` reads removed `Light2D` getters (e.g. `position2D`, `getUniforms`).

- [ ] **Step 3: Update `sync` to read standard light props**

Read `light.position.x/y`, `light.color.r/g/b`, `light.intensity`, `(light as PointLight).distance`, `(light as PointLight).decay`, spot `angle`/`penumbra`, type derived from `instanceof`, `castShadow` (three's native boolean) for the shadow flag, `importance`/`_categoryBucket` via `isFlatlandLight`. Map `lightType` integer from `instanceof PointLight2D/SpotLight2D/DirectionalLight2D/AmbientLight2D`. Keep the row/column layout byte-identical so Phase 0 snapshots hold.

- [ ] **Step 4: Run store + characterization; commit**

Run: `pnpm --filter three-flatland test -- LightStore`
Expected: PASS (including `LightStore.characterization`).

```bash
git add packages/three-flatland/src/lights/LightStore.ts packages/three-flatland/src/lights/LightStore.test.ts
git commit -m "refactor(lighting): LightStore.sync reads standard three.js light props"
```

### Task 3.3: `setupLights` override — emit the tiled loop + SDF, call `setupDirectLight`

**Files:**
- Modify: `packages/three-flatland/src/lights/FlatlandLightsNode.ts`
- Modify: `packages/presets/src/lighting/DefaultLightEffect.ts` (source the loop body)
- Test: `packages/three-flatland/src/lights/FlatlandLightsNode.test.ts`

- [ ] **Step 1: Write a node-shape test for the emitted lighting node**

```typescript
it('setupLights returns a node-shaped lighting graph', () => {
  const node = new FlatlandLightsNode()
  node.setWorldBounds(new Vector2(64, 64), new Vector2(0, 0))
  // Minimal fake builder exposing the fields setupLights touches; assert it builds without throwing.
  expect(() => node.buildLoopForTest()).not.toThrow()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- FlatlandLightsNode`
Expected: FAIL (`buildLoopForTest` missing).

- [ ] **Step 3: Port the DefaultLightEffect per-fragment loop into `setupLights`**

Transcribe the existing, working loop from `DefaultLightEffect`'s `colorTransformFn` (tile lookup → `Loop(MAX_LIGHTS_PER_TILE)` → unpack row0..row3 → attenuation/cone → SDF `shadowSDF2D` per shadowing light) into `FlatlandLightsNode.setupLights`. For each light, compute `lightColor` (color × intensity × attenuation × cone × **shadow**) and `lightDirection` (the 3D direction `vec3(toLightN, lightHeight - elevation)`), then call `builder.lightsNode.setupDirectLight(builder, this, { lightDirection, lightColor })` so the active `LightingModel.direct()` receives pre-shadowed light. Expose a thin `buildLoopForTest()` that runs the builder against a stub for the unit test. **Do not** re-derive the math — relocate it verbatim; this is transcription, not redesign.

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- FlatlandLightsNode`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/FlatlandLightsNode.ts packages/presets/src/lighting/DefaultLightEffect.ts \
        packages/three-flatland/src/lights/FlatlandLightsNode.test.ts
git commit -m "feat(lighting): FlatlandLightsNode.setupLights emits tiled loop + SDF shadow, pre-shadowed lightColor"
```

---

## Phase 4 — `Flatland2DLightingModel` (stylization)

### Task 4.1: `direct()` + `indirect()` (diffuse + ambient)

**Files:**
- Create: `packages/three-flatland/src/lights/Flatland2DLightingModel.ts`
- Test: `packages/three-flatland/src/lights/Flatland2DLightingModel.test.ts`

- [ ] **Step 1: Write a node-shape test for `direct`/`indirect`**

```typescript
import { describe, it, expect } from 'vitest'
import { vec3, float } from 'three/tsl'
import { Flatland2DLightingModel } from './Flatland2DLightingModel'

describe('Flatland2DLightingModel', () => {
  it('direct() accumulates N·L diffuse into reflectedLight', () => {
    const model = new Flatland2DLightingModel({ bands: 0, rim: 0, glow: 0 })
    const adds: unknown[] = []
    const reflectedLight = { directDiffuse: { addAssign: (n: unknown) => adds.push(n) }, indirectDiffuse: { addAssign: () => {} } }
    model.direct({ lightDirection: vec3(0, 0, 1), lightColor: vec3(1, 1, 1), reflectedLight } as never)
    expect(adds.length).toBe(1)
    expect(typeof (adds[0] as { toVar?: unknown }).toVar).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- Flatland2DLightingModel`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `direct`/`indirect`**

```typescript
import LightingModel from 'three/src/nodes/core/LightingModel.js'
import { normalView, float, vec3 } from 'three/tsl'

export interface Flatland2DLightingModelOptions { bands?: number; rim?: number; glow?: number }

export class Flatland2DLightingModel extends LightingModel {
  constructor(private opts: Flatland2DLightingModelOptions = {}) { super() }
  direct({ lightDirection, lightColor, reflectedLight }: { lightDirection: ReturnType<typeof vec3>; lightColor: ReturnType<typeof vec3>; reflectedLight: { directDiffuse: { addAssign: (n: unknown) => void } } }) {
    const NdotL = normalView.dot(lightDirection).clamp()
    reflectedLight.directDiffuse.addAssign(lightColor.mul(NdotL))
  }
  indirect(builder: { context: { irradiance?: unknown; reflectedLight: { indirectDiffuse: { addAssign: (n: unknown) => void } } } }) {
    if (builder.context.irradiance) builder.context.reflectedLight.indirectDiffuse.addAssign(builder.context.irradiance)
  }
}
```

(Ambient is supplied via the `lightsNode` ambient path / `context.irradiance`; the `AmbientLight2D` contributes through the standard ambient accumulation.)

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- Flatland2DLightingModel`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/Flatland2DLightingModel.ts packages/three-flatland/src/lights/Flatland2DLightingModel.test.ts
git commit -m "feat(lighting): Flatland2DLightingModel direct/indirect (N·L diffuse + ambient)"
```

### Task 4.2: `finish()` — cel-band / pixel-snap / glow shaping

**Files:**
- Modify: `packages/three-flatland/src/lights/Flatland2DLightingModel.ts`
- Test: `packages/three-flatland/src/lights/Flatland2DLightingModel.test.ts`

- [ ] **Step 1: Add a test that `finish` is a no-op when all style options are 0, and node-shaped otherwise**

```typescript
it('finish() shapes outgoing light only when style options are enabled', () => {
  const off = new Flatland2DLightingModel({ bands: 0 })
  expect(off.shapesOutput()).toBe(false)
  const on = new Flatland2DLightingModel({ bands: 4 })
  expect(on.shapesOutput()).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- Flatland2DLightingModel`
Expected: FAIL (`shapesOutput` missing).

- [ ] **Step 3: Implement `finish` + `shapesOutput`, porting the band/glow/pixel-snap math from `DefaultLightEffect`**

Transcribe the cel-band quantization, pixel-snap, and glow shaping from the existing effect's post-accumulation code into `finish(builder)`, reading `builder.context.reflectedLight.directDiffuse` and writing the shaped result back. `shapesOutput()` returns `true` iff any style option is non-zero (lets Phase 5 decide whether to install the model's finish path).

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- Flatland2DLightingModel`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/Flatland2DLightingModel.ts packages/three-flatland/src/lights/Flatland2DLightingModel.test.ts
git commit -m "feat(lighting): Flatland2DLightingModel.finish ports cel/pixel-snap/glow shaping"
```

---

## Phase 5 — Material Integration

### Task 5.1: Lit `EffectMaterial` — albedo-only colorNode + lighting triad

**Files:**
- Modify: `packages/three-flatland/src/materials/EffectMaterial.ts`
- Modify: `packages/three-flatland/src/materials/Sprite2DMaterial.ts`
- Test: `packages/three-flatland/src/materials/EffectMaterial.lighting.test.ts`

- [ ] **Step 1: Write a test that a lit material exposes the triad and produces albedo-only colorNode**

```typescript
import { describe, it, expect } from 'vitest'
import { Sprite2DMaterial } from './Sprite2DMaterial'
import { FlatlandLightsNode } from '../lights/FlatlandLightsNode'

describe('lit EffectMaterial', () => {
  it('sets lights=true and accepts a lightsNode + lighting model', () => {
    const mat = new Sprite2DMaterial()
    const node = new FlatlandLightsNode()
    mat.setFlatlandLighting(node, { bands: 0 })
    expect(mat.lights).toBe(true)
    expect(mat.lightsNode).toBe(node)
    expect(typeof (mat as unknown as { setupLightingModel: () => unknown }).setupLightingModel).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- EffectMaterial.lighting`
Expected: FAIL (`setFlatlandLighting` missing).

- [ ] **Step 3: Implement `setFlatlandLighting` + albedo-only colorNode**

Add `setFlatlandLighting(node: FlatlandLightsNode, style: Flatland2DLightingModelOptions)` to `EffectMaterial`: sets `this.lights = true`, `this.lightsNode = node`, stores style, and overrides `setupLightingModel()` to return a `Flatland2DLightingModel`. Modify `_rebuildColorNode()` so **Phase 2 (colorTransform/lighting) is removed** — the `colorNode` now returns albedo (base + flip + atlas + Phase-1 channels still resolved for `normalNode`, + Phase-3 color-chain MaterialEffects). Wire resolved `normal` channel into `this.normalNode` (Task 5.2). Apply the per-instance lit select by overriding `setupOutgoingLight()` to `select(readLitFlag(), litOutgoing, this.colorNode)`.

- [ ] **Step 4: Run; ensure existing material tests still pass; commit**

Run: `pnpm --filter three-flatland test -- materials`
Expected: PASS.

```bash
git add packages/three-flatland/src/materials/EffectMaterial.ts packages/three-flatland/src/materials/Sprite2DMaterial.ts \
        packages/three-flatland/src/materials/EffectMaterial.lighting.test.ts
git commit -m "feat(lighting): lit Sprite2DMaterial via lightsNode + LightingModel; albedo-only colorNode; per-instance lit select preserved"
```

### Task 5.2: Drive `normalNode` from `NormalMapProvider`

**Files:**
- Modify: `packages/presets/src/lighting/NormalMapProvider.ts`
- Test: `packages/presets/src/lighting/NormalMapProvider.test.ts`

- [ ] **Step 1: Add a test that the provider yields a node-shaped normal usable as `normalNode`**

```typescript
import { describe, it, expect } from 'vitest'
import { NormalMapProvider } from './NormalMapProvider'

const isNodeShaped = (v: unknown) => typeof (v as { toVar?: unknown }).toVar === 'function'

describe('NormalMapProvider normalNode', () => {
  it('exposes a node-shaped tangent-space normal', () => {
    const p = new NormalMapProvider()
    const node = p.buildNormalNode({ atlasUV: undefined } as never)
    expect(isNodeShaped(node)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter presets test -- NormalMapProvider`
Expected: FAIL (`buildNormalNode` missing).

- [ ] **Step 3: Expose `buildNormalNode` (reuse the existing channel node), keep instance-flip correction**

Refactor the existing `channelNode('normal', …)` body into a reusable `buildNormalNode(ctx)` and have the channel path delegate to it. The material (Task 5.1) calls it to set `material.normalNode` so the standard `normalView` in the lighting model reflects the mapped normal. Preserve instance-flip mirroring.

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter presets test -- NormalMapProvider`
Expected: PASS.

```bash
git add packages/presets/src/lighting/NormalMapProvider.ts packages/presets/src/lighting/NormalMapProvider.test.ts
git commit -m "feat(lighting): NormalMapProvider drives material.normalNode (idiomatic three.js path)"
```

---

## Phase 6 — Light Collection & Isolation

### Task 6.1: `lightCollector` selector + token sugar

**Files:**
- Create: `packages/three-flatland/src/lights/lightCollector.ts`
- Test: `packages/three-flatland/src/lights/lightCollector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { PointLight2D } from './lights2d'
import { resolveLightCollector, defaultLightCollector } from './lightCollector'

describe('lightCollector', () => {
  it('default selects flatland lights on the lighting layer', () => {
    const a = new PointLight2D(); const b = new PointLight2D()
    expect(defaultLightCollector([a, b])).toEqual([a, b])
  })
  it('token list compiles to a category predicate', () => {
    const fire = new PointLight2D(); fire.category = 'fire'
    const slime = new PointLight2D(); slime.category = 'slime'
    const collect = resolveLightCollector(['fire'])
    expect(collect([fire, slime])).toEqual([fire])
  })
  it('passes through a custom function', () => {
    const collect = resolveLightCollector((ls) => ls.slice(0, 1))
    const a = new PointLight2D(); const b = new PointLight2D()
    expect(collect([a, b])).toEqual([a])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- lightCollector`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
import type { Light } from 'three'
import { isFlatlandLight } from './lights2d'

export type LightCollector = (lights: Light[]) => Light[]
export type LightCollectorSpec = LightCollector | string[]

export const defaultLightCollector: LightCollector = (lights) => lights.filter((l) => isFlatlandLight(l))

export function resolveLightCollector(spec?: LightCollectorSpec): LightCollector {
  if (!spec) return defaultLightCollector
  if (typeof spec === 'function') return spec
  const tokens = new Set(spec)
  return (lights) => lights.filter((l) => isFlatlandLight(l) && l.category != null && tokens.has(l.category))
}
```

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- lightCollector`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/lightCollector.ts packages/three-flatland/src/lights/lightCollector.test.ts
git commit -m "feat(lighting): lightCollector selector primitive + token-list sugar"
```

### Task 6.2: Flatland camera layer setup + tag-based light add/remove

**Files:**
- Modify: `packages/three-flatland/src/Flatland.ts`
- Test: `packages/three-flatland/src/Flatland.lighting.test.ts`

- [ ] **Step 1: Write a test that the flatland camera does NOT enable the lighting layer, and lights are tracked by tag**

```typescript
import { describe, it, expect } from 'vitest'
import { Flatland } from './Flatland'
import { PointLight2D } from './lights/lights2d'
import { FLATLAND_LIGHTING_LAYER } from './lights/lightingLayers'

describe('Flatland light isolation', () => {
  it('camera does not enable the flatland lighting layer', () => {
    const fl = new Flatland({ viewSize: 100 })
    expect(fl.camera.layers.test({ mask: 1 << FLATLAND_LIGHTING_LAYER } as never)).toBe(false)
  })
  it('tracks flatland lights by tag on add/remove', () => {
    const fl = new Flatland({ viewSize: 100 })
    const l = new PointLight2D()
    fl.add(l)
    expect(fl.lights).toContain(l)
    fl.remove(l)
    expect(fl.lights).not.toContain(l)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- Flatland.lighting`
Expected: FAIL (add/remove still keys on `instanceof Light2D`; `fl.lights` accessor may be missing).

- [ ] **Step 3: Implement — `isFlatlandLight` interception + camera layers**

In `Flatland.add`/`remove`, replace `child instanceof Light2D` with `isFlatlandLight(child)`. Ensure the constructor leaves the camera on layer 0 only (default) and never enables `FLATLAND_LIGHTING_LAYER`. Expose a public `get lights()`.

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- Flatland.lighting`
Expected: PASS.

```bash
git add packages/three-flatland/src/Flatland.ts packages/three-flatland/src/Flatland.lighting.test.ts
git commit -m "feat(lighting): tag-based light tracking + camera excludes lighting layer (3D isolation)"
```

### Task 6.3: `lightCollector` prop on Flatland + SpriteGroup, with layer propagation

**Files:**
- Modify: `packages/three-flatland/src/Flatland.ts`
- Modify: `packages/three-flatland/src/pipeline/SpriteGroup.ts`
- Test: `packages/three-flatland/src/pipeline/SpriteGroup.lighting.test.ts`

- [ ] **Step 1: Write a test that a SpriteGroup propagates its lighting layer to child flatland lights and applies its collector**

```typescript
import { describe, it, expect } from 'vitest'
import { SpriteGroup } from './SpriteGroup'
import { PointLight2D } from '../lights/lights2d'

describe('SpriteGroup lighting layer propagation', () => {
  it('pushes the group lighting layer down to added flatland lights', () => {
    const group = new SpriteGroup({ lightingLayer: 12 })
    const l = new PointLight2D()
    group.add(l)
    expect(l.layers.test({ mask: 1 << 12 } as never)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- SpriteGroup.lighting`
Expected: FAIL.

- [ ] **Step 3: Implement — `lightingLayer` + `lightCollector` options, propagate on add**

Add `lightingLayer?: number` and `lightCollector?: LightCollectorSpec` to `SpriteGroup` and `Flatland` options. On adding a flatland light (detected via `isFlatlandLight`), call `applyLightingLayer(child, this.lightingLayer)` (since `Object3D.layers` is not inherited). Store the resolved collector for the lighting context to use when feeding `FlatlandLightsNode`.

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- SpriteGroup.lighting`
Expected: PASS.

```bash
git add packages/three-flatland/src/pipeline/SpriteGroup.ts packages/three-flatland/src/Flatland.ts \
        packages/three-flatland/src/pipeline/SpriteGroup.lighting.test.ts
git commit -m "feat(lighting): lightCollector + hierarchical lightingLayer on Flatland/SpriteGroup"
```

---

## Phase 7 — ECS Wiring

### Task 7.1: `LightEffect` builds a node+model bundle

**Files:**
- Modify: `packages/three-flatland/src/lights/LightEffect.ts`
- Modify: `packages/presets/src/lighting/DefaultLightEffect.ts`
- Test: `packages/three-flatland/src/lights/LightEffect.test.ts`

- [ ] **Step 1: Add a test that an effect yields a `FlatlandLightsNode` + style options**

```typescript
import { DefaultLightEffect } from '@three-flatland/presets/lighting'
import { FlatlandLightsNode } from './FlatlandLightsNode'

it('DefaultLightEffect builds a FlatlandLightsNode bundle', () => {
  const effect = new DefaultLightEffect()
  const bundle = effect.buildLightingBundle()
  expect(bundle.node).toBeInstanceOf(FlatlandLightsNode)
  expect(typeof bundle.style.bands).toBe('number')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- LightEffect`
Expected: FAIL (`buildLightingBundle` missing).

- [ ] **Step 3: Implement `buildLightingBundle()` replacing `_buildLightFn`**

`LightEffect.buildLightingBundle()` returns `{ node: FlatlandLightsNode, style: Flatland2DLightingModelOptions }`. `DefaultLightEffect` maps its uniforms (bands, glow, rim, shadow params, lightHeight) onto the node config + style. Keep `_buildLightFn` as a deprecated shim that throws a helpful error pointing to `buildLightingBundle` (it is internal; no consumer codemod needed).

- [ ] **Step 4: Run; commit**

Run: `pnpm --filter three-flatland test -- LightEffect`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/LightEffect.ts packages/presets/src/lighting/DefaultLightEffect.ts \
        packages/three-flatland/src/lights/LightEffect.test.ts
git commit -m "feat(lighting): LightEffect.buildLightingBundle yields FlatlandLightsNode + style"
```

### Task 7.2: Update the three lighting systems

**Files:**
- Modify: `packages/three-flatland/src/ecs/systems/lightSyncSystem.ts`
- Modify: `packages/three-flatland/src/ecs/systems/lightEffectSystem.ts`
- Modify: `packages/three-flatland/src/ecs/systems/lightMaterialAssignSystem.ts`
- Modify: `packages/three-flatland/src/ecs/traits.ts`
- Test: existing `*.test.ts` for these systems + a new integration test in Task 8

- [ ] **Step 1: Update `LightingContext` trait fields**

Replace `wrappedLightFn`/`requiredChannels`-for-colorTransform with `lightsNode: FlatlandLightsNode | null`, `style: Flatland2DLightingModelOptions`, and `collector: LightCollector`. Keep `materials`, `dirty`, `lights`, `renderer`, `camera`, `worldSize`, `worldOffset`.

- [ ] **Step 2: Update `lightSyncSystem` — feed the node via the collector**

```typescript
export function lightSyncSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return
  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx?.effect?.enabled || !ctx.lightsNode) return
  ctx.lightsNode.updateLights(ctx.collector(ctx.lights))
}
```

- [ ] **Step 3: Update `lightEffectSystem` — set world bounds + run SDF pre-pass on the node**

Replace `effect.init/update` calls with: compute world bounds from camera (unchanged), `ctx.lightsNode.setWorldBounds(size, offset)`, and trigger the SDF pre-pass (the `ShadowPipeline` system still owns the generator; the node references the resulting SDF texture).

- [ ] **Step 4: Update `lightMaterialAssignSystem` — install lightsNode + model once**

```typescript
export function lightMaterialAssignSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return
  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx?.dirty) return
  ctx.dirty = false
  for (const mat of ctx.materials) {
    if (ctx.lightsNode) mat.setFlatlandLighting(ctx.lightsNode, ctx.style)
    else mat.clearFlatlandLighting()
  }
}
```

- [ ] **Step 5: Run system tests; commit**

Run: `pnpm --filter three-flatland test -- ecs/systems`
Expected: PASS (update the existing system tests to the new trait shape as part of this task).

```bash
git add packages/three-flatland/src/ecs/
git commit -m "refactor(lighting): ECS systems feed FlatlandLightsNode + install LightingModel once"
```

### Task 7.3: Rewire `Flatland.setLighting`

**Files:**
- Modify: `packages/three-flatland/src/Flatland.ts`
- Test: `packages/three-flatland/src/Flatland.lighting.test.ts`

- [ ] **Step 1: Add a test that `setLighting` populates the node-based LightingContext**

```typescript
it('setLighting installs a FlatlandLightsNode-based context', () => {
  const fl = new Flatland({ viewSize: 100 })
  fl.setLighting(new DefaultLightEffect())
  const ctx = (fl as unknown as { _getLightingContext: () => { lightsNode: unknown } })._getLightingContext()
  expect(ctx.lightsNode).toBeInstanceOf(FlatlandLightsNode)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter three-flatland test -- Flatland.lighting`
Expected: FAIL.

- [ ] **Step 3: Implement — build the bundle, store node+style+collector in context, mark dirty**

`setLighting` calls `effect.buildLightingBundle()`, stores `node`/`style`/`resolveLightCollector(this._lightCollector)` into `LightingContext`, and marks dirty so the assign system installs it. Remove the old `_buildLightFn`/`wrapWithLightFlags` path.

- [ ] **Step 4: Run full package test; commit**

Run: `pnpm --filter three-flatland test`
Expected: PASS.

```bash
git add packages/three-flatland/src/Flatland.ts packages/three-flatland/src/Flatland.lighting.test.ts
git commit -m "refactor(lighting): Flatland.setLighting wires node+model bundle through ECS"
```

---

## Phase 8 — Integration Tests (prove it works end to end)

### Task 8.1: Headless integration test — lit batch renders one draw call with mixed lit/unlit

**Files:**
- Create: `packages/three-flatland/src/lights/integration.lit-batch.test.ts`

- [ ] **Step 1: Write an integration test exercising the full assembly at node-graph level**

Build a `Flatland`, add a `SpriteGroup` with two sprites (`lit = true` and `lit = false`), add a `PointLight2D`, `setLighting(new DefaultLightEffect())`, run the ECS systems once, and assert: (a) both sprites share one material instance, (b) the material has `lights = true` and a `FlatlandLightsNode`, (c) the per-instance lit select node exists on the outgoing path.

```typescript
import { describe, it, expect } from 'vitest'
import { Flatland } from '../Flatland'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { PointLight2D } from './lights2d'
import { DefaultLightEffect } from '@three-flatland/presets/lighting'
import { FlatlandLightsNode } from './FlatlandLightsNode'

describe('integration: lit batch', () => {
  it('mixed lit/unlit sprites share one lit material (no batch split)', () => {
    const fl = new Flatland({ viewSize: 256 })
    const group = new SpriteGroup()
    // ... add two sprites with lit true/false (use the real Sprite2D API) ...
    fl.add(group)
    fl.add(new PointLight2D())
    fl.setLighting(new DefaultLightEffect())
    fl.tick(0) // runs ECS systems
    const mats = group.batchMaterials() // existing accessor
    expect(mats.length).toBe(1)
    expect(mats[0].lights).toBe(true)
    expect(mats[0].lightsNode).toBeInstanceOf(FlatlandLightsNode)
  })
})
```

(Wire to the real `Sprite2D`/`SpriteGroup`/`Flatland.tick` API names when implementing.)

- [ ] **Step 2: Run; commit**

Run: `pnpm --filter three-flatland test -- integration.lit-batch`
Expected: PASS.

```bash
git add packages/three-flatland/src/lights/integration.lit-batch.test.ts
git commit -m "test(lighting): integration — mixed lit/unlit share one lit batch"
```

### Task 8.2: Playwright smoke still green; add a lit-isolation assertion

**Files:**
- Modify: `e2e/smoke-examples.spec.ts`

- [ ] **Step 1: Add an assertion that the lighting example reports draw calls ≤ baseline**

In the lighting example's entry in `EXAMPLES`, set `maxDraws` to the pre-migration draw-call count (captured in Phase 0) and assert `snapshot.draws <= maxDraws` alongside the existing `>= minDraws`.

- [ ] **Step 2: Run; commit**

Run: `pnpm test:smoke`
Expected: PASS.

```bash
git add e2e/smoke-examples.spec.ts
git commit -m "test(lighting): smoke asserts lighting example draw calls stay at/below baseline"
```

---

## Phase 9 — Example Migration, Docs, Codemod, Final Gate

### Task 9.1: Migrate both lighting examples to subclasses

**Files:**
- Modify: `examples/three/lighting/main.ts`
- Modify: `examples/react/lighting/App.tsx`

- [ ] **Step 1: Replace `new Light2D({ type })` with explicit subclasses (three) and `<pointLight2D>` etc. (react)**

Three: `new Light2D({ type: 'point', ... })` → `const l = new PointLight2D(); l.position.set(...); l.intensity = ...`. React: register subclasses via `extend({ PointLight2D, SpotLight2D, DirectionalLight2D, AmbientLight2D })` and use `<pointLight2D position={...} intensity={...} />`.

- [ ] **Step 2: Run examples locally + regression gate**

Run: `pnpm dev` then `pnpm test:regression`
Expected: visual diff `< 0.5%` against Phase 0 goldens; draw calls unchanged.

- [ ] **Step 3: Commit**

```bash
git add examples/three/lighting/main.ts examples/react/lighting/App.tsx
git commit -m "refactor(examples): lighting examples use Light2D subclasses (no visual change)"
```

### Task 9.2: Ship the consumer codemod

**Files:**
- Create: `packages/three-flatland/codemods/light2d-to-subclasses.md`
- Modify: `packages/three-flatland/package.json` (add `codemods/` to `files[]`)

- [ ] **Step 1: Write the codemod artifact (frontmatter + migration table + LLM-applicable prompt)**

Follow the repo codemod DSL: frontmatter (`title`, `slug: light2d-to-subclasses`, `package: three-flatland`, `version`, `type: breaking`, `audience: consumers`); a human migration table mapping `new Light2D({ type: 'point' })` → `new PointLight2D()` (+ option→property mapping); numbered Discover → Verify → Apply phases; a `Do NOT touch` list including `node_modules/`, build output, and the artifact itself; verify with `npx tsc --noEmit` and `npm test`.

- [ ] **Step 2: Add `codemods/` to package `files[]`; verify packaging**

Run: `pnpm --filter three-flatland pack --dry-run`
Expected: `codemods/light2d-to-subclasses.md` listed in the tarball.

- [ ] **Step 3: Generate a changeset (breaking) and commit**

Run: `pnpm changeset` (select `three-flatland`, major)

```bash
git add packages/three-flatland/codemods/ packages/three-flatland/package.json .changeset/
git commit -m "docs(lighting): ship light2d-to-subclasses codemod + breaking changeset"
```

### Task 9.3: Update documentation

**Files:**
- Modify: lighting docs pages (locate: `find docs -iname '*light*'`), and `.library/three-flatland/loader-architecture.md` if it references lighting.

- [ ] **Step 1: Locate lighting docs**

Run: `find docs -iname '*light*' -o -path '*lighting*' | grep -iE '\.(md|mdx)$'`
Expected: the lighting guide/reference pages.

- [ ] **Step 2: Rewrite to the new API**

Update prose + code samples: subclasses instead of `Light2D({type})`; explain layer-based isolation (2D lights vs 3D scene), `lightCollector`, `normalMap` driving `normalNode`, and that lighting now flows through the standard three.js pipeline. Use themed `Tabs`/`TabItem` from `starlight-theme/components` (per project convention), and keep the technicolor/gem aside conventions.

- [ ] **Step 3: Build docs to verify no broken references**

Run: `pnpm --filter docs build`
Expected: build PASS, no broken links to removed symbols.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(lighting): document unified pipeline, subclasses, isolation, lightCollector"
```

### Task 9.4: Final full-suite + regression gate

- [ ] **Step 1: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm test:smoke && pnpm test:regression`
Expected: all PASS; visual diff `< 0.5%`; draw calls and FPS at/above baseline.

- [ ] **Step 2: Verify deprecated paths still work (back-compat)**

Run: `pnpm --filter three-flatland test -- Light2D.test`
Expected: the deprecated `Light2D({type})` factory tests PASS.

- [ ] **Step 3: Commit any final fixups**

```bash
git add -p   # stage by exact path per project workflow
git commit -m "chore(lighting): finalize unification — full suite + regression green"
```

---

## Self-Review

**1. Spec coverage**
- No performance regression → Phase 0.3 perf baseline + Phase 8.2 `maxDraws` smoke + Phase 9.4 gate. ✓
- No visual regression → Phase 0.3 vitexec goldens + Phase 9.1/9.4 pixel-diff gate. ✓
- Integration tests required → Phase 8.1 (headless assembly) + 8.2 (Playwright). ✓
- vitexec proves artifacts → Phase 0.3 capture helper + regression spec. ✓
- Comprehensive test suite before migration → Phase 0 (characterization snapshots + coverage gap audit gate). ✓
- Update documentation → Phase 9.3. ✓
- Existing lighting example works → Phase 9.1 migration under the regression gate. ✓
- Standard three.js lighting pipeline → Phases 3–5 (LightsNode + LightingModel + lit material). ✓
- Light subclasses + userData/extras → Phase 2. ✓
- Layer isolation / single-camera 2D-vs-3D → Phase 6 (camera layer + per-material lightsNode). ✓
- lightCollector (function or token) → Phase 6.1/6.3. ✓
- Keep ForwardPlus → Phase 3 (wrapped, not replaced). ✓

**2. Placeholder scan** — Spike (Phase 1) is a concrete task with acceptance + an escalation branch, not a placeholder. The two "transcription" tasks (3.3, 4.2) relocate existing working math rather than inventing it; their tests assert node-shape, matching the repo's GPU-mocked pattern. No "TBD"/"add error handling"/"similar to Task N" left.

**3. Type consistency** — `FlatlandLightsNode` (methods `setWorldBounds`, `updateLights`, `tileTexture`, `setupLights`), `Flatland2DLightingModel` (`direct`/`indirect`/`finish`/`shapesOutput`, `Flatland2DLightingModelOptions { bands, rim, glow }`), `setFlatlandLighting`/`clearFlatlandLighting` on the material, `LightCollector`/`LightCollectorSpec`/`resolveLightCollector`/`defaultLightCollector`, `isFlatlandLight`, `FLATLAND_LIGHTING_LAYER`/`applyLightingLayer`, `buildLightingBundle` — names used consistently across Phases 3–9.

**Open implementation risks flagged for the executor** (verify, don't assume):
- Exact `LightingModel.start`/`setupDirectLight` call signature in r183 (Phase 1 spike confirms).
- That `MeshBasicNodeMaterial` honors `setupLightingModel` when `lights = true` (spike confirms; if not, base-class must change to a NodeMaterial that does).
- `normalView` space alignment for camera-facing quads under the (future) perspective camera — orthographic today, so safe for this epic; Epic 2 must re-validate.
