# Make Web Games — IGDA Lightning Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable reveal.js + React-Three-Fiber slide-deck engine in the docs site and the first deck (`make-web-games`): a 5-minute IGDA lightning talk whose live background scene is synced to slide position.

**Architecture:** A standalone, unlinked Astro page (`docs/src/pages/slides/make-web-games.astro`) mounts a single React island. That island (`Presentation`) owns both a fixed fullscreen R3F `<Canvas>` and the reveal.js DOM so they share a module-level store. reveal.js is the source of truth for navigation; a thin adapter pushes `{slideIndex, fragment}` into the store on reveal events; a `<SceneDirector>` inside the canvas reads the store and eases the camera to a per-slide "beat." The engine (`components/deck/`) is deck-agnostic; per-deck content lives in `components/slides/<name>/`.

**Tech Stack:** Astro 6, Starlight (bypassed for this page), `@react-three/fiber/webgpu`, three.js (WebGPU/TSL), `three-flatland`, reveal.js, Public Sans, gem-palette CSS tokens, Vitest (pure logic), Playwright (smoke).

## Global Constraints

- WebGPU + TSL only — R3F Canvas imported from `@react-three/fiber/webgpu`; import library types from `three-flatland/react`. No WebGL1, no GLSL, no `onBeforeCompile`.
- All custom three.js classes used as JSX must be registered with `extend({ ... })` before use.
- Code style: no semicolons, single quotes, trailing commas; `type` keyword for type-only imports; unused vars prefixed `_`.
- Conventional Commits for every commit.
- Page is **unlinked** — no entry added to docs nav/sidebar/Starlight config.
- Color only via existing gem tokens from `packages/starlight-theme/styles/theme.css` (`--gold --ruby --emerald --diamond --amethyst`, plus `-soft/-low/-high` variants). Headlines: Public Sans 700.
- Dark-only is acceptable (projected talk); near-black scene is the backdrop.
- CC-BY-4.0 device models require **visible attribution** (exact strings in the spec, Assets section). Raw model originals are vaulted at `assets-src/devices/` (git-excluded); optimized `.glb` is what gets committed.
- Phase 1 = complete slide content + speaker notes + a wired scene **scaffold**. Real per-feature flatland demos and the device render-to-texture are explicitly later phases.

**Spec:** `planning/superpowers/specs/2026-06-25-make-web-games-deck-design.md` (slide copy is content of record).

---

## File Structure

```
docs/
  package.json                                  # + reveal.js dep (T1)
  vitest.config.ts                              # NEW — docs unit-test project (T1)
  src/
    pages/slides/make-web-games.astro           # route shell, unlinked (T1, finalized T10)
    styles/deck.css                             # NEW — deck layout + reveal overrides (T1)
    components/
      deck/                                      # REUSABLE ENGINE
        presentationStore.ts                     # T2
        presentationStore.test.ts                # T2
        beats.ts                                 # T3 (SceneBeat type + resolveBeat)
        beats.test.ts                            # T3
        DeckCanvas.tsx                           # T4
        SceneDirector.tsx                        # T4
        Presentation.tsx                         # T6
        primitives/Slide.tsx                     # T5
        primitives/Eyebrow.tsx                   # T5
        primitives/Headline.tsx                  # T5
        primitives/Subline.tsx                   # T5
        primitives/Credit.tsx                    # T5
        primitives/index.ts                      # T5
      slides/make-web-games/                     # THIS DECK
        beats.ts                                 # T7 (10 SceneBeat entries)
        scene/DeckScene.tsx                      # T8 (Flatland + placeholder elements)
        slides/index.tsx                         # T9 (all 10 slide sections)
        deck.tsx                                 # T10 (assembles slides + scene)
  ../e2e/smoke-make-web-games.spec.ts            # T10 (repo-root e2e/)
vitest.workspace.ts                              # + docs/vitest.config.ts (T1)
```

**Dependency order:** T1 (foundation) → then T2, T3, T5 in parallel → T4 (needs T2,T3) and T6 (needs T2,T4) → T7 (needs T3), T8, T9 (need T5) in parallel → T10 (integration, needs all).

**Gating model.** Pure logic (T2, T3) is TDD'd with Vitest. Visual/R3F/Astro tasks (T4–T9) gate on `pnpm --filter docs astro check` (typecheck) passing with zero errors. The integration task (T10) gates on the full `pnpm --filter docs build` plus the Playwright smoke. This is deliberate: unit-testing visual slides adds no signal; the build + e2e smoke is the non-gameable integration gate.

