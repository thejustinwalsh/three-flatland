# Event System — Plan 2: R3F Integration + Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make content rendered through `<flatland>`'s internal scene/camera reachable by R3F pointer events via the canonical portal + `events.compute` seam, and ship the hit-test example pair + docs page.

**Architecture:** Per spec §8: R3F raycasts with `state.camera` into its own scene, so flatland's private scene/ortho camera need a portal with a portal-local `compute` that re-casts from `flatland.camera` (the drei-View pattern; R3F v10.0.0-alpha.2 calls a portal's `compute(event, portalState, parentState)` lazily once per root per event). Standalone sprites under `<Canvas>` need none of this — Plan 1's `raycast()` makes R3F props work directly. Batched sprites inside SpriteGroup stay non-interactive until #85 (spec D1) — the docs page and examples say so explicitly.

**Tech Stack:** @react-three/fiber@10.0.0-alpha.2 (`createPortal`, `events.compute`, `useThree`), three@0.183.1, vite examples MPA. R3F examples import from `@react-three/fiber/webgpu`. Examples exist in pairs (`examples/three/` + `examples/react/`).

**Prerequisite:** Plan 1 (`2026-06-12-event-system-primitives.md`) is merged — `Sprite2D.raycast()`, `TileMap2D.raycast()`, and `hitTestMode` exist.

---

## File structure

| File                                                         | Responsibility                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Modify `packages/three-flatland/src/Flatland.ts`             | Public `get camera()` accessor (currently only private `_camera`)             |
| Create `packages/three-flatland/src/react/flatlandEvents.ts` | `createFlatlandCompute(getFlatland)` — portal `events.compute` factory        |
| Modify `packages/three-flatland/src/react/index.ts`          | Export the factory                                                            |
| Create `examples/three/hit-test/*`                           | Plain-three example: `Raycaster` + `hitTestMode` (no event library — spec D4) |
| Create `examples/react/hit-test/*`                           | R3F example: `onPointer*` props on standalone sprites + tilemap hover         |
| Create `docs/src/content/docs/examples/hit-test.mdx`         | Docs page (rewrite of the PoC page against the shipped API)                   |
| Test                                                         | `packages/three-flatland/src/react/flatlandEvents.test.ts`                    |

**Explicit scope cut:** `FlatlandTexture` (render-to-texture portal component, spec §8.2) is deferred to its own follow-up plan — it additionally needs a `Flatland` render-target ownership story in React (creation, sizing, disposal) that deserves its own brainstorm. The `createFlatlandCompute` factory built here is the reusable half; the PoC's `createUvCompute` (`git show d24fd704:packages/three-flatland/src/react/uvCompute.ts`) is the reference for the UV-mapping half when that plan happens. Record this deferral in the PR description.

---

### Task 1: Public camera accessor on Flatland

**Files:**

- Modify: `packages/three-flatland/src/Flatland.ts` (private `_camera` declared at line ~173)
- Test: extend `packages/three-flatland/src/react/flatlandEvents.test.ts` (created in Task 2 — write this assertion there; this task only adds the accessor and verifies via typecheck)

- [ ] **Step 1: Add the accessor**

After the existing `viewSize`/resize-related accessors in `Flatland.ts` (search for `get viewSize`), add:

```ts
  /**
   * The camera flatland renders its internal scene with. Read-only
   * access for event integration (portal `events.compute` re-casts
   * pointer rays from this camera — spec §8.1) and debugging.
   */
  get camera(): OrthographicCamera {
    return this._camera
  }
```

`OrthographicCamera` is already imported in `Flatland.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter=three-flatland typecheck`
Expected: clean. (No name collision — verify with `grep -n 'get camera' packages/three-flatland/src/Flatland.ts` returning exactly one hit.)

- [ ] **Step 3: Commit**

```bash
git add packages/three-flatland/src/Flatland.ts
git commit -m "feat(flatland): public read-only camera accessor"
```

---

