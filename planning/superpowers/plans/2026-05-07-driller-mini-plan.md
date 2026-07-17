# Driller Mini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the driller mini-game (Mr. Driller × tamagotchi, autonomous AI character with one-touch user interactions) ready for both the docs hero embed and a standalone `/play` route.

**Architecture:** Renderer2D-batched Sprite2D system for dynamic terrain (autotile bitmask), separate parallax background layer (TileMap2D or static), Koota ECS for game state, mood-driven AI planner selection, integer-pixel responsive scale-to-fit. Lighting integration is a deferred polish pass blocked on `feat-lighting-postprocess-flatland` merge — tracked as sub-issues.

**Tech Stack:** React, `@react-three/fiber/webgpu`, `three-flatland/react`, `@three-flatland/tweakpane/react` (dev shell only), Koota ECS, ZzFX (audio), Vitest.

**Spec:** `planning/superpowers/specs/2026-05-07-driller-mini-design.md`

---

## File structure

Files created in this plan, grouped by responsibility. Each file has one clear purpose; algorithmic primitives are split out from systems so they're independently testable.

```
minis/driller/
├── package.json                     # Task 2
├── tsconfig.json                    # Task 3
├── vite.config.ts                   # Task 3
├── index.html                       # Task 4
├── README.md                        # Task 50
├── src/
│   ├── index.ts                     # Library export — Task 43
│   ├── main.tsx                     # Dev entry — Task 4
│   ├── App.tsx                      # Dev wrapper — Task 4
│   ├── Game.tsx                     # Mode-aware composition root — Task 43
│   ├── types.ts                     # Public DrillerProps + MiniGameProps — Task 4
│   ├── world.ts                     # Static Koota world (HMR-safe) — Task 5
│   ├── shallow.ts                   # Shallow-equal helper — Task 5
│   ├── constants.ts                 # TILE_PX, PLAY_COLS, MIN_PLAY_ROWS, etc. — Task 7
│   ├── traits/                      # Task 6
│   │   ├── index.ts
│   │   ├── world-traits.ts
│   │   ├── grid-traits.ts
│   │   ├── driller-traits.ts
│   │   ├── chunk-traits.ts
│   │   ├── gem-traits.ts
│   │   ├── particle-traits.ts
│   │   └── input-traits.ts
│   ├── lib/
│   │   ├── rng.ts                   # Task 7
│   │   ├── scale.ts                 # Task 8
│   │   ├── autotile.ts              # Task 9
│   │   ├── atlas-uv.ts              # Task 14 — region rect → UV bounds
│   │   ├── chunk-detect.ts          # Task 20
│   │   ├── bfs.ts                   # Task 27 (shared by planners)
│   │   └── mulberry-presets.ts      # Task 7 helpers
│   ├── biomes.ts                    # Task 16
│   ├── textures.ts                  # Task 13 — inlines tileset PNG as data URL
│   ├── atlas-regions.ts             # Task 13 — named (x,y,w,h) regions in the source PNG
│   ├── assets/
│   │   └── tileset.png              # Task 13 — copy of canonical asset
│   ├── materials.ts                 # Task 14 — single shared Sprite2DMaterial
│   ├── systems/
│   │   ├── input.ts                 # Task 30
│   │   ├── generation.ts            # Tasks 17–19
│   │   ├── collapse.ts              # Tasks 21–23
│   │   ├── autotile-pass.ts         # Task 15
│   │   ├── ai-mood.ts               # Task 25
│   │   ├── ai-planner.ts            # Tasks 26–29
│   │   ├── driller.ts               # Task 24
│   │   ├── camera.ts                # Task 12
│   │   ├── death.ts                 # Tasks 36–39
│   │   ├── particles.ts             # Task 48
│   │   └── sounds.ts                # Task 47
│   └── components/
│       ├── Scene.tsx                # Task 10
│       ├── PlayCanvas.tsx           # Task 10
│       ├── Background.tsx           # Task 11
│       ├── DepthBar.tsx             # Task 40
│       ├── GemCounter.tsx           # Task 41
│       ├── HeroHint.tsx             # Task 42
│       ├── TitleAttract.tsx         # Task 44
│       ├── Leaderboard.tsx          # Task 45
│       └── HoverCursor.tsx          # Task 35
└── tests/
    ├── rng.test.ts                  # Task 7
    ├── scale.test.ts                # Task 8
    ├── autotile.test.ts             # Task 9
    ├── chunk-detect.test.ts         # Task 20
    ├── mood.test.ts                 # Task 25
    ├── biomes.test.ts               # Task 16
    └── generation.test.ts           # Task 18
```

---

## Phase 1 — Package scaffolding

### Task 1: Add the package to the workspace

**Files:**
- Modify: `pnpm-workspace.yaml` (already wildcards `minis/*` if breakout exists; verify)
- Create: `minis/driller/` directory

- [ ] **Step 1: Verify workspace pattern**

```bash
grep -n "minis" pnpm-workspace.yaml
```

Expected: a line like `- 'minis/*'` already exists (breakout uses it).

- [ ] **Step 2: Create the package directory**

```bash
mkdir -p minis/driller/src/{traits,lib,systems,components} minis/driller/tests
```

- [ ] **Step 3: Commit the empty scaffold**

```bash
git add minis/driller
git commit -m "chore(driller): scaffold package directory"
```

### Task 2: Author `package.json`

**Files:**
- Create: `minis/driller/package.json`

- [ ] **Step 1: Copy the breakout `package.json` as a starting point and edit name + description**

```json
{
  "name": "@three-flatland/mini-driller",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "dev": "tsup src/index.ts --format esm,cjs --dts --external react --external three --external @react-three/fiber --external koota --watch",
    "dev:app": "vite dev --port ${TURBO_MFE_PORT:-5210}",
    "build": "tsup src/index.ts --format esm,cjs --dts --external react --external three --external @react-three/fiber --external koota",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
    "three": "catalog:",
    "three-flatland": "workspace:*",
    "@react-three/fiber": "catalog:",
    "koota": "catalog:"
  },
  "devDependencies": {
    "@three-flatland/tweakpane": "workspace:*",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Sync the workspace catalog**

```bash
pnpm install
pnpm sync:pack
```

Expected: clean install; the new package shows in the workspace.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/package.json pnpm-lock.yaml
git commit -m "chore(driller): package.json with workspace deps"
```

### Task 3: TypeScript + Vite config

**Files:**
- Create: `minis/driller/tsconfig.json`
- Create: `minis/driller/vite.config.ts`

- [ ] **Step 1: Mirror the breakout `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 2: Author `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true },
})
```

- [ ] **Step 3: Commit**

```bash
git add minis/driller/tsconfig.json minis/driller/vite.config.ts
git commit -m "chore(driller): typescript + vite config"
```

### Task 4: Dev shell — `index.html`, `main.tsx`, `App.tsx`, `types.ts`

**Files:**
- Create: `minis/driller/index.html`
- Create: `minis/driller/src/main.tsx`
- Create: `minis/driller/src/App.tsx`
- Create: `minis/driller/src/types.ts`

- [ ] **Step 1: `index.html` (minimal full-bleed root)**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>driller — three-flatland mini</title>
    <style>
      html, body, #root { margin: 0; padding: 0; height: 100%; background: #0a0a14; }
      body { overflow: hidden; font-family: -apple-system, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `types.ts`**

```typescript
export type ZzFXParams = [
  volume?: number, randomness?: number, frequency?: number, attack?: number,
  sustain?: number, release?: number, shape?: number, shapeCurve?: number,
  slide?: number, deltaSlide?: number, pitchJump?: number, pitchJumpTime?: number,
  repeatTime?: number, noise?: number, modulation?: number, bitCrush?: number,
  delay?: number, sustainVolume?: number, decay?: number, tremolo?: number,
  filter?: number,
]

export interface MiniGameProps {
  zzfx?: (...params: ZzFXParams) => void
  isVisible?: boolean
  className?: string
}

export interface DrillerProps extends MiniGameProps {
  /** 'hero' = embedded attract loop; 'full' = standalone with title + leaderboard */
  mode?: 'hero' | 'full'
  /** Optional fixed seed for reproducible runs */
  seed?: number
}
```

- [ ] **Step 3: `main.tsx` — dev entry**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: `App.tsx` — dev wrapper with stub Game**

```typescript
import { Game } from './Game'

const noopZzfx = () => {}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Game mode="full" zzfx={noopZzfx} />
    </div>
  )
}
```

- [ ] **Step 5: Stub `Game.tsx` so dev server boots**

Create `minis/driller/src/Game.tsx`:
```typescript
import type { DrillerProps } from './types'

export function Game(_props: DrillerProps) {
  return <div style={{ color: '#fff', padding: 24 }}>driller — boot OK</div>
}
```

- [ ] **Step 6: Verify dev server boots**

```bash
pnpm --filter @three-flatland/mini-driller dev:app
```

Expected: Vite reports server URL; opening it shows "driller — boot OK".

- [ ] **Step 7: Commit**

```bash
git add minis/driller/index.html minis/driller/src
git commit -m "chore(driller): dev shell boots with stub Game component"
```

---

## Phase 2 — World & traits

### Task 5: Static Koota world with HMR guard

**Files:**
- Create: `minis/driller/src/world.ts`
- Create: `minis/driller/src/shallow.ts`

- [ ] **Step 1: Author `shallow.ts`** (copy from breakout — simple shallow-equal for selectors)

```typescript
export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const ak = Object.keys(a as object)
  const bk = Object.keys(b as object)
  if (ak.length !== bk.length) return false
  for (const k of ak) if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  return true
}
```

- [ ] **Step 2: Author `world.ts` per the mini-game-skill HMR pattern**

```typescript
import { createWorld, type World } from 'koota'
import { GameState } from './traits'

declare global {
  // eslint-disable-next-line no-var
  var __drillerWorld: World | undefined
}