---

### Task 1: Foundation — dependency, page shell, deck CSS, test wiring

**Files:**
- Modify: `docs/package.json` (add `reveal.js`)
- Create: `docs/vitest.config.ts`
- Modify: `vitest.workspace.ts` (repo root)
- Create: `docs/src/styles/deck.css`
- Create: `docs/src/pages/slides/make-web-games.astro`

**Interfaces:**
- Produces: a reachable route `/slides/make-web-games` rendering a placeholder island; a docs Vitest project so `docs/src/components/**/*.test.ts` run under `pnpm test`.

- [ ] **Step 1: Add reveal.js dependency**

In `docs/package.json` `dependencies`, add (keep alphabetical near other deps):
```json
"reveal.js": "^5.1.0"
```
Run: `pnpm install`
Expected: installs `reveal.js` into `docs`.

- [ ] **Step 2: Create docs Vitest project**

Create `docs/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['src/components/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 3: Register docs project in the workspace**

In `vitest.workspace.ts`, add `'docs/vitest.config.ts'` to the array:
```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'vitest.config.ts',
  'packages/devtools/vitest.config.ts',
  'docs/vitest.config.ts',
])
```

- [ ] **Step 4: Create the deck stylesheet**

Create `docs/src/styles/deck.css`:
```css
/* Deck layout: the R3F scene is a fixed backdrop; reveal sits over it, transparent. */
html, body {
  margin: 0;
  height: 100%;
  background: var(--surface-0, #111418);
  color: #fff;
  overflow: hidden;
}

.deck-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
}

/* reveal.js base ships its own .reveal sizing; make it transparent so the scene shows through. */
.reveal-root { position: fixed; inset: 0; z-index: 1; }
.reveal, .reveal .slides, .reveal .slides section { background: transparent !important; }
.reveal .slides { text-align: left; }

/* Bold-minimalist type defaults for slide content. */
.reveal .slides section {
  font-family: 'Public Sans', system-ui, sans-serif;
}
```

- [ ] **Step 5: Create the standalone page shell (placeholder island)**

Create `docs/src/pages/slides/make-web-games.astro`:
```astro
---
// Standalone, unlinked deck page. Bypasses the Starlight layout entirely.
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/silkscreen/latin-400.css'
import 'reveal.js/dist/reveal.css'
import '../../styles/deck.css'
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Make Web Games — three-flatland</title>
  </head>
  <body>
    <main id="deck-root">
      <p style="position:fixed;inset:0;display:grid;place-items:center;">deck mounts here</p>
    </main>
  </body>
</html>
```

- [ ] **Step 6: Verify the page builds and serves**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.
Run: `pnpm --filter docs build && pnpm --filter docs preview --port 4321 --host 127.0.0.1 &` then `curl -sSf http://127.0.0.1:4321/slides/make-web-games >/dev/null && echo OK`
Expected: `OK` (page renders). Stop the preview server afterward.

- [ ] **Step 7: Commit**

```bash
git add docs/package.json pnpm-lock.yaml docs/vitest.config.ts vitest.workspace.ts docs/src/styles/deck.css docs/src/pages/slides/make-web-games.astro
git commit -m "feat(slides): scaffold standalone make-web-games deck page + deck CSS"
```

---

### Task 2: Presentation store

**Files:**
- Create: `docs/src/components/deck/presentationStore.ts`
- Test: `docs/src/components/deck/presentationStore.test.ts`

**Interfaces:**
- Produces:
  - `type DeckPosition = { slideIndex: number; fragment: number }`
  - `getPosition(): DeckPosition`
  - `setPosition(next: DeckPosition): void` — no-op + no notify when unchanged
  - `subscribe(listener: () => void): () => void`
  - `usePosition(): DeckPosition` (React hook via `useSyncExternalStore`)

- [ ] **Step 1: Write the failing test**

Create `docs/src/components/deck/presentationStore.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { getPosition, setPosition, subscribe } from './presentationStore'

describe('presentationStore', () => {
  it('starts at slide 0 fragment 0', () => {
    expect(getPosition()).toEqual({ slideIndex: 0, fragment: 0 })
  })

  it('notifies subscribers on change and reflects new position', () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)
    setPosition({ slideIndex: 3, fragment: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getPosition()).toEqual({ slideIndex: 3, fragment: 1 })
    unsub()
  })

  it('does not notify when the position is unchanged', () => {
    setPosition({ slideIndex: 5, fragment: 0 })
    const listener = vi.fn()
    const unsub = subscribe(listener)
    setPosition({ slideIndex: 5, fragment: 0 })
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run docs/src/components/deck/presentationStore.test.ts`
Expected: FAIL (module not found / exports undefined).