### Task 2: createFlatlandCompute

**Files:**

- Create: `packages/three-flatland/src/react/flatlandEvents.ts`
- Modify: `packages/three-flatland/src/react/index.ts`
- Test: `packages/three-flatland/src/react/flatlandEvents.test.ts`

The compute contract (verified against the installed R3F v10.0.0-alpha.2 source): R3F calls `compute(event, portalState, parentState)` lazily per portal root; the function must set `portalState.pointer` AND call `portalState.raycaster.setFromCamera(pointer, camera)` (which assigns `raycaster.camera` — leaving it `undefined` silences the root).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { OrthographicCamera, Raycaster, Vector2 } from 'three'
import { Flatland } from '../Flatland'
import { createFlatlandCompute } from './flatlandEvents'

describe('createFlatlandCompute', () => {
  it('re-casts the parent pointer from the flatland camera', () => {
    const flatland = new Flatland({ viewSize: 200 })
    expect(flatland.camera).toBeInstanceOf(OrthographicCamera)

    const compute = createFlatlandCompute(() => flatland)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    const parentState = { pointer: new Vector2(0.5, -0.25) }

    compute({} as never, portalState as never, parentState as never)

    expect(portalState.pointer.x).toBe(0.5)
    expect(portalState.pointer.y).toBe(-0.25)
    // setFromCamera assigns raycaster.camera — the signal R3F checks
    expect(portalState.raycaster.camera).toBe(flatland.camera)
    // Ortho ray points down -Z
    expect(portalState.raycaster.ray.direction.z).toBeCloseTo(-1)
  })

  it('leaves raycaster.camera unset when flatland is not ready (R3F skips the root)', () => {
    const compute = createFlatlandCompute(() => null)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    compute({} as never, portalState as never, { pointer: new Vector2(1, 1) } as never)
    expect(portalState.raycaster.camera).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/react/flatlandEvents.test.ts`
Expected: FAIL — cannot resolve `./flatlandEvents`

- [ ] **Step 3: Write the implementation**

```ts
import type { Flatland } from '../Flatland'

/**
 * Minimal structural slice of R3F's RootState that compute touches.
 * Typed structurally so this module needs no @react-three/fiber import
 * (the core package must not depend on R3F — only consume its shapes).
 */
interface ComputeState {
  pointer: { set(x: number, y: number): void; x: number; y: number }
  raycaster: {
    setFromCamera(pointer: { x: number; y: number }, camera: THREE.Camera): void
  }
}

import type * as THREE from 'three'

/**
 * Build an R3F portal `events.compute` for content portaled into a
 * Flatland's internal scene (spec §8.1).
 *
 * The parent root's default compute already derived pointer NDC from
 * the canvas; flatland renders full-viewport through its own
 * orthographic camera, so the same NDC re-cast from `flatland.camera`
 * yields the correct ray. When flatland isn't ready yet, the compute
 * returns without calling `setFromCamera` — R3F then skips this root
 * for the event (its documented `raycaster.camera === undefined`
 * signal).
 *
 * @example
 * createPortal(children, flatland.scene, {
 *   events: { compute: createFlatlandCompute(() => flatlandRef.current), priority: 1 },
 * })
 */
export function createFlatlandCompute(getFlatland: () => Flatland | null) {
  return function flatlandCompute(
    _event: unknown,
    state: ComputeState,
    previous?: ComputeState
  ): void {
    const flatland = getFlatland()
    if (!flatland || !previous) return
    state.pointer.set(previous.pointer.x, previous.pointer.y)
    state.raycaster.setFromCamera(state.pointer, flatland.camera)
  }
}
```

(Reorder the imports to the top of the file — shown split here for narrative only. Final import block: `import type * as THREE from 'three'` then `import type { Flatland } from '../Flatland'`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/react/flatlandEvents.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Export from the react barrel**

In `packages/three-flatland/src/react/index.ts` add:

```ts
export { createFlatlandCompute } from './flatlandEvents'
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter=three-flatland typecheck` — Expected: clean.

```bash
git add packages/three-flatland/src/react/flatlandEvents.ts packages/three-flatland/src/react/flatlandEvents.test.ts packages/three-flatland/src/react/index.ts
git commit -m "feat(react): createFlatlandCompute portal events seam for flatland camera"
```

---

### Task 3: examples/react/hit-test

**Files:**

- Create: `examples/react/hit-test/` (scaffold via the repo's example conventions)

- [ ] **Step 1: Scaffold the example**

Invoke the repo skill `/example` (Skill tool, skill name `example`) with args `react hit-test`, OR if executing without skill access, copy the structure of `examples/react/basic-sprite/` (package.json with name `example-react-hit-test`, `index.html`, `main.tsx`, `vite.config.ts`, `tsconfig.json`) and register the example wherever `basic-sprite` is registered (check `microfrontends.json` at the repo root and run `pnpm sync:pack` after creating `package.json`).

- [ ] **Step 2: Copy assets**

```bash
mkdir -p examples/react/hit-test/public/sprites
git show d24fd704:examples/react/hit-test/public/sprites/knight.png > examples/react/hit-test/public/sprites/knight.png
git show d24fd704:examples/react/hit-test/public/sprites/knight.json > examples/react/hit-test/public/sprites/knight.json
git show d24fd704:examples/react/hit-test/public/sprites/coin.png > examples/react/hit-test/public/sprites/coin.png
git show d24fd704:examples/react/hit-test/public/sprites/coin.json > examples/react/hit-test/public/sprites/coin.json
```

- [ ] **Step 3: Write App.tsx**

`examples/react/hit-test/App.tsx` — standalone sprites under `<Canvas>` (no `<flatland>` wrapper: spec D1 — SpriteGroup-managed sprites are not interactive until #85; this example demonstrates the path that works today and the docs page says why):

```tsx
import { Suspense, useRef, useState } from 'react'
import { Canvas, extend, useLoader } from '@react-three/fiber/webgpu'
import type { ThreeEvent } from '@react-three/fiber'
import { Sprite2D, SpriteSheetLoader } from 'three-flatland/react'

extend({ Sprite2D })

function Coin({ position }: { position: [number, number, number] }) {
  const sheet = useLoader(SpriteSheetLoader, '/sprites/coin.json')
  const ref = useRef<Sprite2D>(null)
  const [collected, setCollected] = useState(false)
  if (collected) return null
  return (
    <sprite2D
      ref={ref}
      texture={sheet.texture}
      frame={sheet.frames.values().next().value}
      position={position}
      scale={[32, 32, 1]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        ref.current!.tint = 0xffff66
      }}
      onPointerOut={() => {
        if (ref.current) ref.current.tint = 0xffffff
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        setCollected(true)
      }}
    />
  )
}

function Knight({ target }: { target: [number, number] }) {
  const sheet = useLoader(SpriteSheetLoader, '/sprites/knight.json')
  return (
    <sprite2D
      texture={sheet.texture}
      frame={sheet.getFrame(sheet.getFrameNames()[0]!)}
      position={[target[0], target[1], 1]}
      scale={[64, 64, 1]}
      hitTestMode="none"
    />
  )
}

function Ground({ onWalk }: { onWalk: (x: number, y: number) => void }) {
  const sheet = useLoader(SpriteSheetLoader, '/sprites/coin.json')
  return (
    <sprite2D
      texture={sheet.texture}
      position={[0, 0, -1]}
      scale={[800, 600, 1]}
      alpha={0.05}
      hitTestMode="bounds"
      onClick={(e: ThreeEvent<MouseEvent>) => onWalk(e.point.x, e.point.y)}
    />
  )
}

export default function App() {
  const [target, setTarget] = useState<[number, number]>([0, 0])
  return (
    <Canvas orthographic camera={{ position: [0, 0, 100], zoom: 1 }} gl={{ antialias: false }}>
      <Suspense fallback={null}>
        <Ground onWalk={(x, y) => setTarget([x, y])} />
        <Knight target={target} />
        <Coin position={[-150, 50, 0]} />
        <Coin position={[120, -80, 0]} />
        <Coin position={[200, 120, 0]} />
      </Suspense>
    </Canvas>
  )
}
```

Note for the executor: adjust the `frame` prop usage to whatever `basic-sprite` does on current main if it differs (read `examples/react/basic-sprite/App.tsx` first and follow its loader/extend idioms exactly — it is the canonical reference for R3F sprite wiring).

- [ ] **Step 4: Run the example**

Run: `pnpm --filter=example-react-hit-test dev`
Expected: dev server starts; in the browser, coins highlight on hover, disappear on click, clicking the ground moves the knight, the knight never intercepts clicks (`hitTestMode="none"`).

- [ ] **Step 5: Commit**

```bash
git add examples/react/hit-test microfrontends.json pnpm-lock.yaml
git commit -m "feat(examples): react hit-test example (R3F pointer events on sprites)"
```

---

### Task 4: examples/three/hit-test

**Files:**

- Create: `examples/three/hit-test/` (mirror of Task 3 — examples exist in pairs)

- [ ] **Step 1: Scaffold + assets**

Same procedure as Task 3 Steps 1–2 with `three hit-test` / `example-three-hit-test`, copying the structure of an existing `examples/three/*` example (e.g. `examples/three/batch-demo`). Copy the same four sprite assets from `d24fd704` into `examples/three/hit-test/public/sprites/`.

- [ ] **Step 2: Write main.ts — plain Raycaster, no event library (spec D4, §9)**

```ts
import { Scene, OrthographicCamera, Raycaster, Vector2 } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Sprite2D, SpriteSheetLoader } from 'three-flatland'

const scene = new Scene()
const camera = new OrthographicCamera(-400, 400, 300, -300, 0.1, 1000)
camera.position.z = 100

const renderer = new WebGPURenderer({ antialias: false })
renderer.setSize(800, 600)
document.body.appendChild(renderer.domElement)

const loader = new SpriteSheetLoader()
const coinSheet = await loader.loadAsync('/sprites/coin.json')
const knightSheet = await loader.loadAsync('/sprites/knight.json')

const knight = new Sprite2D({ texture: knightSheet.texture })
knight.frame = knightSheet.getFrame(knightSheet.getFrameNames()[0]!)
knight.scale.set(64, 64, 1)
knight.hitTestMode = 'none' // walks, never intercepts
scene.add(knight)

const coins: Sprite2D[] = []
for (const [x, y] of [
  [-150, 50],
  [120, -80],
  [200, 120],
] as const) {
  const coin = new Sprite2D({ texture: coinSheet.texture })
  coin.frame = coinSheet.frames.values().next().value!
  coin.position.set(x, y, 0)
  coin.scale.set(32, 32, 1)
  scene.add(coin)
  coins.push(coin)
}

// --- Plain-Raycaster picking: the entire event integration ---
const raycaster = new Raycaster()
const pointer = new Vector2()

function castFromEvent(e: PointerEvent | MouseEvent): void {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  )
  raycaster.setFromCamera(pointer, camera)
}

let hovered: Sprite2D | null = null
renderer.domElement.addEventListener('pointermove', (e) => {
  castFromEvent(e)
  const hit = raycaster.intersectObjects(coins)[0]
  const next = (hit?.object as Sprite2D | undefined) ?? null
  if (next !== hovered) {
    if (hovered) hovered.tint = 0xffffff
    if (next) next.tint = 0xffff66
    hovered = next
  }
})

renderer.domElement.addEventListener('click', (e) => {
  castFromEvent(e)
  const hit = raycaster.intersectObjects(coins)[0]
  if (hit) {
    // Collect the coin: drop it from the pickable set and the scene
    const coin = hit.object as Sprite2D
    coins.splice(coins.indexOf(coin), 1)
    scene.remove(coin)
    if (hovered === coin) hovered = null
    return
  }
  // No coin hit → walk the knight to the world point on the Z=0 plane
  const t = -raycaster.ray.origin.z / raycaster.ray.direction.z
  knight.position.set(
    raycaster.ray.origin.x + raycaster.ray.direction.x * t,
    raycaster.ray.origin.y + raycaster.ray.direction.y * t,
    1
  )
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))
```

(Adapt renderer/setup boilerplate to whatever the sibling `examples/three/*` mains do on current main — read one first and match its init pattern, resize handling, and import paths.)

- [ ] **Step 3: Run**

Run: `pnpm --filter=example-three-hit-test dev`
Expected: hover highlights coins, click collects them, clicking elsewhere walks the knight.

- [ ] **Step 4: Commit**

```bash
git add examples/three/hit-test microfrontends.json pnpm-lock.yaml
git commit -m "feat(examples): three hit-test example (plain Raycaster picking)"
```

---

### Task 5: docs page

**Files:**

- Create: `docs/src/content/docs/examples/hit-test.mdx`
- Modify: `docs/astro.config.mjs` only if examples pages need sidebar registration (check how an existing `examples/*.mdx` page is registered first and follow that exactly)

- [ ] **Step 1: Write the page**

Content requirements (prose to be written in the repo docs voice — confident-technical, teammate-sharing-notes; import Tabs/TabItem from `starlight-theme/components`, never `@astrojs/starlight/components`):

1. **What you get:** sprites and tilemaps are pickable by any three.js `Raycaster`; R3F `onPointer*` props work on them out of the box.
2. **Hit-test modes table** (radius / bounds / alpha / none) with the one-line cost model from spec §6 and a `hitTestMode` code sample in both Three.js and R3F tabs.
3. **The R3F path:** `<sprite2D onClick={...} />` under `<Canvas>` — embed the react example.
4. **The plain-three path:** `Raycaster` + `intersectObjects` — embed the three example.
5. **`tileFromIntersection`** snippet for tilemaps.
6. **Limitation callout (aside, warning):** sprites managed by `SpriteGroup`/`Flatland` batching are not yet interactive — that lands with the orchestration overhaul (#85). Standalone sprites are fully interactive today.
7. **Alpha mode teaser:** pixel-perfect picking exists behind `hitTestMode: 'alpha'`; the baked sidecar workflow is documented when Plan 3 ships (cross-link placeholder to the loaders page).
8. **Hover under a moving camera (spec §8.3):** when animating the camera over hoverable objects, call `state.events.update()` from `useFrame` so R3F re-fires the last pointer event — include the three-line snippet.

- [ ] **Step 2: Build the docs**

Run: `pnpm --filter=docs build` (or the repo's docs build filter — check `docs/package.json` name first)
Expected: build succeeds, no broken-link warnings for the new page.

- [ ] **Step 3: Commit**

```bash
git add docs/src/content/docs/examples/hit-test.mdx docs/astro.config.mjs
git commit -m "docs: hit-test example page (modes, R3F + vanilla paths, batching caveat)"
```

---

### Task 6: Final verification gate

- [ ] **Step 1: Full gate**

```bash
npx vitest --typecheck --run packages/three-flatland/src
pnpm --filter=three-flatland typecheck
npx eslint packages/three-flatland/src/react examples/react/hit-test examples/three/hit-test
npx prettier --check 'packages/three-flatland/src/react/flatlandEvents*' 'examples/*/hit-test/**/*.{ts,tsx}'
```

Expected: all green.

- [ ] **Step 2: Manual smoke**

Run `pnpm dev`, open both hit-test examples through the MPA proxy (http://localhost:5173), verify hover/click/walk interactions in both.

- [ ] **Step 3: Commit stragglers**

```bash
git add -A && git commit -m "chore(events): lint/format cleanup for R3F integration" || echo "nothing to fix"
```