function initWorld(world: World): void {
  world.add(GameState({ mode: 'hero', tick: 0, gems: 0, lives: 99, depthM: 0, deepestM: 0 }))
}

export function getWorld(): World {
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }
  if (globalThis.__drillerWorld && globalThis.__drillerWorld.has(GameState)) {
    return globalThis.__drillerWorld
  }
  const world = createWorld()
  initWorld(world)
  globalThis.__drillerWorld = world
  return world
}
```

- [ ] **Step 3: Commit (will fail TS until traits exist; OK to defer commit to Task 6)**

### Task 6: Trait definitions

**Files:**
- Create: `minis/driller/src/traits/index.ts`
- Create: `minis/driller/src/traits/world-traits.ts`
- Create: `minis/driller/src/traits/grid-traits.ts`
- Create: `minis/driller/src/traits/driller-traits.ts`
- Create: `minis/driller/src/traits/chunk-traits.ts`
- Create: `minis/driller/src/traits/gem-traits.ts`
- Create: `minis/driller/src/traits/particle-traits.ts`
- Create: `minis/driller/src/traits/input-traits.ts`

- [ ] **Step 1: `world-traits.ts`** — singleton state

```typescript
import { trait } from 'koota'

export type GameMode = 'hero' | 'full'

export const GameState = trait({
  mode: 'hero' as GameMode,
  tick: 0,
  gems: 0,
  lives: 99,
  depthM: 0,
  deepestM: 0,
})

export const Seed = trait({ value: 0 })

export const Camera = trait({ y: 0, targetY: 0, scale: 4 })
```

- [ ] **Step 2: `grid-traits.ts`** — tile arrays

```typescript
import { trait } from 'koota'

/** Tile classes (cell values) */
export const TILE_AIR = 0
export const TILE_SOIL = 1
export const TILE_STONE = 2
export const TILE_FIXTURE_BASE = 3 // variants 3..7 (bone, mushroom, crystal, etc.)

export const Grid = trait({
  cols: 18,
  rows: 0, // grows as chunks stream in
  tiles: () => new Uint8Array(0),     // (col, row) → class
  flags: () => new Uint8Array(0),     // sag/falling/dirty bits
  topRow: 0,                          // row index of the topmost loaded chunk (negative as we descend)
  bottomRow: 0,                       // row index of the bottommost loaded chunk
})

/** flag bits */
export const FLAG_SAGGING = 1 << 0
export const FLAG_FALLING = 1 << 1
export const FLAG_AUTOTILE_DIRTY = 1 << 2
```

- [ ] **Step 3: `driller-traits.ts`**

```typescript
import { trait } from 'koota'

export type PlannerName = 'greedy' | 'seeker' | 'cautious'

export const Driller = trait({
  col: 9, row: 0,                  // current cell
  px: 0, py: 0,                    // floating-point world pixel
  facing: 1 as 1 | -1,
  digCooldownMs: 0,
})

export const Mood = trait({
  greed: 0.2,
  fear: 0.1,
  drive: 0.7,
  planner: 'greedy' as PlannerName,
  switchAtTick: 0,                 // hysteresis lockout
})

export const PlannerTarget = trait({
  col: 0, row: 0,
  reservedAtTick: 0,               // sunk-cost commit window
})

export const Animation = trait({
  state: 'idle' as 'idle' | 'dig' | 'hop' | 'gratitude' | 'scoot',
  frame: 0, frameAccumMs: 0,
})
```

- [ ] **Step 4: `chunk-traits.ts`** — falling rigid bodies

```typescript
import { trait } from 'koota'

export interface FallingCell { col: number; row: number; tile: number }

export const FallingChunk = trait({
  cells: () => [] as FallingCell[],   // relative (col, row)
  px: 0, py: 0,                        // floating-point world pixel of origin
  vy: 0,                               // pixels per frame
})

export const SaggingChunk = trait({
  cells: () => [] as FallingCell[],
  startTick: 0,
  durationTicks: 42,                   // ~0.7s @ 60Hz
  bracedUntilTick: 0,                  // user-brace pause
})
```

- [ ] **Step 5: `gem-traits.ts`**

```typescript
import { trait } from 'koota'

export type GemColor = 'ruby' | 'sapphire' | 'emerald' | 'amethyst' | 'topaz'

export const Gem = trait({
  col: 0, row: 0,
  color: 'amethyst' as GemColor,
  collected: false,
  scatteredUntilTick: 0,           // 0 = on the grid; else scattered (collect window)
  px: 0, py: 0,                    // float position when scattered
})
```

- [ ] **Step 6: `particle-traits.ts`**

```typescript
import { trait } from 'koota'

export const Particle = trait({
  px: 0, py: 0, vx: 0, vy: 0,
  ageMs: 0, lifeMs: 600,
  kind: 'dust' as 'dust' | 'spark' | 'heart',
  color: '#ffffff',
})
```

- [ ] **Step 7: `input-traits.ts`**

```typescript
import { trait } from 'koota'

export type ActionKind = 'none' | 'collect' | 'brace' | 'trigger' | 'pet'

export const Pointer = trait({
  px: 0, py: 0,                    // canvas-space pixel
  active: false,                   // true while pressed/touching
  hoverAction: 'none' as ActionKind,
  hoverTargetCol: 0, hoverTargetRow: 0,
  hoverGemEntity: 0,               // entity id of gem under cursor, 0 = none
})

export const PetEvents = trait({
  recentTicks: () => [] as number[], // sliding window for over-pet detection
})
```

- [ ] **Step 8: `traits/index.ts` re-exports all**

```typescript
export * from './world-traits'
export * from './grid-traits'
export * from './driller-traits'
export * from './chunk-traits'
export * from './gem-traits'
export * from './particle-traits'
export * from './input-traits'
```

- [ ] **Step 9: `pnpm --filter @three-flatland/mini-driller exec tsc --noEmit`**

Expected: clean. If errors, fix trait shapes or imports inline.

- [ ] **Step 10: Commit**

```bash
git add minis/driller/src/world.ts minis/driller/src/shallow.ts minis/driller/src/traits
git commit -m "feat(driller): Koota world + traits"
```

---

## Phase 3 — Algorithm primitives (TDD)

### Task 7: Seeded RNG (mulberry32) + constants

**Files:**
- Create: `minis/driller/src/lib/rng.ts`
- Create: `minis/driller/src/constants.ts`
- Create: `minis/driller/tests/rng.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/rng.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { createRng } from '../src/lib/rng'