- [ ] **Step 3: Implement the store**

Create `docs/src/components/deck/presentationStore.ts`:
```ts
import { useSyncExternalStore } from 'react'

export type DeckPosition = { slideIndex: number; fragment: number }

let position: DeckPosition = { slideIndex: 0, fragment: 0 }
const listeners = new Set<() => void>()

export function getPosition(): DeckPosition {
  return position
}

export function setPosition(next: DeckPosition): void {
  if (next.slideIndex === position.slideIndex && next.fragment === position.fragment) return
  position = next
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePosition(): DeckPosition {
  return useSyncExternalStore(subscribe, getPosition, getPosition)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run docs/src/components/deck/presentationStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add docs/src/components/deck/presentationStore.ts docs/src/components/deck/presentationStore.test.ts
git commit -m "feat(deck): add presentation position store"
```

---

### Task 3: Scene beat type + resolver

**Files:**
- Create: `docs/src/components/deck/beats.ts`
- Test: `docs/src/components/deck/beats.test.ts`

**Interfaces:**
- Produces:
  - `type CameraPose = { position: [number, number, number]; lookAt: [number, number, number]; zoom: number }`
  - `type SceneBeat = { camera: CameraPose }` (decks may extend with extra fields)
  - `resolveBeat<T extends SceneBeat>(beats: readonly T[], index: number): T` — clamps index into range; throws on empty.

- [ ] **Step 1: Write the failing test**

Create `docs/src/components/deck/beats.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveBeat, type SceneBeat } from './beats'

const beats: SceneBeat[] = [
  { camera: { position: [0, 0, 10], lookAt: [0, 0, 0], zoom: 1 } },
  { camera: { position: [0, 0, 6], lookAt: [0, 0, 0], zoom: 1 } },
]

describe('resolveBeat', () => {
  it('returns the beat at the index', () => {
    expect(resolveBeat(beats, 1)).toBe(beats[1])
  })
  it('clamps a too-large index to the last beat', () => {
    expect(resolveBeat(beats, 99)).toBe(beats[1])
  })
  it('clamps a negative index to the first beat', () => {
    expect(resolveBeat(beats, -5)).toBe(beats[0])
  })
  it('throws on empty beats', () => {
    expect(() => resolveBeat([], 0)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run docs/src/components/deck/beats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement beats**

Create `docs/src/components/deck/beats.ts`:
```ts
export type CameraPose = {
  position: [number, number, number]
  lookAt: [number, number, number]
  zoom: number
}

export type SceneBeat = {
  camera: CameraPose
}

export function resolveBeat<T extends SceneBeat>(beats: readonly T[], index: number): T {
  if (beats.length === 0) throw new Error('resolveBeat: beats is empty')
  const clamped = Math.max(0, Math.min(index, beats.length - 1))
  return beats[clamped]!
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run docs/src/components/deck/beats.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add docs/src/components/deck/beats.ts docs/src/components/deck/beats.test.ts
git commit -m "feat(deck): add scene beat type and resolver"
```

---

### Task 4: DeckCanvas + SceneDirector

**Files:**
- Create: `docs/src/components/deck/DeckCanvas.tsx`
- Create: `docs/src/components/deck/SceneDirector.tsx`

**Interfaces:**
- Consumes: `usePosition` (T2), `resolveBeat`, `SceneBeat` (T3).
- Produces:
  - `DeckCanvas({ children }: { children: ReactNode })` — fixed fullscreen WebGPU `<Canvas>`.
  - `SceneDirector({ beats }: { beats: readonly SceneBeat[] })` — eases the active camera toward the current beat each frame.

**Reference:** mirror the WebGPU Canvas props in `examples/react/basic-sprite/App.tsx` (`Canvas` from `@react-three/fiber/webgpu`, `renderer={{ antialias: false }}`).

- [ ] **Step 1: Implement SceneDirector**

Create `docs/src/components/deck/SceneDirector.tsx`:
```tsx
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { Vector3 } from 'three'
import { usePosition } from './presentationStore'
import { resolveBeat, type SceneBeat } from './beats'

// Critically-damped-ish exponential approach: frame-rate independent.
function approach(current: number, target: number, dt: number, rate = 4): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export function SceneDirector({ beats }: { beats: readonly SceneBeat[] }) {
  const { slideIndex } = usePosition()
  const beat = useMemo(() => resolveBeat(beats, slideIndex), [beats, slideIndex])
  const lookAt = useRef(new Vector3())

  useFrame(({ camera }, dt) => {
    const [px, py, pz] = beat.camera.position
    camera.position.set(
      approach(camera.position.x, px, dt),
      approach(camera.position.y, py, dt),
      approach(camera.position.z, pz, dt),
    )
    const [lx, ly, lz] = beat.camera.lookAt
    lookAt.current.set(
      approach(lookAt.current.x, lx, dt),
      approach(lookAt.current.y, ly, dt),
      approach(lookAt.current.z, lz, dt),
    )
    camera.lookAt(lookAt.current)
    if ('zoom' in camera) {
      camera.zoom = approach(camera.zoom, beat.camera.zoom, dt)
      camera.updateProjectionMatrix()
    }
  })

  return null
}
```

- [ ] **Step 2: Implement DeckCanvas**

Create `docs/src/components/deck/DeckCanvas.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'

export function DeckCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="deck-bg"
      frameloop="always"
      camera={{ position: [0, 0, 10], fov: 50 }}
      renderer={{ antialias: false }}
    >
      {children}
    </Canvas>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add docs/src/components/deck/DeckCanvas.tsx docs/src/components/deck/SceneDirector.tsx
git commit -m "feat(deck): add R3F canvas and slide-synced scene director"
```

---

### Task 5: Typography primitives

**Files:**
- Create: `docs/src/components/deck/primitives/Slide.tsx`
- Create: `docs/src/components/deck/primitives/Eyebrow.tsx`
- Create: `docs/src/components/deck/primitives/Headline.tsx`
- Create: `docs/src/components/deck/primitives/Subline.tsx`
- Create: `docs/src/components/deck/primitives/Credit.tsx`
- Create: `docs/src/components/deck/primitives/index.ts`

**Interfaces:**
- Produces presentational components (no store dependency):
  - `Slide({ children }: { children: ReactNode })` → `<section>` with padding wrapper (reveal reads `.slides > section`).
  - `Eyebrow({ children, gem }: { children: ReactNode; gem?: Gem })` — uppercase label in a gem accent.
  - `Headline({ children }: { children: ReactNode })` — Public Sans 700, large.
  - `Subline({ children }: { children: ReactNode })`.
  - `Credit({ children }: { children: ReactNode })` — small fixed-position attribution line.
  - `type Gem = 'gold' | 'ruby' | 'emerald' | 'diamond' | 'amethyst'`

- [ ] **Step 1: Implement the primitives**

Create `docs/src/components/deck/primitives/Slide.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Slide({ children }: { children: ReactNode }) {
  return (
    <section>
      <div style={{ maxWidth: '60rem', padding: '0 6vw' }}>{children}</div>
    </section>
  )
}
```

Create `docs/src/components/deck/primitives/Eyebrow.tsx`:
```tsx
import type { ReactNode } from 'react'

export type Gem = 'gold' | 'ruby' | 'emerald' | 'diamond' | 'amethyst'

export function Eyebrow({ children, gem = 'emerald' }: { children: ReactNode; gem?: Gem }) {
  return (
    <p
      style={{
        margin: '0 0 1rem',
        font: '600 0.9rem/1 Inter, system-ui, sans-serif',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: `var(--${gem})`,
      }}
    >
      {children}
    </p>
  )
}
```

Create `docs/src/components/deck/primitives/Headline.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Headline({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        margin: 0,
        font: "700 clamp(2.5rem, 8vw, 6rem)/1.02 'Public Sans', system-ui, sans-serif",
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </h1>
  )
}
```

Create `docs/src/components/deck/primitives/Subline.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Subline({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '1.5rem 0 0',
        font: "400 clamp(1.1rem, 2.6vw, 1.8rem)/1.3 'Public Sans', system-ui, sans-serif",
        color: 'rgba(255,255,255,0.78)',
      }}
    >
      {children}
    </p>
  )
}
```

Create `docs/src/components/deck/primitives/Credit.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Credit({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        position: 'absolute',
        left: '6vw',
        bottom: '3vh',
        margin: 0,
        font: '400 0.7rem/1.3 Inter, system-ui, sans-serif',
        color: 'rgba(255,255,255,0.45)',
        maxWidth: '40rem',
      }}
    >
      {children}
    </p>
  )
}
```

Create `docs/src/components/deck/primitives/index.ts`:
```ts
export { Slide } from './Slide'
export { Eyebrow, type Gem } from './Eyebrow'
export { Headline } from './Headline'
export { Subline } from './Subline'
export { Credit } from './Credit'
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/src/components/deck/primitives
git commit -m "feat(deck): add bold-minimalist typography primitives"
```

---

### Task 6: Presentation (reveal.js mount + event wiring)

**Files:**
- Create: `docs/src/components/deck/Presentation.tsx`

**Interfaces:**
- Consumes: `setPosition` (T2), `DeckCanvas` (T4).
- Produces: `Presentation({ slides, scene }: { slides: ReactNode; scene: ReactNode })` — the island that owns reveal + canvas.

- [ ] **Step 1: Implement Presentation**

Create `docs/src/components/deck/Presentation.tsx`:
```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { DeckCanvas } from './DeckCanvas'
import { setPosition } from './presentationStore'