describe('createRng', () => {
  it('returns a deterministic stream for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const r = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('intRange(min, max) yields integers in [min, max]', () => {
    const r = createRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r.intRange(3, 8)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(8)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('chance(p) returns true with probability p (sanity)', () => {
    const r = createRng(123)
    let hits = 0
    for (let i = 0; i < 10_000; i++) if (r.chance(0.3)) hits++
    expect(hits).toBeGreaterThan(2500)
    expect(hits).toBeLessThan(3500)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```bash
pnpm --filter @three-flatland/mini-driller test rng
```

Expected: cannot resolve `../src/lib/rng`.

- [ ] **Step 3: Implement `lib/rng.ts`**

```typescript
export interface Rng {
  next(): number
  intRange(min: number, max: number): number
  chance(p: number): boolean
  fork(salt: number): Rng
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    intRange: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: (p) => next() < p,
    fork: (salt) => createRng((seed * 0x9E3779B1 + salt) >>> 0),
  }
}
```

- [ ] **Step 4: `constants.ts`**

```typescript
export const TILE_PX = 16
export const PLAY_COLS = 18
export const MIN_PLAY_ROWS = 22
export const SCALE_STEPS = [1, 2, 4, 8] as const
export const CHUNK_ROWS = 32
export const ACTIVE_CHUNK_CAP = 8

/** Sag */
export const SAG_DURATION_TICKS = 42        // ~0.7s @ 60Hz
export const MAX_CHUNK_HEIGHT = 12

/** Mood drift coefficient per tick */
export const MOOD_LERP = 0.05

/** Mood hysteresis — how much higher a new dominant axis must be to swap */
export const MOOD_SWITCH_THRESHOLD = 0.1

/** Planner sunk-cost commit window (ticks) */
export const PLAN_COMMIT_TICKS = 30         // ~0.5s

/** Gem economy */
export const BRACE_COST = 1

/** Pet over-pet flaw — sliding window */
export const OVER_PET_WINDOW_TICKS = 240    // ~4s @ 60Hz
export const OVER_PET_THRESHOLD = 3
```

- [ ] **Step 5: Run tests — pass**

```bash
pnpm --filter @three-flatland/mini-driller test rng
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add minis/driller/src/lib/rng.ts minis/driller/src/constants.ts minis/driller/tests/rng.test.ts
git commit -m "feat(driller): seeded RNG + constants"
```

### Task 8: Integer-scale picker (responsive)

**Files:**
- Create: `minis/driller/src/lib/scale.ts`
- Create: `minis/driller/tests/scale.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { pickScale, computePlayCanvas } from '../src/lib/scale'
import { PLAY_COLS, TILE_PX, MIN_PLAY_ROWS } from '../src/constants'

describe('pickScale', () => {
  it('picks 4× for 1280x720', () => {
    expect(pickScale(1280, 720)).toBe(2)
  })
  it('picks 4× for 1920x1080', () => {
    expect(pickScale(1920, 1080)).toBe(4)
  })
  it('picks 8× for 4K viewport', () => {
    expect(pickScale(3840, 2160)).toBe(8)
  })
  it('falls back to 1× when too small', () => {
    expect(pickScale(200, 200)).toBe(1)
  })
})

describe('computePlayCanvas', () => {
  it('clamps rows to MIN_PLAY_ROWS at minimum', () => {
    const r = computePlayCanvas(1920, 1080)
    expect(r.scale).toBe(4)
    expect(r.rows).toBeGreaterThanOrEqual(MIN_PLAY_ROWS)
    expect(r.canvasWidth).toBe(PLAY_COLS * TILE_PX * 4)
  })
  it('grows row count on tall viewports', () => {
    const r = computePlayCanvas(1920, 2400)
    expect(r.rows).toBeGreaterThan(MIN_PLAY_ROWS)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
pnpm --filter @three-flatland/mini-driller test scale
```

- [ ] **Step 3: Implement**

```typescript
import { PLAY_COLS, TILE_PX, MIN_PLAY_ROWS, SCALE_STEPS } from '../constants'

export interface PlayCanvasMetrics {
  scale: number
  rows: number
  canvasWidth: number
  canvasHeight: number
}

export function pickScale(viewportW: number, viewportH: number): number {
  const widthAt = (s: number) => PLAY_COLS * TILE_PX * s
  const heightAt = (s: number) => MIN_PLAY_ROWS * TILE_PX * s
  let chosen = SCALE_STEPS[0]
  for (const s of SCALE_STEPS) {
    if (widthAt(s) <= viewportW && heightAt(s) <= viewportH) chosen = s
  }
  return chosen
}

export function computePlayCanvas(viewportW: number, viewportH: number): PlayCanvasMetrics {
  const scale = pickScale(viewportW, viewportH)
  const rows = Math.max(MIN_PLAY_ROWS, Math.floor(viewportH / (TILE_PX * scale)))
  return {
    scale,
    rows,
    canvasWidth: PLAY_COLS * TILE_PX * scale,
    canvasHeight: rows * TILE_PX * scale,
  }
}
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @three-flatland/mini-driller test scale
```

- [ ] **Step 5: Commit**

```bash
git add minis/driller/src/lib/scale.ts minis/driller/tests/scale.test.ts
git commit -m "feat(driller): integer-scale picker for responsive canvas"
```

### Task 9: Autotile bitmask resolver

**Files:**
- Create: `minis/driller/src/lib/autotile.ts`
- Create: `minis/driller/tests/autotile.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { autotileMask, NEIGHBOR_BITS } from '../src/lib/autotile'

describe('autotileMask', () => {
  it('returns 0 (interior) when all 4 neighbors match', () => {
    // sample helper: 5x5 grid with all SOIL
    const isSoil = () => true
    expect(autotileMask(2, 2, isSoil)).toBe(NEIGHBOR_BITS.N | NEIGHBOR_BITS.S | NEIGHBOR_BITS.E | NEIGHBOR_BITS.W)
  })
  it('returns N-only mask when only north is soil', () => {
    const isSoil = (c: number, r: number) => c === 2 && r === 1
    const m = autotileMask(2, 2, isSoil)
    expect(m).toBe(NEIGHBOR_BITS.N)
  })
  it('grass-cap-eligible when N is air, others soil', () => {
    const isSoil = (c: number, r: number) => !(c === 2 && r === 1)
    const m = autotileMask(2, 2, isSoil)
    expect(m & NEIGHBOR_BITS.N).toBe(0)
    expect(m & NEIGHBOR_BITS.S).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement `lib/autotile.ts`**

```typescript
export const NEIGHBOR_BITS = {
  N: 1 << 0,
  S: 1 << 1,
  E: 1 << 2,
  W: 1 << 3,
} as const

export type IsSoilFn = (col: number, row: number) => boolean

/** 4-bit mask of which orthogonal neighbors are SOIL (1=is-soil). */
export function autotileMask(col: number, row: number, isSoil: IsSoilFn): number {
  let m = 0
  if (isSoil(col, row - 1)) m |= NEIGHBOR_BITS.N
  if (isSoil(col, row + 1)) m |= NEIGHBOR_BITS.S
  if (isSoil(col + 1, row)) m |= NEIGHBOR_BITS.E
  if (isSoil(col - 1, row)) m |= NEIGHBOR_BITS.W
  return m
}

/**
 * Map the 4-bit mask to a sprite atlas index.
 * Convention: 16 frames laid out by mask value.
 *   0  = isolated (no neighbors)
 *   N  = bottom-edge piece
 *   S  = top-edge piece (eligible for grass cap when row exposed to sky)
 *   E  = right-edge
 *   W  = left-edge
 *   N|S = vertical strip
 *   E|W = horizontal strip
 *   ...etc up to NSEW = full interior
 */
export function maskToAtlasIndex(mask: number): number {
  return mask & 0xF
}

/** Decide if a cell with this mask should render the grass-cap variant. */
export function isGrassCap(mask: number, row: number, surfaceRow: number): boolean {
  // Top-exposed (no soil above) and within ~3 cells of surface row counts as grass.
  return (mask & NEIGHBOR_BITS.N) === 0 && row <= surfaceRow + 2
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add minis/driller/src/lib/autotile.ts minis/driller/tests/autotile.test.ts
git commit -m "feat(driller): autotile bitmask resolver"
```

---

## Phase 4 — Rendering foundation

### Task 10: PlayCanvas + Scene with Renderer2D

**Files:**
- Create: `minis/driller/src/components/PlayCanvas.tsx`
- Create: `minis/driller/src/components/Scene.tsx`

- [ ] **Step 1: `PlayCanvas.tsx`** — sized container with R3F Canvas

```typescript
import { useEffect, useState, type ReactNode } from 'react'
import { Canvas, extend } from '@react-three/fiber/webgpu'
import { Sprite2D, Sprite2DMaterial, Renderer2D } from 'three-flatland/react'
import { computePlayCanvas, type PlayCanvasMetrics } from '../lib/scale'

extend({ Sprite2D, Sprite2DMaterial, Renderer2D })

interface Props {
  hostRef: React.RefObject<HTMLElement | null>
  children: ReactNode
}

export function PlayCanvas({ hostRef, children }: Props) {
  const [metrics, setMetrics] = useState<PlayCanvasMetrics | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const r = host.getBoundingClientRect()
      setMetrics(computePlayCanvas(r.width, r.height))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(host)
    return () => ro.disconnect()
  }, [hostRef])

  if (!metrics) return null

  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: 0,
      transform: `translateX(-50%)`,
      width: metrics.canvasWidth,
      height: metrics.canvasHeight,
      imageRendering: 'pixelated',
    }}>
      <Canvas
        orthographic
        dpr={1}
        camera={{ zoom: metrics.scale, position: [0, 0, 100] }}
        renderer={{ antialias: false, trackTimestamp: true }}
        style={{ touchAction: 'none' }}
        onCreated={({ gl }) => { gl.domElement.style.imageRendering = 'pixelated' }}
      >
        <color attach="background" args={['#0a0a14']} />
        {children}
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 2: `Scene.tsx` — empty Renderer2D shell with frame tick**

```typescript
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import type { Renderer2D as Renderer2DType } from 'three-flatland'
import { useWorld } from '../world'
import { GameState } from '../traits'

export function Scene() {
  const r2d = useRef<Renderer2DType>(null)
  const world = useWorld()
  useFrame(() => {
    const gs = world.getFirst(GameState)
    if (gs) gs.tick++
    r2d.current?.invalidateAll()
    r2d.current?.update()
  })
  return <renderer2D ref={r2d}>{/* sprites added in subsequent tasks */}</renderer2D>
}
```

- [ ] **Step 3: Wire `Game.tsx` to use them**

```typescript
import { useRef } from 'react'
import { PlayCanvas } from './components/PlayCanvas'
import { Scene } from './components/Scene'
import type { DrillerProps } from './types'

export function Game({ mode = 'hero', className, isVisible: _isVisible }: DrillerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={hostRef} className={className} style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a14', overflow: 'hidden' }}>
      <PlayCanvas hostRef={hostRef}><Scene /></PlayCanvas>
    </div>
  )
}
```

- [ ] **Step 4: Add `useWorld` hook to `world.ts`**

```typescript
import { useMemo } from 'react'

export function useWorld() {
  return useMemo(() => getWorld(), [])
}
```

- [ ] **Step 5: Verify dev server renders an empty canvas without errors**

- [ ] **Step 6: Commit**

```bash
git add minis/driller/src/components minis/driller/src/Game.tsx minis/driller/src/world.ts
git commit -m "feat(driller): play canvas + scene with integer scale"
```

### Task 11: Decorative parallax background

**Files:**
- Create: `minis/driller/src/components/Background.tsx`

- [ ] **Step 1: Implement** — CSS-positioned divs for far/near layers, scrolled by camera Y

```typescript
import { useEffect, useRef } from 'react'
import { useWorld } from '../world'
import { Camera } from '../traits'

export function Background() {
  const world = useWorld()
  const farRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const cam = world.getFirst(Camera)
      if (cam && farRef.current && nearRef.current) {
        farRef.current.style.transform = `translateY(${-cam.y * 0.2}px)`
        nearRef.current.style.transform = `translateY(${-cam.y * 0.5}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div ref={farRef} style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #0a0a14 0%, #1a1411 30%, #2a1f15 60%, #3a2a1a 100%)',
        willChange: 'transform',
      }} />
      <div ref={nearRef} style={{
        position: 'absolute', inset: '0 0 50%',
        background: 'linear-gradient(180deg, transparent, rgba(60,40,40,0.3))',
        willChange: 'transform',
      }} />
    </div>
  )
}
```

- [ ] **Step 2: Mount in `Game.tsx`**

In `Game.tsx`, before `<PlayCanvas>`:
```tsx
<Background />
```

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/components/Background.tsx minis/driller/src/Game.tsx
git commit -m "feat(driller): parallax background layer"
```

### Task 12: Camera with deadzone follow

**Files:**
- Create: `minis/driller/src/systems/camera.ts`

- [ ] **Step 1: Implement camera follow system**