export function Presentation({ slides, scene }: { slides: ReactNode; scene: ReactNode }) {
  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let deck: { destroy: () => void } | undefined
    let cancelled = false

    ;(async () => {
      const [{ default: Reveal }, { default: Notes }] = await Promise.all([
        import('reveal.js'),
        import('reveal.js/plugin/notes/notes.esm.js'),
      ])
      if (cancelled || !deckRef.current) return

      const instance = new Reveal(deckRef.current, {
        embedded: false,
        hash: false,
        controls: true,
        progress: false,
        transition: 'none',
        backgroundTransition: 'none',
        plugins: [Notes],
      })

      const sync = () => {
        const { h, f } = instance.getIndices()
        setPosition({ slideIndex: h ?? 0, fragment: f ?? 0 })
      }
      instance.on('ready', sync)
      instance.on('slidechanged', sync)
      instance.on('fragmentshown', sync)
      instance.on('fragmenthidden', sync)

      await instance.initialize()
      deck = instance
      sync()
    })()

    return () => {
      cancelled = true
      deck?.destroy()
    }
  }, [])

  return (
    <>
      <div className="deck-bg">
        <DeckCanvas>{scene}</DeckCanvas>
      </div>
      <div className="reveal-root">
        <div className="reveal" ref={deckRef}>
          <div className="slides">{slides}</div>
        </div>
      </div>
    </>
  )
}
```

Note: if `reveal.js` has no bundled TypeScript types, add a one-line module declaration file `docs/src/components/deck/reveal.d.ts` with `declare module 'reveal.js'` and `declare module 'reveal.js/plugin/notes/notes.esm.js'` so `astro check` passes. Verify whether `@types` is needed first (`ls docs/node_modules/reveal.js/*.d.ts`).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors (add the `reveal.d.ts` shim if check reports missing declarations).

- [ ] **Step 3: Commit**

```bash
git add docs/src/components/deck/Presentation.tsx docs/src/components/deck/reveal.d.ts
git commit -m "feat(deck): mount reveal.js and wire slide events to the store"
```

---

### Task 7: make-web-games beats

**Files:**
- Create: `docs/src/components/slides/make-web-games/beats.ts`

**Interfaces:**
- Consumes: `SceneBeat`, `CameraPose` (T3).
- Produces: `export const beats: SceneBeat[]` — exactly 10 entries, indices matching the 10 slides.

- [ ] **Step 1: Implement the beats table**

Create `docs/src/components/slides/make-web-games/beats.ts`. Ten camera beats; values are scaffold poses (a slow dolly that tightens on the sizzle and pulls wide for GO NATIVE, returning home on the close):
```ts
import type { SceneBeat } from '../../deck/beats'

export const beats: SceneBeat[] = [
  { camera: { position: [0, 0, 9], lookAt: [0, 0, 0], zoom: 1 } },     // 1 MAKE WEB GAMES
  { camera: { position: [1, 0, 11], lookAt: [0, 0, 0], zoom: 1 } },    // 2 frictionless
  { camera: { position: [2, 0.5, 13], lookAt: [0, 0, 0], zoom: 1 } },  // 3 USE THE PLATFORM
  { camera: { position: [0, 0, 12], lookAt: [0, 0, 0], zoom: 1 } },    // 4 objection
  { camera: { position: [0, 0, 8], lookAt: [0, 0, 0], zoom: 1 } },     // 5 FIRST CLASS 2D
  { camera: { position: [-1, 0, 6], lookAt: [0, 0, 0], zoom: 1 } },    // 6 sprites
  { camera: { position: [1, -0.5, 6], lookAt: [0, 0, 0], zoom: 1 } },  // 7 tilemaps + lighting
  { camera: { position: [0, 0, 5], lookAt: [0, 0, 0], zoom: 1 } },     // 8 radiance cascades
  { camera: { position: [0, 1, 16], lookAt: [0, 0, 0], zoom: 1 } },    // 9 GO NATIVE (wide)
  { camera: { position: [0, 0, 9], lookAt: [0, 0, 0], zoom: 1 } },     // 10 close
]
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/src/components/slides/make-web-games/beats.ts
git commit -m "feat(make-web-games): add per-slide camera beats"
```

---

### Task 8: Scene scaffold

**Files:**
- Create: `docs/src/components/slides/make-web-games/scene/DeckScene.tsx`

**Interfaces:**
- Consumes: `SceneDirector` (T4), `beats` (T7), `three-flatland/react` (`Flatland`, `Sprite2D`).
- Produces: `DeckScene()` — the R3F subtree placed inside `DeckCanvas`: a `Flatland` root, a placeholder hero element, ambient lighting, and the `SceneDirector` driving the camera.

**Reference:** `examples/react/basic-sprite/App.tsx` for the `extend({ Sprite2D })` + `<flatland>` / `<sprite2D>` JSX pattern. Phase 1 uses placeholder geometry where a textured Sprite2D would need an asset — do **not** block on art.

- [ ] **Step 1: Implement the scaffold scene**

Create `docs/src/components/slides/make-web-games/scene/DeckScene.tsx`:
```tsx
import { extend } from '@react-three/fiber/webgpu'
import { Flatland } from 'three-flatland/react'
import { SceneDirector } from '../../../deck/SceneDirector'
import { beats } from '../beats'

// Register library classes used as JSX before first use.
extend({ Flatland })

export function DeckScene() {
  return (
    <>
      <SceneDirector beats={beats} />
      <ambientLight intensity={0.6} />
      {/* Flatland 2D root — placeholder content for Phase 1. */}
      <flatland>
        {/* Placeholder hero: a gem-tinted quad standing in for the eventual sprite. */}
        <mesh>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial color="#7aa2ff" />
        </mesh>
      </flatland>
    </>
  )
}
```
If `<flatland>` requires constructor args or specific props in this repo, follow the exact usage in `examples/react/lighting/App.tsx`; the placeholder mesh inside is the only Phase-1 requirement.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/src/components/slides/make-web-games/scene/DeckScene.tsx
git commit -m "feat(make-web-games): add background scene scaffold with camera director"
```

---

### Task 9: The ten slides

**Files:**
- Create: `docs/src/components/slides/make-web-games/slides/index.tsx`

**Interfaces:**
- Consumes: primitives (T5) — `Slide`, `Eyebrow`, `Headline`, `Subline`, `Credit`.
- Produces: `export function Slides(): JSX.Element` — a fragment of exactly 10 `<section>` elements in order, each with a `<aside className="notes">`.

**Content of record** (from the spec; copy exactly). Each slide = `<Slide>` with eyebrow/headline/subline as noted, then `<aside className="notes">…</aside>` inside the section.

- [ ] **Step 1: Implement all ten slides**

Create `docs/src/components/slides/make-web-games/slides/index.tsx`:
```tsx
import { Slide, Eyebrow, Headline, Subline, Credit } from '../../../deck/primitives'

export function Slides() {
  return (
    <>
      {/* 1 */}
      <Slide>
        <Headline>MAKE WEB GAMES</Headline>
        <aside className="notes">
          Who I am, and the provocation. This room ships on Unity and Unreal. I am
          here to make the case for the platform you already have open.
        </aside>
      </Slide>

      {/* 2 */}
      <Slide>
        <Eyebrow gem="diamond">The pitch</Eyebrow>
        <Headline>No install. No store. One URL.</Headline>
        <Subline>Your game is one click from every player on Earth.</Subline>
        <aside className="notes">
          The friction tax of native distribution — downloads, store review,
          platform cuts. The web collapses it to a link. Instant play is a feature.
        </aside>
      </Slide>

      {/* 3 */}
      <Slide>
        <Eyebrow gem="emerald">Use the platform</Eyebrow>
        <Headline>The web is already the biggest game platform.</Headline>
        <Subline>
          [SOURCE: web/HTML5 market size] · [SOURCE: monthly players, Poki / CrazyGames]
          · [SOURCE: growth/revenue trend]
        </Subline>
        <aside className="notes">
          Cite each source out loud. Reach plus revenue. This is the load-bearing
          data slide — web games are a real market, not a toy. Numbers are
          placeholders pending a sourced research pass; do not present fabricated figures.
        </aside>
      </Slide>

      {/* 4 */}
      <Slide>
        <Eyebrow gem="ruby">The catch</Eyebrow>
        <Headline>"But the web can't make real games."</Headline>
        <Subline>That was true. It isn't anymore.</Subline>
        <aside className="notes">
          Name the Unity/Unreal skepticism directly and respect it. The turn:
          WebGPU and TSL changed the rendering ceiling. Set up the toolkit.
        </aside>
      </Slide>

      {/* 5 */}
      <Slide>
        <Eyebrow gem="gold">First class 2D</Eyebrow>
        <Headline>three-flatland</Headline>
        <Subline>Spartan development. One library. All you need.</Subline>
        <aside className="notes">
          raylib calls it Spartan development — minimal dependencies, you against
          the machine. three-flatland is that for web 2D: WebGPU + TSL, sprites,
          tilemaps, lighting, GI, in one place.
        </aside>
      </Slide>

      {/* 6 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>100,000 sprites. One draw call.</Headline>
        <aside className="notes">
          SpriteGroup batching, GPU-driven. The hard thing in 2D — throughput — is
          the thing the GPU does best. (Live background demo target.)
        </aside>
      </Slide>

      {/* 7 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>Tilemaps. Real-time 2D lights. Soft shadows.</Headline>
        <aside className="notes">
          Tiled Forward+ lighting and dynamic shadows — lighting that used to mean
          a PC/console budget, in a 2D browser scene. (Live background demo target.)
        </aside>
      </Slide>

      {/* 8 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>Radiance cascades. Global illumination in 2D.</Headline>
        <Subline>Light that bounces. In a browser.</Subline>
        <aside className="notes">
          GI was console/PC-only territory. Radiance cascades bring bounced light to
          2D, running live in the page. This is the wow beat. (Live background demo target.)
        </aside>
      </Slide>

      {/* 9 */}
      <Slide>
        <Eyebrow gem="diamond">Go native</Eyebrow>
        <Headline>You're not trapped in a browser.</Headline>
        <Subline>NativeScript + three.js · ANGLE → native WebGL2 · Steam Deck</Subline>
        <Credit>
          Device models: "Steam Deck" by VM-Models and "Iphone 14 Pro" by mister dude,
          licensed CC-BY-4.0.
        </Credit>
        <aside className="notes">
          The Steam Deck / native question is the real worry — answer it head-on. In
          2026 you are not boxed in: my NativeScript + three.js demo, ANGLE bridging
          WebGL2 to native, Steam Deck's browser-grade runtime. Hylo is the long game —
          publish once, ship everywhere — mention it here as the trajectory, not a slide.

          Full credits: This work is based on "Steam Deck"
          (https://sketchfab.com/3d-models/steam-deck-502407f2dab048728e1b63699bf99d45)
          by VM-Models licensed under CC-BY-4.0. This work is based on "Iphone 14 Pro"
          (https://sketchfab.com/3d-models/iphone-14-pro-5cb0778041a34f09b409a38c687bb1d4)
          by mister dude licensed under CC-BY-4.0.
        </aside>
      </Slide>

      {/* 10 */}
      <Slide>
        <Headline>three-flatland</Headline>
        <Subline>Make web games. First-class 2D. Go anywhere.</Subline>
        <p style={{ marginTop: '2rem', font: "600 1rem/1 Inter, sans-serif", color: 'var(--gold)' }}>
          [QR → Getting Started]
        </p>
        <aside className="notes">
          The advertisement close. Invite questions — leave one thread deliberately
          unpulled (Hylo / the native pipeline / a feature not shown) so the Q&A has
          an obvious place to start. Replace the QR placeholder with a generated code
          pointing at the Getting Started page.
        </aside>
      </Slide>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter docs astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/src/components/slides/make-web-games/slides/index.tsx
git commit -m "feat(make-web-games): add all ten slides with speaker notes"
```