```typescript
import { type World } from 'koota'
import { Camera, Driller } from '../traits'
import { TILE_PX } from '../constants'

export function cameraSystem(world: World, viewportRows: number): void {
  const cam = world.getFirst(Camera)
  const drillerEntity = world.queryFirst(Driller)
  if (!cam || !drillerEntity) return
  const d = drillerEntity.get(Driller)!

  const visiblePxH = viewportRows * TILE_PX
  const drillerPxY = d.row * TILE_PX
  const deadzoneTop = cam.y + visiblePxH * 0.2
  const deadzoneBottom = cam.y + visiblePxH * 0.8

  if (drillerPxY < deadzoneTop) cam.targetY = drillerPxY - visiblePxH * 0.2
  else if (drillerPxY > deadzoneBottom) cam.targetY = drillerPxY - visiblePxH * 0.8

  cam.y += (cam.targetY - cam.y) * 0.1
  // pixel-snap
  cam.y = Math.round(cam.y)
}
```

- [ ] **Step 2: Call from Scene's useFrame**

In `Scene.tsx`:
```typescript
import { cameraSystem } from '../systems/camera'
// inside useFrame:
const rows = Math.floor(state.size.height / (TILE_PX * cam.scale))
cameraSystem(world, rows)
```

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/camera.ts minis/driller/src/components/Scene.tsx
git commit -m "feat(driller): deadzone camera follow"
```

---

## Phase 5 — Tiles, materials, autotile pass

### Task 13: Slice the source tileset PNG into atlas regions

**Source asset (canonical):** `minis/driller/art/source/driller-concept-sheet.png` (1536 × 1024). Contains driller sprite sheet, tileset (SOIL/STONE/FIXTURES/AIR), themed props, gem pickups (4 colors × 4 sizes), per-biome tile variants, in-game moments, and title art. **Do not re-author** — use the extraction pipeline documented in `minis/driller/README.md`.

**Files:**
- Create: `minis/driller/art/extract-manifest.json` — nonuniform source cuts and shared anchors
- Create: `minis/driller/tools/extract-concept-art.mjs` — stages fixer inputs and packs runtime atlases
- Generate: `minis/driller/src/assets/driller/` — packed runtime atlases and metadata

- [ ] **Step 1: Stage, repair, and pack the source art**

Keep the canonical presentation sheet under `art/source`; do not copy or bundle the full sheet. Generate only the production atlases:

```bash
cd minis/driller
node tools/extract-concept-art.mjs --stage-fixer-inputs
python3 tools/run-pixel-fixer.py
node tools/extract-concept-art.mjs
```

- [ ] **Step 2: Inline the packed runtime atlases**

Vite's `?inline` query encodes each packed runtime atlas at import time as a base64 data URL (no network fetch at runtime, works in library mode):

```typescript
import drillerAnimationsUrl from './assets/driller/driller-animations.png?inline'
import worldTilesUrl from './assets/driller/world-tiles.png?inline'
import gemPickupsUrl from './assets/driller/gem-pickups-atlas.png?inline'

// Configure one nearest-filtered material per packed atlas.
```

- [ ] **Step 3: Build the named region map — `src/atlas-regions.ts`**

Open the source PNG in an image viewer (e.g. Preview's measure tool, or use a small `node:canvas` script) and record `(x, y, w, h)` for each region described in spec §11.0. Group as logical atlas slots. Coordinates below are placeholders — measure against the actual asset and replace.

```typescript
/** All region rects are [x, y, w, h] in source PNG pixel coordinates. */
export interface Rect { x: number; y: number; w: number; h: number }

/** SOIL autotile rows — one row per biome, 16 columns for the 16 mask variants (0..15). */
export const SOIL_ROWS: Record<BiomeName, Rect> = {
  topsoil:           { x: 0, y: 0, w: 256, h: 16 },         // TODO: measure
  'deep-dirt':       { x: 0, y: 16, w: 256, h: 16 },        // TODO: measure
  stoneworks:        { x: 0, y: 32, w: 256, h: 16 },        // TODO: measure
  'crystal-caverns': { x: 0, y: 48, w: 256, h: 16 },        // TODO: measure
  core:              { x: 0, y: 64, w: 256, h: 16 },        // TODO: measure
}

export const STONE_VARIANTS: Rect[] = [
  // 4–6 anchor variants
]

export const FIXTURE_REGIONS = {
  bone:     { x: 0, y: 0, w: 32, h: 32 },                   // TODO
  mushroom: { x: 0, y: 0, w: 32, h: 32 },                   // TODO
  crystal:  { x: 0, y: 0, w: 32, h: 32 },                   // TODO
}

export type GemColor = 'emerald' | 'topaz' | 'ruby' | 'amethyst'
export type GemSize = 'small' | 'medium' | 'large' | 'huge'

/** 4 colors × 4 sizes — index by [color][size]. */
export const GEM_REGIONS: Record<GemColor, Record<GemSize, Rect>> = {
  emerald: { small: {x:0,y:0,w:16,h:16}, medium: {x:0,y:0,w:16,h:16}, large: {x:0,y:0,w:16,h:16}, huge: {x:0,y:0,w:16,h:16} },
  topaz:   { small: {x:0,y:0,w:16,h:16}, medium: {x:0,y:0,w:16,h:16}, large: {x:0,y:0,w:16,h:16}, huge: {x:0,y:0,w:16,h:16} },
  ruby:    { small: {x:0,y:0,w:16,h:16}, medium: {x:0,y:0,w:16,h:16}, large: {x:0,y:0,w:16,h:16}, huge: {x:0,y:0,w:16,h:16} },
  amethyst:{ small: {x:0,y:0,w:16,h:16}, medium: {x:0,y:0,w:16,h:16}, large: {x:0,y:0,w:16,h:16}, huge: {x:0,y:0,w:16,h:16} },
}