---

### Task 10: Integration — deck assembly, page wiring, smoke test

**Files:**
- Create: `docs/src/components/slides/make-web-games/deck.tsx`
- Modify: `docs/src/pages/slides/make-web-games.astro`
- Create: `e2e/smoke-make-web-games.spec.ts` (repo root `e2e/`)

**Interfaces:**
- Consumes: `Presentation` (T6), `Slides` (T9), `DeckScene` (T8).
- Produces: `MakeWebGamesDeck()` default-exported React component; the page renders it as `client:only="react"`.

- [ ] **Step 1: Assemble the deck**

Create `docs/src/components/slides/make-web-games/deck.tsx`:
```tsx
import { Presentation } from '../../deck/Presentation'
import { Slides } from './slides'
import { DeckScene } from './scene/DeckScene'

export default function MakeWebGamesDeck() {
  return <Presentation slides={<Slides />} scene={<DeckScene />} />
}
```

- [ ] **Step 2: Wire the page to the island**

Replace the `<main>` body in `docs/src/pages/slides/make-web-games.astro` and add the import to the frontmatter:
```astro
---
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/silkscreen/latin-400.css'
import 'reveal.js/dist/reveal.css'
import '../../styles/deck.css'
import MakeWebGamesDeck from '../../components/slides/make-web-games/deck'
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Make Web Games — three-flatland</title>
  </head>
  <body>
    <MakeWebGamesDeck client:only="react" />
  </body>
</html>
```

- [ ] **Step 3: Write the smoke test**

Create `e2e/smoke-make-web-games.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('make-web-games deck mounts: canvas, 10 slides, notes, advances', async ({ page }) => {
  await page.goto('/slides/make-web-games')

  // R3F canvas backdrop present.
  await expect(page.locator('canvas.deck-bg, .deck-bg canvas').first()).toBeVisible({ timeout: 20_000 })

  // reveal initialized with exactly 10 sections, each carrying speaker notes.
  await expect(page.locator('.reveal .slides > section')).toHaveCount(10)
  expect(await page.locator('.reveal .slides aside.notes').count()).toBe(10)

  // First slide headline renders.
  await expect(page.getByText('MAKE WEB GAMES')).toBeVisible()

  // Advancing changes reveal's current index (scene director is store-driven off this).
  const indexBefore = await page.evaluate(() => (window as any).Reveal?.getIndices?.().h ?? 0)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const indexAfter = await page.evaluate(() => (window as any).Reveal?.getIndices?.().h ?? 0)
  expect(indexAfter).toBeGreaterThan(indexBefore)
})
```
Note: if `window.Reveal` is not global in this reveal version, instead assert the active section changed via `.reveal .slides section.present` text. Verify which during implementation.

- [ ] **Step 4: Full build**

Run: `pnpm --filter docs build`
Expected: `astro check` 0 errors, `astro build` completes, route `/slides/make-web-games` emitted.

- [ ] **Step 5: Run the smoke test**

Run: `pnpm exec playwright test e2e/smoke-make-web-games.spec.ts`
Expected: 1 passed. (Playwright's `webServer` builds+previews docs per `playwright.config.ts`.)

- [ ] **Step 6: Commit**

```bash
git add docs/src/components/slides/make-web-games/deck.tsx docs/src/pages/slides/make-web-games.astro e2e/smoke-make-web-games.spec.ts
git commit -m "feat(make-web-games): assemble deck, wire page, add smoke test"
```

---

## Deferred (later phases — captured, not in this plan)

- **Real feature demos** in slides 6–8 (live SpriteGroup batch, tilemap + Forward+ lighting, radiance cascades GI) replacing the scaffold mesh.
- **GO NATIVE device render-to-texture:** optimize `assets-src/devices/steam-deck` (and `iphone-14-pro`) via gltf-transform into `docs/public/slides/make-web-games/`, load on slide 9, swap the screen material (Steam Deck: replace `steam_deck_mat03` mesh material; iPhone: offline screen-split or emissive-mask TSL composite) with a `RenderTarget` rendering a flatland demo. See spec Assets section.
- **Sourced statistics** for slide 3 (verified market-size / player / revenue figures).
- **Real QR code** on slide 10 pointing at Getting Started.
- **Reduced-motion** pass (collapse camera easing when `prefers-reduced-motion`).

## Self-Review

- **Spec coverage:** route/page (T1), engine store+beats+canvas+director+presentation+primitives (T2–T6), 10 slides with notes (T9), beats (T7), scene scaffold (T8), integration+smoke (T10), CC-BY credits (T9), reusable layout (deck/ vs slides/<name>/). Deferred items match the spec's deferred list. ✓
- **Placeholder scan:** `[SOURCE]` / `[QR …]` markers are intentional content placeholders mandated by the spec and called out in notes + Deferred — not plan-step gaps. No "TODO/implement later" in steps. ✓
- **Type consistency:** `DeckPosition`, `SceneBeat`/`CameraPose`/`resolveBeat`, `usePosition`/`setPosition`, `Presentation({slides,scene})`, `Slides()`, `DeckScene()`, `beats` are used consistently across tasks. ✓