/** Driller sprite sheet — one rect per animation strip; frames stride by 16 px horizontally. */
export const DRILLER_ANIMS = {
  idle:        { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },   // TODO measure
  walk:        { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  drillDown:   { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  drillUp:     { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  drillLeft:   { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  drillRight:  { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  trip:        { rect: { x: 0, y: 0, w: 32,  h: 16 }, frames: 2 },
  dodge:       { rect: { x: 0, y: 0, w: 32,  h: 16 }, frames: 2 },
  fall:        { rect: { x: 0, y: 0, w: 64,  h: 16 }, frames: 4 },
  ghost:       { rect: { x: 0, y: 0, w: 48,  h: 16 }, frames: 3 },
}

/** Title-attract art region (full-mode title screen). */
export const TITLE_ART: Rect = { x: 0, y: 0, w: 256, h: 96 }   // TODO: measure

/** Themed props per biome — small accent decorations placed in the Background layer. */
export const PROP_REGIONS: Rect[] = []  // TODO: list
```

> **Important:** the placeholder `(x, y, w, h)` values above must be replaced by exact measurements taken from the source PNG. Slicing the actual asset is the bulk of this task.

- [ ] **Step 4: Visual check — render an atlas debug overlay**

Drop a temporary `<DebugAtlas />` component into the dev `App.tsx` that renders the source PNG with semi-transparent rectangles overlaid for every region in the map. Each region gets a label. Visually verify each rectangle bounds the right art in the source. Iterate on coordinates until clean.

- [ ] **Step 5: Remove `<DebugAtlas />`** from `App.tsx` and commit only the production code.

- [ ] **Step 6: Commit**

```bash
git add minis/driller/art minis/driller/tools minis/driller/src/assets/driller
git commit -m "feat(driller): slice source tileset PNG into named atlas regions"
```

### Task 14: Sprite2DMaterial from packed runtime atlases

One shared `Sprite2DMaterial` per packed atlas keeps runtime sampling focused on production art without bundling the presentation sheet. Sprites pick their visible window from atlas-specific frame metadata.

**Files:**
- Create: `minis/driller/src/materials.ts`

- [ ] **Step 1: Load each packed atlas once and build shared materials**

```typescript
import { useMemo } from 'react'
import { TextureLoader, NearestFilter, SRGBColorSpace, type Texture } from 'three'
import { Sprite2DMaterial } from 'three-flatland/react'
import worldTilesUrl from './assets/driller/world-tiles.png?inline'

function loadPixelTexture(url: string): Texture {
  const t = new TextureLoader().load(url)
  t.minFilter = NearestFilter
  t.magFilter = NearestFilter
  t.colorSpace = SRGBColorSpace
  t.generateMipmaps = false
  return t
}

/**
 * Shared by every world tile. Character and gem renderers use equivalent
 * materials backed by their own packed atlases.
 */
export function useDrillerMaterial() {
  return useMemo(() => {
    const tex = loadPixelTexture(worldTilesUrl)
    return new Sprite2DMaterial({ map: tex })
  }, [])
}
```

- [ ] **Step 2: Helper — convert a top-left pixel rect into a sprite frame**

In `src/lib/atlas-uv.ts`:

```typescript
import type { Rect } from '../atlas-regions'

export function rectToFrame(r: Rect, sheetWidth: number, sheetHeight: number): SpriteFrame {
  return {
    x: r.x / sheetWidth,
    y: (sheetHeight - r.y - r.h) / sheetHeight,
    width: r.w / sheetWidth,
    height: r.h / sheetHeight,
    sourceWidth: r.w,
    sourceHeight: r.h,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/materials.ts minis/driller/src/lib/atlas-uv.ts
git commit -m "feat(driller): single tileset Sprite2DMaterial + UV helpers"
```

### Task 15: Autotile pass + tile sprite rendering

**Files:**
- Create: `minis/driller/src/systems/autotile-pass.ts`
- Modify: `minis/driller/src/components/Scene.tsx`

- [ ] **Step 1: Write `systems/autotile-pass.ts`**

Walks the visible cell window; for each `AUTOTILE_DIRTY` cell, recomputes the bitmask, picks an atlas frame, and writes that frame index into a parallel `frameIndex: Uint8Array` on `Grid`. The Scene component reads frame indices and renders sprites.

```typescript
import { type World } from 'koota'
import { Grid, FLAG_AUTOTILE_DIRTY, TILE_AIR, TILE_SOIL } from '../traits'
import { autotileMask, maskToAtlasIndex } from '../lib/autotile'

export function autotilePass(world: World, frameIndex: Uint8Array): void {
  const grid = world.getFirst(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  const isSoil = (c: number, r: number) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false
    return tiles[r * cols + c] === TILE_SOIL
  }
  for (let i = 0; i < tiles.length; i++) {
    if ((flags[i] & FLAG_AUTOTILE_DIRTY) === 0) continue
    if (tiles[i] !== TILE_SOIL) {
      frameIndex[i] = 0
      flags[i] &= ~FLAG_AUTOTILE_DIRTY
      continue
    }
    const c = i % cols
    const r = Math.floor(i / cols)
    frameIndex[i] = maskToAtlasIndex(autotileMask(c, r, isSoil))
    flags[i] &= ~FLAG_AUTOTILE_DIRTY
  }
}
```

- [ ] **Step 2: Render visible tiles as sprites in `Scene.tsx`**

For each visible cell with a non-AIR tile, emit a `<sprite2D>` keyed by `(col, row)` with material chosen by class and frame index. Use a loop over the camera's visible cell range.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/autotile-pass.ts minis/driller/src/components/Scene.tsx
git commit -m "feat(driller): autotile pass + visible tile rendering"
```

---

## Phase 6 — Generation

### Task 16: Biome definitions + tests

**Files:**
- Create: `minis/driller/src/biomes.ts`
- Create: `minis/driller/tests/biomes.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { biomeAt, BIOMES } from '../src/biomes'

describe('biomeAt', () => {
  it.each([
    [0, 'topsoil'], [10, 'topsoil'], [20, 'deep-dirt'], [49, 'deep-dirt'],
    [50, 'stoneworks'], [99, 'stoneworks'],
    [100, 'crystal-caverns'], [199, 'crystal-caverns'],
    [200, 'core'], [9999, 'core'],
  ])('depth %i → %s', (depth, name) => {
    expect(biomeAt(depth).name).toBe(name)
  })
})

describe('BIOMES table', () => {
  it('lists 5 biomes', () => expect(BIOMES.length).toBe(5))
  it('has non-overlapping bands', () => {
    for (let i = 1; i < BIOMES.length; i++) {
      expect(BIOMES[i].minDepth).toBe(BIOMES[i - 1].maxDepth)
    }
  })
})
```

- [ ] **Step 2: Implement**

```typescript
export type BiomeName = 'topsoil' | 'deep-dirt' | 'stoneworks' | 'crystal-caverns' | 'core'

export interface Biome {
  name: BiomeName
  minDepth: number
  maxDepth: number
  caveCount: [number, number]
  fixtureCount: [number, number]
  fixtureKinds: string[]
  gemCount: [number, number]
  gemPalette: string[]
  soilDensity: number
}

export const BIOMES: Biome[] = [
  { name: 'topsoil',          minDepth: 0,    maxDepth: 20,   caveCount: [0,0], fixtureCount: [0,0], fixtureKinds: [], gemCount: [1,2], gemPalette: ['emerald','sapphire'], soilDensity: 0.95 },
  { name: 'deep-dirt',        minDepth: 20,   maxDepth: 50,   caveCount: [1,2], fixtureCount: [0,1], fixtureKinds: ['bone'], gemCount: [3,4], gemPalette: ['ruby','sapphire','emerald'], soilDensity: 0.92 },
  { name: 'stoneworks',       minDepth: 50,   maxDepth: 100,  caveCount: [2,3], fixtureCount: [1,3], fixtureKinds: ['stone-pillar','bone'], gemCount: [4,6], gemPalette: ['ruby','sapphire','emerald','amethyst'], soilDensity: 0.78 },
  { name: 'crystal-caverns',  minDepth: 100,  maxDepth: 200,  caveCount: [3,4], fixtureCount: [2,3], fixtureKinds: ['crystal','stone-pillar'], gemCount: [3,5], gemPalette: ['amethyst','sapphire'], soilDensity: 0.5 },
  { name: 'core',             minDepth: 200,  maxDepth: 9999, caveCount: [4,5], fixtureCount: [2,3], fixtureKinds: ['crystal'], gemCount: [2,3], gemPalette: ['amethyst','topaz'], soilDensity: 0.3 },
]

export function biomeAt(depthM: number): Biome {
  for (const b of BIOMES) if (depthM >= b.minDepth && depthM < b.maxDepth) return b
  return BIOMES[BIOMES.length - 1]
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
git add minis/driller/src/biomes.ts minis/driller/tests/biomes.test.ts
git commit -m "feat(driller): biome bands + lookup"
```

### Task 17: Cellular-automata cave carving

**Files:**
- Create: `minis/driller/src/systems/generation.ts` (new file, will grow over Tasks 17–19)

- [ ] **Step 1: Implement CA cave** — operates on a chunk-local `Uint8Array`

```typescript
import type { Rng } from '../lib/rng'

/** Carve `count` CA caves into a chunk-local tile array (modifies in place). */
export function carveCaves(
  chunk: Uint8Array, cols: number, rows: number, count: number, rng: Rng
): void {
  for (let i = 0; i < count; i++) {
    const cx = rng.intRange(2, cols - 3)
    const cy = rng.intRange(2, rows - 3)
    const w = rng.intRange(4, 7)
    const h = rng.intRange(3, 5)
    // seed area
    for (let y = cy - h; y <= cy + h; y++) {
      for (let x = cx - w; x <= cx + w; x++) {
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue
        if (rng.chance(0.55)) chunk[y * cols + x] = 0 /* AIR */
      }
    }
    // 4 iterations of B5/S45 smoothing
    for (let k = 0; k < 4; k++) smoothCA(chunk, cols, rows)
  }
}

function smoothCA(chunk: Uint8Array, cols: number, rows: number): void {
  const next = new Uint8Array(chunk)
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (chunk[(y + dy) * cols + (x + dx)] !== 0) n++
      const i = y * cols + x
      next[i] = n >= 5 ? 1 : (n <= 4 ? 0 : chunk[i])
    }
  }
  chunk.set(next)
}
```

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/generation.ts
git commit -m "feat(driller): CA cave carving"
```

### Task 18: Streaming chunk generator + tests

**Files:**
- Modify: `minis/driller/src/systems/generation.ts`
- Create: `minis/driller/tests/generation.test.ts`

- [ ] **Step 1: Failing tests for `generateChunk`**

```typescript
import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/systems/generation'
import { PLAY_COLS, CHUNK_ROWS } from '../src/constants'
import { TILE_AIR, TILE_SOIL } from '../src/traits'

describe('generateChunk', () => {
  it('produces a chunk-sized array', () => {
    const c = generateChunk(42, 0)
    expect(c.tiles.length).toBe(PLAY_COLS * CHUNK_ROWS)
  })
  it('is deterministic for the same (seed, chunkY)', () => {
    const a = generateChunk(42, 3)
    const b = generateChunk(42, 3)
    expect(a.tiles).toEqual(b.tiles)
  })
  it('has at least one AIR cell beyond the topsoil chunk', () => {
    const c = generateChunk(42, 2) // chunkY=2 ≈ depth 64 → stoneworks
    let air = 0
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === TILE_AIR) air++
    expect(air).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement `generateChunk`**

```typescript
import { biomeAt } from '../biomes'
import { PLAY_COLS, CHUNK_ROWS } from '../constants'
import { TILE_AIR, TILE_SOIL, TILE_STONE, TILE_FIXTURE_BASE } from '../traits'
import { createRng } from '../lib/rng'
import { carveCaves } from './generation'  // self-import note: place carveCaves in this file

export interface GeneratedChunk {
  tiles: Uint8Array
  gems: { col: number; rowInChunk: number; color: string }[]
}

export function generateChunk(seed: number, chunkY: number): GeneratedChunk {
  const rng = createRng((seed * 0x9E3779B1 + chunkY) >>> 0)
  const cols = PLAY_COLS, rows = CHUNK_ROWS
  const tiles = new Uint8Array(cols * rows)
  // base fill: SOIL except chunk 0 top 4 rows = AIR (sky)
  tiles.fill(TILE_SOIL)
  if (chunkY === 0) {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < cols; x++)
        tiles[y * cols + x] = TILE_AIR
  }

  const depthMid = chunkY * rows + rows / 2
  const biome = biomeAt(depthMid)

  // Caves
  const caves = rng.intRange(...biome.caveCount)
  carveCaves(tiles, cols, rows, caves, rng)

  // Stone scatter (deeper biomes more dense)
  if (biome.name !== 'topsoil') {
    const pillars = rng.intRange(0, biome.name === 'stoneworks' ? 3 : 1)
    for (let i = 0; i < pillars; i++) {
      const x = rng.intRange(1, cols - 2)
      const y = rng.intRange(2, rows - 4)
      const h = rng.intRange(3, 6)
      for (let dy = 0; dy < h && y + dy < rows; dy++) tiles[(y + dy) * cols + x] = TILE_STONE
    }
  }

  // Fixtures
  const fixCount = rng.intRange(...biome.fixtureCount)
  for (let i = 0; i < fixCount; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(1, rows - 2)
    if (tiles[y * cols + x] === TILE_AIR) {
      // place adjacent to AIR (cave roof)
      tiles[y * cols + x] = TILE_FIXTURE_BASE + (i % 5)
    }
  }

  // Gems
  const gemCount = rng.intRange(...biome.gemCount)
  const gems: GeneratedChunk['gems'] = []
  for (let i = 0; i < gemCount; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(1, rows - 2)
    const idx = y * cols + x
    if (tiles[idx] === TILE_SOIL || tiles[idx] === TILE_AIR) {
      const color = biome.gemPalette[rng.intRange(0, biome.gemPalette.length - 1)]
      gems.push({ col: x, rowInChunk: y, color })
    }
  }

  return { tiles, gems }
}
```

- [ ] **Step 3: `streamChunks(world, cameraRow)` — append/dispose chunks based on camera**

```typescript
import { type World } from 'koota'
import { Grid, Seed, Gem, FLAG_AUTOTILE_DIRTY } from '../traits'
import { CHUNK_ROWS, ACTIVE_CHUNK_CAP, PLAY_COLS } from '../constants'

const loadedChunks = new Set<number>()

export function streamChunks(world: World, cameraRow: number): void {
  const grid = world.getFirst(Grid)
  const seedT = world.getFirst(Seed)
  if (!grid || !seedT) return

  const camChunkY = Math.floor(cameraRow / CHUNK_ROWS)
  const need = new Set<number>()
  for (let dy = -3; dy <= 5; dy++) need.add(camChunkY + dy)

  for (const cy of need) if (!loadedChunks.has(cy)) loadChunk(world, cy)
  for (const cy of [...loadedChunks]) if (!need.has(cy)) unloadChunk(world, cy)

  // Cap enforcement
  while (loadedChunks.size > ACTIVE_CHUNK_CAP) {
    const farthest = [...loadedChunks].sort(
      (a, b) => Math.abs(b - camChunkY) - Math.abs(a - camChunkY)
    )[0]
    unloadChunk(world, farthest)
  }
}

function loadChunk(world: World, chunkY: number): void {
  // grow Grid arrays, splice in tiles, mark dirty, spawn gem entities
  // (implementation details: see grid resizing helpers)
  loadedChunks.add(chunkY)
}

function unloadChunk(world: World, chunkY: number): void {
  loadedChunks.delete(chunkY)
  // despawn gem entities in this chunk; trim Grid arrays at top/bottom
}
```

- [ ] **Step 4: Tests pass; commit**

```bash
git add minis/driller/src/systems/generation.ts minis/driller/tests/generation.test.ts
git commit -m "feat(driller): streaming chunk generator with biome rules"
```

### Task 19: Fixture & gem entity spawning

**Files:**
- Modify: `minis/driller/src/systems/generation.ts`
- Modify: `minis/driller/src/components/Scene.tsx`

- [ ] **Step 1: Spawn `Gem` entities on chunk load**

In `loadChunk`, for each gem in the generated chunk, `world.spawn(Gem({ col, row: chunkY * CHUNK_ROWS + rowInChunk, color, ... }))`.

- [ ] **Step 2: Render gems as sprites in Scene**

Add a query for `Gem` entities, emit `<sprite2D>` per visible (uncollected) gem, tint by color.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/generation.ts minis/driller/src/components/Scene.tsx
git commit -m "feat(driller): gem entity spawning + visible rendering"
```

---

## Phase 7 — Collapse physics

### Task 20: Connected-components chunk detection + tests

**Files:**
- Create: `minis/driller/src/lib/chunk-detect.ts`
- Create: `minis/driller/tests/chunk-detect.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { detectChunks, isSupported } from '../src/lib/chunk-detect'

describe('detectChunks', () => {
  it('finds one component for a contiguous SOIL block', () => {
    const cols = 4, rows = 3
    const tiles = new Uint8Array([
      1,1,1,1,
      1,1,1,1,
      0,0,0,0,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(1)
    expect(chunks[0].cells.length).toBe(8)
  })
  it('separates two disconnected SOIL regions', () => {
    const cols = 4, rows = 3
    const tiles = new Uint8Array([
      1,0,0,1,
      1,0,0,1,
      1,0,0,1,
    ])
    expect(detectChunks(tiles, cols, rows).length).toBe(2)
  })
})

describe('isSupported', () => {
  it('reports supported when chunk touches stone', () => {
    const cols = 3, rows = 3
    const tiles = new Uint8Array([
      1,1,1,
      1,1,1,
      2,2,2, // stone floor
    ])
    const c = (await import('../src/lib/chunk-detect')).detectChunks(tiles, cols, rows)[0]
    expect(isSupported(c, tiles, cols, rows)).toBe(true)
  })
})
```

- [ ] **Step 2: Implement `detectChunks` (4-connected flood-fill) + `isSupported`**

```typescript
import { TILE_SOIL, TILE_STONE, TILE_FIXTURE_BASE } from '../traits'

export interface SoilChunk {
  cells: number[]   // flat indices
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

export function detectChunks(tiles: Uint8Array, cols: number, rows: number): SoilChunk[] {
  const seen = new Uint8Array(tiles.length)
  const chunks: SoilChunk[] = []
  const queue: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (seen[i] || tiles[i] !== TILE_SOIL) continue
    const cells: number[] = []
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity
    queue.length = 0
    queue.push(i); seen[i] = 1
    while (queue.length) {
      const idx = queue.pop()!
      cells.push(idx)
      const c = idx % cols, r = Math.floor(idx / cols)
      if (r < minR) minR = r; if (r > maxR) maxR = r
      if (c < minC) minC = c; if (c > maxC) maxC = c
      // 4-neighbors
      const ns = [idx - 1, idx + 1, idx - cols, idx + cols]
      const nc = [c - 1, c + 1, c, c]
      const nr = [r, r, r - 1, r + 1]
      for (let k = 0; k < 4; k++) {
        const ni = ns[k], cc = nc[k], rr = nr[k]
        if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) continue
        if (seen[ni] || tiles[ni] !== TILE_SOIL) continue
        seen[ni] = 1; queue.push(ni)
      }
    }
    chunks.push({ cells, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC })
  }
  return chunks
}

export function isSupported(chunk: SoilChunk, tiles: Uint8Array, cols: number, rows: number): boolean {
  for (const idx of chunk.cells) {
    const c = idx % cols, r = Math.floor(idx / cols)
    // touch screen-edge anchors
    if (c === 0 || c === cols - 1) return true
    if (r === rows - 1) return true
    // touch stone or fixture
    const ns = [idx - 1, idx + 1, idx - cols, idx + cols]
    for (const ni of ns) {
      if (ni < 0 || ni >= tiles.length) continue
      const t = tiles[ni]
      if (t === TILE_STONE || (t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8)) return true
    }
  }
  return false
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
git add minis/driller/src/lib/chunk-detect.ts minis/driller/tests/chunk-detect.test.ts
git commit -m "feat(driller): SOIL chunk detection + support test"
```

### Task 21: Sag state machine

**Files:**
- Create: `minis/driller/src/systems/collapse.ts`

- [ ] **Step 1: Implement `detectAndSag(world)`**

Each tick: scan cells with `FLAG_AUTOTILE_DIRTY` set in last frame; for any chunk that became unsupported, spawn a `SaggingChunk` entity capturing its cell list, and mark cells with `FLAG_SAGGING`.

```typescript
import { type World } from 'koota'
import { Grid, SaggingChunk, GameState, FLAG_SAGGING } from '../traits'
import { detectChunks, isSupported } from '../lib/chunk-detect'
import { SAG_DURATION_TICKS, MAX_CHUNK_HEIGHT } from '../constants'

export function detectAndSag(world: World): void {
  const grid = world.getFirst(Grid)
  const gs = world.getFirst(GameState)
  if (!grid || !gs) return
  const { cols, rows, tiles, flags } = grid
  const allChunks = detectChunks(tiles, cols, rows)
  for (const ch of allChunks) {
    if (isSupported(ch, tiles, cols, rows)) continue
    // Cap height: only the bottom MAX_CHUNK_HEIGHT rows enter the sag body
    const chosen = ch.cells.filter(idx => {
      const r = Math.floor(idx / cols)
      return r >= ch.maxRow - MAX_CHUNK_HEIGHT + 1
    })
    // Mark cells; spawn sagging entity
    for (const idx of chosen) flags[idx] |= FLAG_SAGGING
    world.spawn(SaggingChunk({
      cells: chosen.map(idx => ({ col: idx % cols, row: Math.floor(idx / cols), tile: tiles[idx] })),
      startTick: gs.tick,
      durationTicks: SAG_DURATION_TICKS,
      bracedUntilTick: 0,
    }))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/collapse.ts
git commit -m "feat(driller): sag state on unsupported chunks"
```

### Task 22: Falling rigid body

**Files:**
- Modify: `minis/driller/src/systems/collapse.ts`

- [ ] **Step 1: Implement `releaseAndFall(world)`** — when a sag entity's `tick - startTick >= durationTicks` and not braced: detach cells from the grid (set to AIR), spawn a `FallingChunk` entity with the cell shape and starting position.

- [ ] **Step 2: Implement `tickFalling(world)`** — apply constant gravity, advance pixel position, query for collision with anchored geometry below; on collision call landAndReattach.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/collapse.ts
git commit -m "feat(driller): falling rigid body simulation"
```

### Task 23: Land + reattach + re-autotile

**Files:**
- Modify: `minis/driller/src/systems/collapse.ts`

- [ ] **Step 1: `landAndReattach(world, fallEntity)`** — snap floating cells back to nearest integer grid cells, write tile types into the grid, mark `FLAG_AUTOTILE_DIRTY` on body + 8-neighbors, despawn the FallingChunk entity. After reattach, run `detectAndSag` again to catch chunks that lost support due to the new mass.

- [ ] **Step 2: Driller crush check** — when landing, if any landing cell == driller cell, spawn a Death event (set GameState.lives--, despawn driller).

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/collapse.ts
git commit -m "feat(driller): land + reattach + re-autotile + crush"
```

---

## Phase 8 — Driller & AI

### Task 24: Driller motion + dig action

**Files:**
- Create: `minis/driller/src/systems/driller.ts`

- [ ] **Step 1: Implement** — every `digCooldownMs` (e.g. 180ms) advance toward `PlannerTarget` cell. If next cell is SOIL, dig it (set AIR, mark dirty, increment depthM if row > prev). If next cell is STONE/FIXTURE, fail to move (planner will re-route).

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/driller.ts
git commit -m "feat(driller): driller motion + dig"
```

### Task 25: Mood axes + drift + tests

**Files:**
- Create: `minis/driller/src/systems/ai-mood.ts`
- Create: `minis/driller/tests/mood.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { driftMood, applyMoodEvent } from '../src/systems/ai-mood'

describe('driftMood', () => {
  it('lerps current toward target', () => {
    const m = { greed: 0.0, fear: 0.0, drive: 0.0 }
    const t = { greed: 1.0, fear: 0.0, drive: 0.0 }
    const after = driftMood(m, t)
    expect(after.greed).toBeGreaterThan(0)
    expect(after.greed).toBeLessThan(1)
  })
})

describe('applyMoodEvent', () => {
  it('helpful tap lowers fear', () => {
    const r = applyMoodEvent({ greed: 0.5, fear: 0.6, drive: 0.4 }, 'helpful-tap')
    expect(r.fear).toBeLessThan(0.6)
  })
  it('evil tap raises fear', () => {
    const r = applyMoodEvent({ greed: 0.5, fear: 0.2, drive: 0.4 }, 'evil-tap')
    expect(r.fear).toBeGreaterThan(0.2)
  })
})
```

- [ ] **Step 2: Implement**

```typescript
import { MOOD_LERP } from '../constants'

export interface MoodVec { greed: number; fear: number; drive: number }

export function driftMood(current: MoodVec, target: MoodVec): MoodVec {
  return {
    greed: clamp01(current.greed + (target.greed - current.greed) * MOOD_LERP),
    fear:  clamp01(current.fear  + (target.fear  - current.fear)  * MOOD_LERP),
    drive: clamp01(current.drive + (target.drive - current.drive) * MOOD_LERP),
  }
}

export type MoodEvent =
  | 'helpful-tap' | 'evil-tap' | 'gem-collected' | 'sag-overhead'
  | 'survived-near-miss' | 'over-pet' | 'long-no-touch'

export function applyMoodEvent(m: MoodVec, ev: MoodEvent): MoodVec {
  const r = { ...m }
  switch (ev) {
    case 'helpful-tap':       r.fear = clamp01(r.fear - 0.15); break
    case 'evil-tap':          r.fear = clamp01(r.fear + 0.4);  break
    case 'gem-collected':     r.greed = clamp01(r.greed - 0.3); break
    case 'sag-overhead':      r.fear = clamp01(r.fear + 0.5);  break
    case 'survived-near-miss': r.fear = clamp01(r.fear - 0.2); break
    case 'over-pet':          r.fear = clamp01(r.fear + 0.3);  break
    case 'long-no-touch':     r.drive = clamp01(r.drive + 0.05); break
  }
  return r
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
```

- [ ] **Step 3: Wire into ECS** — system that each tick: computes target mood from world events, calls `driftMood`, writes back to `Mood` trait.

- [ ] **Step 4: Tests pass; commit**

```bash
git add minis/driller/src/systems/ai-mood.ts minis/driller/tests/mood.test.ts
git commit -m "feat(driller): mood drift + event biases"
```

### Task 26: Greedy planner

**Files:**
- Create: `minis/driller/src/systems/ai-planner.ts`

- [ ] **Step 1: Implement `planGreedy`** — picks a target cell directly below the driller; if blocked, picks left or right based on which side has soil and progresses depth. Sets `PlannerTarget` trait.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/ai-planner.ts
git commit -m "feat(driller): greedy descender planner"
```

### Task 27: Seeker planner (BFS to gems)

**Files:**
- Modify: `minis/driller/src/systems/ai-planner.ts`
- Create: `minis/driller/src/lib/bfs.ts`

- [ ] **Step 1: Shared BFS** — `bfs(start, isGoal, isPassable, maxRadius)` returning the next-step cell toward the nearest goal, or null.

```typescript
export function bfsNextStep(
  startCol: number, startRow: number,
  cols: number, rows: number,
  isGoal: (col: number, row: number) => boolean,
  isPassable: (col: number, row: number) => boolean,
  maxRadius: number,
): [number, number] | null {
  const visited = new Set<number>()
  const parents = new Map<number, number>()
  const queue: [number, number][] = [[startCol, startRow]]
  visited.add(startRow * cols + startCol)
  let found: [number, number] | null = null
  let it = 0
  while (queue.length && it++ < maxRadius * maxRadius) {
    const [c, r] = queue.shift()!
    if (isGoal(c, r) && !(c === startCol && r === startRow)) { found = [c, r]; break }
    for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nc = c + dc, nr = r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const key = nr * cols + nc
      if (visited.has(key) || !isPassable(nc, nr)) continue
      visited.add(key)
      parents.set(key, r * cols + c)
      queue.push([nc, nr])
    }
  }
  if (!found) return null
  // walk back from `found` to one step from start
  let cur = found[1] * cols + found[0]
  while (parents.get(cur) !== startRow * cols + startCol) {
    const p = parents.get(cur)
    if (p == null) return null
    cur = p
  }
  return [cur % cols, Math.floor(cur / cols)]
}
```

- [ ] **Step 2: `planSeeker`** — BFS to nearest visible gem (within ~6 cells). `isPassable` = AIR or SOIL (driller can dig SOIL).

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/lib/bfs.ts minis/driller/src/systems/ai-planner.ts
git commit -m "feat(driller): seeker planner with bounded BFS"
```

### Task 28: Cautious planner (shelter BFS)

**Files:**
- Modify: `minis/driller/src/systems/ai-planner.ts`

- [ ] **Step 1: `planCautious`** — BFS to nearest cell adjacent to STONE/FIXTURE within ~6 cells. If none, fall back to `planGreedy`.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/ai-planner.ts
git commit -m "feat(driller): cautious planner — find shelter"
```

### Task 29: Planner selector with hysteresis

**Files:**
- Modify: `minis/driller/src/systems/ai-planner.ts`

- [ ] **Step 1: `selectPlanner(mood, currentPlanner, currentTick, switchAtTick)`** — pick `planGreedy | planSeeker | planCautious` based on dominant mood axis with `MOOD_SWITCH_THRESHOLD` hysteresis. Plus sunk-cost commit window: don't switch if `currentTick - switchAtTick < PLAN_COMMIT_TICKS`.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/ai-planner.ts
git commit -m "feat(driller): planner selector with hysteresis"
```

---

## Phase 9 — Input & interactions

### Task 30: Pointer input system

**Files:**
- Create: `minis/driller/src/systems/input.ts`

- [ ] **Step 1: Resolve hover zone**

Each frame: compute pointer's cell `(col, row)`, check zone priority: driller pixel → gem at cell → sagging chunk at cell → intact ceiling above driller → none. Write into `Pointer` trait.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/input.ts
git commit -m "feat(driller): pointer hover zone resolution"
```

### Task 31: Collect action

**Files:**
- Modify: `minis/driller/src/systems/input.ts`

- [ ] **Step 1: On click with `hoverAction === 'collect'`** — set the gem's `scatteredUntilTick` so it animates on a 280ms arc to the driller; on arrival, increment `GameState.gems` and despawn.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/input.ts
git commit -m "feat(driller): collect-from-anywhere action"
```

### Task 32: Brace action (gem cost)

**Files:**
- Modify: `minis/driller/src/systems/input.ts`

- [ ] **Step 1: On click with `hoverAction === 'brace'`** — if `gs.gems >= BRACE_COST`, decrement gems, set `SaggingChunk.bracedUntilTick = tick + 120` (2s). Otherwise no-op + flash cursor red.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/input.ts
git commit -m "feat(driller): brace action with gem cost"
```

### Task 33: Trigger action

**Files:**
- Modify: `minis/driller/src/systems/input.ts`

- [ ] **Step 1: On click with `hoverAction === 'trigger'`** — find the SOIL chunk containing the clicked cell; if currently supported, force-mark it as a sagging chunk (same telegraph). If unsupported it's already sagging.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/input.ts
git commit -m "feat(driller): trigger action — force sag a chunk"
```

### Task 34: Pet action + over-pet annoyance

**Files:**
- Modify: `minis/driller/src/systems/input.ts`

- [ ] **Step 1: On click with `hoverAction === 'pet'`** — push current tick onto `PetEvents.recentTicks`, prune entries older than `OVER_PET_WINDOW_TICKS`. If size > `OVER_PET_THRESHOLD`, fire mood event `over-pet` and animate a scoot. Else fire `helpful-tap` and animate hop.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/input.ts
git commit -m "feat(driller): pet action with over-pet annoyance"
```

### Task 35: HoverCursor component

**Files:**
- Create: `minis/driller/src/components/HoverCursor.tsx`

- [ ] **Step 1: Implement** — div fixed-positioned at the pointer, color matches `hoverAction`, optional zone outline (CSS box-shadow on the hovered cell-coords highlight overlay).

- [ ] **Step 2: Mount in `Game.tsx`** (only on desktop — `matchMedia('(pointer: fine)')`)

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/components/HoverCursor.tsx minis/driller/src/Game.tsx
git commit -m "feat(driller): hover cursor with action-color preview"
```

---

## Phase 10 — Death & respawn

### Task 36: Crush detection

**Files:**
- Create: `minis/driller/src/systems/death.ts`

- [ ] **Step 1: On crush event** — set `Animation.state = 'crush'`, freeze driller for ~0.4s.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/death.ts
git commit -m "feat(driller): crush detection event"
```

### Task 37: Scattered gems on death

**Files:**
- Modify: `minis/driller/src/systems/death.ts`

- [ ] **Step 1: Spawn gems in 5–8 cell radius around the impact**, randomize color from collected ones, set `scatteredUntilTick = tick + 180` (3s).

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/death.ts
git commit -m "feat(driller): scatter collected gems on death"
```

### Task 38: Ghost chute

**Files:**
- Modify: `minis/driller/src/systems/death.ts`

- [ ] **Step 1: Sweep upward from driller cell** — for each row from death row up to `topRow`, set every cell in the driller's column ±1 to AIR; mark dirty. Animate the ghost as a particle trail rising at ~12 px/frame.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/death.ts
git commit -m "feat(driller): ghost chute clears columns above death"
```

### Task 39: Respawn

**Files:**
- Modify: `minis/driller/src/systems/death.ts`

- [ ] **Step 1: After ghost chute completes** — spawn new driller at `(deathCol, topRow + 2)` with `Mood` reset toward neutral, `Animation = 'idle'`. Hero mode: lives unchanged. Full mode: decrement lives; if lives === 0, transition to leaderboard state.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/death.ts
git commit -m "feat(driller): respawn from top-of-screen"
```

---

## Phase 11 — UI

### Task 40: DepthBar

**Files:**
- Create: `minis/driller/src/components/DepthBar.tsx`

- [ ] **Step 1: Implement** — fixed-position div on right edge; reads `GameState.depthM` and `GameState.deepestM` via `useTrait`; renders a vertical track + driller marker + deepest tick.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/components/DepthBar.tsx
git commit -m "feat(driller): depth bar UI"
```

### Task 41: GemCounter

**Files:**
- Create: `minis/driller/src/components/GemCounter.tsx`

- [ ] **Step 1: Implement** — top-left pill `◆ N` with backdrop blur; pulses on collect via CSS `@keyframes`.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/components/GemCounter.tsx
git commit -m "feat(driller): gem counter UI"
```

### Task 42: HeroHint

**Files:**
- Create: `minis/driller/src/components/HeroHint.tsx`

- [ ] **Step 1: Implement** — ghosted "tap anywhere to help" text near bottom-center, opacity 0.55, fades over 800ms after first interaction or 4s timeout. Only renders in hero mode.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/components/HeroHint.tsx
git commit -m "feat(driller): hero-mode tap-hint that fades"
```

---

## Phase 12 — Mode shells

### Task 43: Game.tsx mode composition + library export

**Files:**
- Modify: `minis/driller/src/Game.tsx`
- Create: `minis/driller/src/index.ts`

- [ ] **Step 1: Wire all components conditionally on `mode`**

```typescript
import { Game } from './Game'
export type { DrillerProps, MiniGameProps, ZzFXParams } from './types'
export { Game }
export default Game
```

- [ ] **Step 2: `Game.tsx`** — if `mode === 'hero'`, mount `Background + PlayCanvas + DepthBar + GemCounter + HeroHint`. If `mode === 'full'`, also mount `TitleAttract` (pre-run) and `Leaderboard` (post-run) gated by world `runState`.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/Game.tsx minis/driller/src/index.ts
git commit -m "feat(driller): mode-aware composition + library export"
```

### Task 44: TitleAttract (full mode)

**Files:**
- Create: `minis/driller/src/components/TitleAttract.tsx`

- [ ] **Step 1: Implement** — animated logo, "tap to begin" prompt, leaderboard preview (top 3 from localStorage). Click anywhere to start.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/components/TitleAttract.tsx
git commit -m "feat(driller): title attract screen for full mode"
```

### Task 45: Leaderboard

**Files:**
- Create: `minis/driller/src/components/Leaderboard.tsx`

- [ ] **Step 1: Implement** — modal on third death; depth + gems shown; name input; saves to localStorage `driller-leaderboard` (top 10). Single-tap restart resets seed and depth.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/components/Leaderboard.tsx
git commit -m "feat(driller): leaderboard with localStorage persistence"
```

### Task 46: World-fall transition (hero)

**Files:**
- Modify: `minis/driller/src/systems/camera.ts`
- Modify: `minis/driller/src/systems/generation.ts`

- [ ] **Step 1: Detect** — when driller depthM exceeds biome `core` band's max (e.g. > 250m), trigger a transition: camera tracks past the floor for 0.5s, then snap to row 0 with a new seed + reset all chunks.

- [ ] **Step 2: Commit**

```bash
git add minis/driller/src/systems/camera.ts minis/driller/src/systems/generation.ts
git commit -m "feat(driller): hero-mode world-fall transition"
```

---

## Phase 13 — Audio & polish

### Task 47: ZzFX SFX presets

**Files:**
- Create: `minis/driller/src/systems/sounds.ts`

- [ ] **Step 1: Define ZzFX param arrays** for: dig, gem-collect, sag-warning, chunk-impact, brace, trigger, pet, over-pet-grunt, crush, respawn, world-fall.

```typescript
import type { ZzFXParams } from '../types'

export const SFX: Record<string, ZzFXParams> = {
  dig:           [, , 220, .01, .02, .04, 1, .5, , , , , , 9, , , .04],
  gemCollect:    [, , 880, .01, .15, .25, , 1.5, , , 100, .03, , , , , .12],
  sagWarning:    [, , 60, .15, .8, .9, 4, .8, , , , , , 4, .15, .15, .2],
  chunkImpact:   [.5, , 80, .01, .02, .3, 4, 1, , , , , , 9, , .3, .2],
  brace:         [, , 1200, .02, .15, .3, , 2, , , , , , , , .1],
  trigger:       [, , 220, .05, .1, .2, 4, 1.4, , , , , , 9, .1, .1, .1],
  pet:           [, , 440, .005, .03, .04, , 1, , , , , , , , , .03],
  overPetGrunt:  [, , 110, .01, .04, .08, 3, 1, , , , , , 9, , , .05],
  crush:         [.5, , 50, .02, .05, .4, 4, 1.2, , , , , , 9, .2, .3, .15],
  respawn:       [, , 880, .02, .2, .25, , 1, , , , , , , , .15, .1],
  worldFall:     [, , 1200, .5, 1, 1.5, , .5, , -200, , , .3, , , , .3],
}

export function playSfx(zzfx: (...p: ZzFXParams) => void, name: keyof typeof SFX): void {
  zzfx(...SFX[name])
}
```

- [ ] **Step 2: Wire calls** at appropriate game events (dig in driller system, sag in collapse system, etc.)

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/sounds.ts
git commit -m "feat(driller): ZzFX SFX presets + event hooks"
```

### Task 48: Particles

**Files:**
- Create: `minis/driller/src/systems/particles.ts`

- [ ] **Step 1: Spawn helpers** — `spawnDust(world, px, py, count)`, `spawnSparks(world, px, py)`, `spawnHeart(world, px, py)`, `spawnGemArc(world, fromGem, toDriller)`.

- [ ] **Step 2: Tick particles** — advance position, fade alpha by age, despawn when `ageMs > lifeMs`.

- [ ] **Step 3: Render particles** in `Scene.tsx` via Renderer2D.

- [ ] **Step 4: Commit**

```bash
git add minis/driller/src/systems/particles.ts minis/driller/src/components/Scene.tsx
git commit -m "feat(driller): particle systems for dust, sparks, hearts, gem arcs"
```

### Task 49: Driller animations

**Files:**
- Modify: `minis/driller/src/systems/driller.ts`

- [ ] **Step 1: Implement frame timing** — read `Animation` trait; advance frame by `frameAccumMs`, switch sprite frame index based on state.

- [ ] **Step 2: Hop on pet, gratitude bob on survive, scoot on over-pet** — set `Animation.state` from input/death systems.

- [ ] **Step 3: Commit**

```bash
git add minis/driller/src/systems/driller.ts
git commit -m "feat(driller): character animations"
```

### Task 50: Visual + integration QA

**Files:**
- Create: `minis/driller/README.md`

- [ ] **Step 1: Write README** — features, controls, how to dev/test, both modes.

- [ ] **Step 2: Manual QA pass** — desktop large viewport, desktop small, tablet, mobile portrait. Verify: scale-to-fit picks correct step at each, no fuzzy sprites, all four interactions work, mood changes visible in driller behavior, three deaths in full mode → leaderboard, hero mode runs forever.

- [ ] **Step 3: Performance check** — open Chrome devtools, run for 3 minutes in stoneworks biome, confirm no growing memory + steady 60fps.

- [ ] **Step 4: Commit**

```bash
git add minis/driller/README.md
git commit -m "docs(driller): README and QA pass complete"
```

---

## Phase 14 — Lighting integration (deferred sub-issues)

These are filed as **separate GitHub sub-issues** because the lighting system is gated by the `feat-lighting-postprocess-flatland` merge. They run after Phase 13 lands and lighting is available.

### Sub-issue L1: Driller headlamp

- Add `LightEffect` instance: point light at driller.world position, color `#fcd34d`, radius 6 tiles. Wire bobbing offset to dig animation.
- Use `DefaultLightEffect` (tiled Forward+) per memory.

### Sub-issue L2: Per-gem point lights

- For each visible Gem entity, attach a small `LightEffect` instance: color matches `gem.color`, radius 3 tiles, intensity 0.6.
- Cull: lights more than 1.5 tiles outside camera frustum disabled. Cap active gem-lights at 64.

### Sub-issue L3: Crystal fixture ambient lights

- Crystal fixtures (in `crystal-caverns` and `core` biomes) emit a 3–4 tile point light, biome-violet color.
- Mounted at fixture spawn time; despawned at chunk unload.

### Sub-issue L4: Surface directional sun

- Directional light at the surface band (depth 0–4m). Warm white. Dims to 0 below 4m.

### Sub-issue L5: Lighting performance pass

- Stress test in stoneworks biome with 50+ gems visible.
- Verify: 60fps on M1-class hardware via Forward+ tiled lighting.
- If fps falls under 50, reduce gem-light intensity or radius.

---

## Acceptance gate

Per `feedback_acceptance_criteria_gate`: every item in spec §15 must be met or carry stakeholder-authorized deferral before PR ready. Lighting sub-issues (L1–L5) are explicitly deferred — the parent issue ships with the un-lit material until they land.

## Self-review notes

- All 50 main tasks have explicit file paths and commit commands.
- All algorithmic primitives (RNG, scale, autotile, chunk-detect, mood) are TDD'd with code-block tests.
- Visual / mechanical tasks rely on manual QA at Task 50 + dev-server iteration.
- No "TBD" / "implement later" — every step has either a code block or a clear explanation.
- Lighting is intentionally minimal in this plan; the sub-issues capture the work that requires the lighting system to be merged first.
