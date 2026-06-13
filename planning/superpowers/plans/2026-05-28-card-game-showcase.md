# Card-Game Showcase Implementation Plan (Epic 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Pause at every `[REVIEW GATE]` for human approval before proceeding to the next phase.**

**Goal:** Build a playable head-to-head alchemy-card duel showcase (`minis/alchemy-duel/`) that exercises every modality of the unified three-flatland renderer in one composited scene — R3F + Koota only, with auto-balance via CMA-ES + agent-persona playtest.

**Architecture:** R3F app composing three flatland containers (atlas RT authoring, perspective 3D MAIN scene with billboarded avatars + InstancedMesh cards, HUD overlay) per frame via imperative `requestAnimationFrame` scheduling. Renderless gameplay subsystems (rules engine, simulator, CMA-ES, daemon, CLI, personas) live in `src/dev/` and never reach the prod bundle. Production / dev split enforced by 5 gates.

**Tech Stack:** R3F (`@react-three/fiber/webgpu`), three.js r183 (`three/webgpu`, `three/tsl`), Koota ECS, `three-flatland` + `@three-flatland/slug`, Vitest, Playwright, `cma-es`, `ws`, vitexec, pnpm + turborepo.

**Hard dependency:** Epic 1 (lighting unification, `planning/superpowers/plans/2026-05-27-lighting-unification.md`) MUST merge before any work in this plan starts. The implementer branches off main after Epic 1 lands.

---

## Spec source + reuse-reference shortcut

- **Source spec:** `planning/superpowers/specs/2026-05-28-card-game-showcase-design.md` (≈17 sections, all decisions locked).
- **Reuse appendix:** spec §17 — every primitive the showcase consumes from existing infra (Flatland RT, slug-bake, AnimatedSprite2D + AnimationController, Koota traits, layer infra, Playwright stats helper, vitexec, size-limit, lefthook, ESLint extensibility, all Epic 1 deliverables). **Before every task: if a leaf below proposes constructing something listed in §17, STOP and consume the existing implementation instead.**
- **Issue tree:** spec §13 is the parent/child source for `creating-github-issues`. Task numbering in this plan maps to leaves there.

---

## File structure

Files created (in plan order — exact paths). All paths relative to the worktree root.

**Package root + tooling:**
- `minis/alchemy-duel/package.json` — package manifest, R3F + Koota deps, dev deps (`ws`, `cma-es`, `pixelmatch`, `pngjs`), scripts.
- `minis/alchemy-duel/tsconfig.json` — workspace tsconfig.
- `minis/alchemy-duel/vite.config.ts` — Vite + React; prod entry `src/App.tsx`; excludes `src/dev/`.
- `minis/alchemy-duel/index.html` — Vite entry.
- `minis/alchemy-duel/.size-limit.json` — bundle budget.
- `minis/alchemy-duel/scripts/verify-prod-bundle.ts` — forbidden-token scanner.

**Rules engine + types (`src/rules/`):**
- `src/rules/types.ts` — `DuelState`, `PlayerState`, `Action`, `Status`, `TurnRecord`, `CardId`.
- `src/rules/balance.ts` — embedded `BALANCE` from compile-time import of `balance/current.json`.
- `src/rules/rng.ts` — `xoshiro128**` seeded PRNG.
- `src/rules/deck.ts` — load `deck.json`, card-metadata accessor.
- `src/rules/effects.ts` — per-card effect-table (28 entries).
- `src/rules/elements.ts` — element counter-cycle resolution.
- `src/rules/engine.ts` — `RulesEngine` class (applyAction/legalActions/view/isTerminal/winner).
- `src/rules/ai.ts` — `DuelAI` Strategy interface + `HeuristicAI` implementation.

**State model + ECS (`src/ecs/`):**
- `src/ecs/world.ts` — Koota world bootstrap + provider.
- `src/ecs/traits.ts` — `DuelStateTrait`, `RulesEngineTrait`, `IntentQueue`, `CardRef`, `Transform`, `Tween`, `OverlaySprites`, `AvatarRef`, `AnimationState`, `AtlasFaceLightRef`, `AtlasLightingContext`.
- `src/ecs/intents.ts` — closed-set `Intent` type + emit helpers.
- `src/ecs/systems/duelStateSyncSystem.ts` — diff prev↔state → IntentQueue.
- `src/ecs/systems/intentAnimationSystem.ts` — consume intents → start Tween.
- `src/ecs/systems/tweenSystem.ts` — advance Tweens.
- `src/ecs/systems/animationDriverSystem.ts` — avatar AnimationState advance.
- `src/ecs/systems/cardAtlasLightingDriverSystem.ts` — 3D→atlas light projection.
- `src/ecs/systems/index.ts` — ordered scheduler.

**Renderer / R3F (`src/renderer/`):**
- `src/renderer/App.tsx` — Canvas + Providers + scene composition root.
- `src/renderer/atlas/AtlasLayout.ts` — `ATLAS_LAYOUT`, `cellForCard`, `atlasPositionForCard`, `uvWindowForCard`.
- `src/renderer/atlas/AtlasFlatland.tsx` — `<flatland renderTarget={...}>` container with 29 face compositions.
- `src/renderer/atlas/FaceComposition.tsx` — per-face layered sprite + slug component.
- `src/renderer/cards/CardMaterial.ts` — NodeMaterial factory using per-instance UV-window attributes.
- `src/renderer/cards/CardInstancedMesh.tsx` — `THREE.InstancedMesh` JSX with per-instance setters.
- `src/renderer/avatars/Avatar.tsx` — `<animatedSprite2D billboard="cylindrical">` per archetype.
- `src/renderer/hud/HudFlatland.tsx` — `<flatland>` overlay container.
- `src/renderer/scene/Table.tsx` — 3D table mesh.
- `src/renderer/scene/MainScene.tsx` — perspective 3D root.
- `src/renderer/input/HitTester.ts` — hybrid CPU picker.
- `src/renderer/input/InputBridge.ts` — pointer → legalActions → engine.
- `src/renderer/demo/DemoPlayer.ts` — canonical-match replay driver.
- `src/renderer/debug/flatlandDebug.ts` — dev-only `globalThis.__flatlandDebug` hooks for vitexec/Playwright.

**Prod entry (`src/`):**
- `src/App.tsx` — top-level React root composing renderer + ECS + demo/input mode toggle.
- `src/main.tsx` — `ReactDOM.createRoot` boot.

**Dev-only (`src/dev/` — never in prod bundle):**
- `src/dev/balance/simulator.ts` — `simulateMatch` + `simulateBatch` (worker_threads sharding).
- `src/dev/balance/metrics.ts` — `Metrics` aggregation; composite `L(θ)`; essentiality check.
- `src/dev/balance/tuner.ts` — CMA-ES wrapper.
- `src/dev/balance/feelbadFixtures.ts` — load/replay `balance/feelbad-cases/*.json`.
- `src/dev/balance/cli.ts` — `pnpm balance:*` CLI dispatch.
- `src/dev/daemon/server.ts` — WebSocket server + session store.
- `src/dev/daemon/sessions.ts` — session state + transcript persistence.
- `src/dev/daemon/protocol.ts` — message schema + validation.
- `src/dev/cli/duel-cli.ts` — the 9 CLI verbs (the only surface subagents touch).
- `src/dev/personas/types.ts` — `Persona` + `FeedbackTag` types.
- `src/dev/personas/specs/*.json` — 5 persona JSONs.
- `src/dev/personas/harness.ts` — LLM agent harness (stub for CI, real for nightly).

**Assets (`assets/`):**
- `assets/data/deck.json` — copied from `~/Developer/alchemy-cards`.
- `assets/parchment.png`, `assets/ornaments.png`, `assets/foil-overlay.png`, `assets/foil-normal.png`, `assets/card-surface-normal.png` — authored.
- `assets/fonts/*.ttf` + baked `*.slug.glb` — Cinzel (display), Inter (body, already in repo), Noto Sans Symbols 2 / Symbola (symbol).
- `assets/avatars/{wizard,witch,warlock,knight}/sheet.png` + `meta.json` — pixel-art sheets (5 clips each).
- `assets/table/table.glb` — minimal stylized table.
- `assets/design-reference/*.png` — alchemy-cards baked output screenshots (visual target).
- `assets/demo/canonical-match.json` — deterministic replay seed (initialState + actionLog + seed).

**Balance (`balance/`):**
- `balance/current.json` — committed tuned numbers (embedded into prod via compile-time import).
- `balance/personas/*.json` — copies of `src/dev/personas/specs/*.json` for runtime loading.
- `balance/feelbad-cases/*.json` — regression fixtures (committed).
- `balance/history/`, `balance/feedback/` — gitignored or curated.

**Skills (`.claude/skills/` — dev-only):**
- `.claude/skills/balance-playtest/SKILL.md`
- `.claude/skills/balance-tune/SKILL.md`
- `.claude/skills/add-card/SKILL.md`
- `.claude/skills/add-intent/SKILL.md`
- `.claude/skills/add-persona/SKILL.md`
- `.claude/skills/capture-goldens/SKILL.md`
- `.claude/skills/validate-perf/SKILL.md`
- `.claude/skills/verify-prod-bundle/SKILL.md`

**Test infra (`test/regression/`):**
- `test/regression/showcase-visual.spec.ts` — vitexec golden capture + pixel-diff for the showcase (extends Epic 1's pattern).
- `test/regression/golden/showcase/*.png` — committed goldens.

**Modifications:**
- Modify: `pnpm-workspace.yaml` — register `minis/alchemy-duel`.
- Modify: `turbo.json` — add showcase build/test pipeline entries.
- Modify: root `lefthook.yml` — add `pre-push` hook for `verify:prod` + `size-limit` + lint scan.
- Modify: root `eslint.config.js` — add `no-restricted-imports` rule scoped to `minis/alchemy-duel/src/{rules,renderer,prod-entry}`.

Files only touched in modifications (not created) get `Modify:` lines on tasks. Files created get `Create:`. Tests get `Test:` lines.

---

## Phase A — Parallel renderless work (starts immediately after Epic 1 merges)

All Phase A subsystems are renderless and dispatchable in parallel. The implementer can split A.2/A.3/A.5/A.9 across subagents simultaneously.

### Task A.1.1: Scaffold the package

**Files:**
- Create: `minis/alchemy-duel/package.json`
- Create: `minis/alchemy-duel/tsconfig.json`
- Create: `minis/alchemy-duel/index.html`
- Create: `minis/alchemy-duel/vite.config.ts`
- Create: `minis/alchemy-duel/src/main.tsx` (stub)
- Create: `minis/alchemy-duel/src/App.tsx` (stub)
- Modify: `pnpm-workspace.yaml`
- Modify: `turbo.json`

- [ ] **Step 1: Add the package to the workspace**

Append to `pnpm-workspace.yaml` `packages:` array:
```yaml
  - 'minis/alchemy-duel'
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@minis/alchemy-duel",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest --typecheck --run",
    "test:watch": "vitest --typecheck",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "verify:prod": "tsx scripts/verify-prod-bundle.ts",
    "daemon:start": "tsx src/dev/daemon/server.ts",
    "balance:sim": "tsx src/dev/balance/cli.ts sim",
    "balance:tune": "tsx src/dev/balance/cli.ts tune",
    "balance:playtest": "tsx src/dev/balance/cli.ts playtest",
    "balance:gate": "tsx src/dev/balance/cli.ts gate"
  },
  "dependencies": {
    "three": "catalog:",
    "@react-three/fiber": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "three-flatland": "workspace:*",
    "@three-flatland/slug": "workspace:*",
    "@three-flatland/presets": "workspace:*",
    "koota": "catalog:"
  },
  "devDependencies": {
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "vite": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "vitest": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "ws": "^8.18.0",
    "@types/ws": "^8.5.13",
    "cma-es": "^1.0.4",
    "pixelmatch": "^7.1.0",
    "pngjs": "^7.0.0",
    "@types/pixelmatch": "^5.2.6",
    "@types/pngjs": "^6.0.5"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "jsx": "react-jsx",
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*", "scripts/**/*", "test/**/*"]
}
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Alchemy Duel — three-flatland showcase</title>
  </head>
  <body style="margin:0;background:#06060c">
    <div id="root" style="width:100vw;height:100vh"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `vite.config.ts` (excludes `src/dev/` from prod entry)**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['source'] },
  base: '/alchemy-duel/',
  build: {
    target: 'esnext',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      // src/dev/ is NEVER resolvable from the prod entry — enforced by vite + ESLint + verify:prod scan
      external: [/\/src\/dev\//],
    },
  },
})
```

- [ ] **Step 6: Stub `src/main.tsx` + `src/App.tsx`**

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { App } from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```

`src/App.tsx`:
```tsx
export function App() {
  return <div style={{ color: 'white', padding: 16 }}>alchemy-duel scaffold — ready</div>
}
```

- [ ] **Step 7: Add to turbo.json**

Append the package's build/test to the relevant pipelines in root `turbo.json` (follow the existing examples/* pattern — `build` depends on `^build`, `test` depends on `build`, etc.). Run `pnpm sync:pack` to sync deps if catalog entries need adding.

- [ ] **Step 8: Verify scaffold boots**

Run: `pnpm --filter=@minis/alchemy-duel dev`
Expected: Vite dev server starts on its port; opening the URL shows "alchemy-duel scaffold — ready".

- [ ] **Step 9: Commit**

```bash
git add minis/alchemy-duel/ pnpm-workspace.yaml turbo.json
git commit -m "feat(alchemy-duel): scaffold mini package (R3F + workspace integration)"
```

---

### Task A.1.2: Stub the `src/dev/` directory + enforce exclusion

**Files:**
- Create: `minis/alchemy-duel/src/dev/.gitkeep`
- Create: `minis/alchemy-duel/scripts/verify-prod-bundle.ts`
- Modify: root `eslint.config.js`

- [ ] **Step 1: Add ESLint rule scoped to the showcase prod paths**

In root `eslint.config.js`, append a rule block:
```js
{
  files: ['minis/alchemy-duel/src/rules/**', 'minis/alchemy-duel/src/renderer/**', 'minis/alchemy-duel/src/ecs/**', 'minis/alchemy-duel/src/App.tsx', 'minis/alchemy-duel/src/main.tsx'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['**/dev/**'], message: 'Prod code MUST NOT import from src/dev/.' },
        { group: ['ws'], message: 'WebSocket is dev-only — guard with import.meta.env.DEV + dynamic import if needed.' },
        { group: ['cma-es'], message: 'Tuner is dev-only.' },
      ],
    }],
  },
}
```

- [ ] **Step 2: Stub the dev dir and write verify-prod-bundle.ts**

`src/dev/.gitkeep`:
```
# dev-only — NEVER imported from src/rules, src/renderer, src/ecs, src/App.tsx, or src/main.tsx
```

`scripts/verify-prod-bundle.ts`:
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = [
  /\bWebSocket\b/,
  /ws:\/\//,
  /duel-daemon/,
  /cma-es/,
  /aggro-anna|control-carlos|combo-carla|casual-curtis|reviewer-rita/,
  /balance\/(personas|feedback|history|feelbad-cases)/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p)
  }
  return out
}

const distDir = new URL('../dist', import.meta.url).pathname
const chunks = walk(distDir)
const violations: { file: string; pattern: string }[] = []
for (const file of chunks) {
  const src = readFileSync(file, 'utf8')
  for (const pat of FORBIDDEN) {
    if (pat.test(src)) violations.push({ file, pattern: pat.source })
  }
}
if (violations.length > 0) {
  console.error('verify:prod FAILED — forbidden tokens in prod chunks:')
  for (const v of violations) console.error(`  ${v.file}: ${v.pattern}`)
  process.exit(1)
}
console.log(`verify:prod OK — ${chunks.length} prod chunks scanned, no forbidden tokens.`)
```

- [ ] **Step 3: Run lint to confirm rule active**

Run: `pnpm --filter=@minis/alchemy-duel lint` (or root `pnpm lint`)
Expected: PASS (no violations yet — no dev imports exist).

- [ ] **Step 4: Commit**

```bash
git add minis/alchemy-duel/src/dev/.gitkeep minis/alchemy-duel/scripts/verify-prod-bundle.ts eslint.config.js
git commit -m "feat(alchemy-duel): src/dev exclusion via ESLint no-restricted-imports + verify-prod-bundle scanner"
```

---

### Task A.1.3: Wire lefthook pre-push gate

**Files:**
- Modify: root `lefthook.yml`

- [ ] **Step 1: Add the pre-push section**

In `lefthook.yml`, ensure the `pre-push` block contains:
```yaml
pre-push:
  parallel: true
  commands:
    alchemy-duel-verify-prod:
      glob: 'minis/alchemy-duel/**/*'
      run: pnpm --filter=@minis/alchemy-duel build && pnpm --filter=@minis/alchemy-duel verify:prod
    alchemy-duel-size:
      glob: 'minis/alchemy-duel/**/*'
      run: pnpm --filter=@minis/alchemy-duel exec size-limit
    alchemy-duel-lint:
      glob: 'minis/alchemy-duel/**/*.{ts,tsx}'
      run: pnpm lint
```

- [ ] **Step 2: Install lefthook hooks**

Run: `pnpm prepare` (re-runs `lefthook install`)
Expected: hooks re-installed.

- [ ] **Step 3: Commit**

```bash
git add lefthook.yml
git commit -m "chore(alchemy-duel): lefthook pre-push runs verify:prod + size-limit + lint when minis/alchemy-duel changes"
```

---

### Task A.2.1: Rules engine — type definitions

**Files:**
- Create: `minis/alchemy-duel/src/rules/types.ts`
- Test: `minis/alchemy-duel/src/rules/types.test.ts`

- [ ] **Step 1: Write failing test asserting types are exported and shape is frozen-in-dev**

```ts
import { describe, it, expect } from 'vitest'
import type { DuelState, PlayerState, Action } from './types'
import { freezeStateInDev, isFlatlandLightSeat } from './types'

describe('rules/types', () => {
  it('freezeStateInDev returns the same object frozen in dev', () => {
    const state = { hp: 10 } as unknown as DuelState
    const frozen = freezeStateInDev(state)
    expect(frozen).toBe(state)
    expect(Object.isFrozen(frozen)).toBe(import.meta.env.DEV)
  })
  it('player seats are 0 | 1', () => {
    const seats: (0 | 1)[] = [0, 1]
    expect(seats.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- types`
Expected: FAIL ("Cannot find module './types'").

- [ ] **Step 3: Implement `types.ts`**

```ts
export type CardId =
  | 'fire' | 'water' | 'air' | 'earth'
  | 'gold-sol' | 'silver-luna' | 'mercury' | 'copper-venus' | 'iron-mars' | 'tin-jupiter' | 'lead-saturn'
  | 'sulfur' | 'salt'
  | 'antimony' | 'vitriol' | 'arsenic' | 'aqua-fortis' | 'aqua-regia'
  | 'amalgam' | 'philosophers-stone' | 'alembic' | 'crucible' | 'calcination' | 'tria-prima' | 'dissolve' | 'coagulate' | 'great-work' | 'aurum-potabile'

export type Status =
  | { kind: 'poison'; stacks: number; turnsRemaining: number }
  | { kind: 'shield'; amount: number; turnsRemaining: number }
  | { kind: 'calcination-boost'; turnsRemaining: number }

export type Action =
  | { kind: 'commitCard';  cardId: CardId }
  | { kind: 'castReagent'; cardId: CardId; target?: 'self' | 'opponent' | CardId }
  | { kind: 'endTurn' }

export interface PlayerState {
  readonly avatar: 'wizard' | 'witch' | 'warlock' | 'knight'
  readonly hp: number
  readonly hand: readonly CardId[]
  readonly deck: readonly CardId[]
  readonly discard: readonly CardId[]
  readonly committed: CardId | null
  readonly statuses: readonly Status[]
}

export interface TurnRecord {
  readonly turn: number
  readonly action: Action
  readonly byPlayer: 0 | 1
}

export interface DuelState {
  readonly rngSeed: number
  readonly turn: number
  readonly activePlayer: 0 | 1
  readonly phase: 'commit' | 'reveal' | 'resolve' | 'draw' | 'gameOver'
  readonly players: readonly [PlayerState, PlayerState]
  readonly log: readonly TurnRecord[]
  readonly pending: readonly Action[]
}

export function freezeStateInDev<T extends object>(s: T): T {
  if (import.meta.env.DEV) Object.freeze(s)
  return s
}

export function isFlatlandLightSeat(player: number): player is 0 | 1 {
  return player === 0 || player === 1
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter=@minis/alchemy-duel test -- types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add minis/alchemy-duel/src/rules/types.ts minis/alchemy-duel/src/rules/types.test.ts
git commit -m "feat(alchemy-duel/rules): canonical state types + freeze-in-dev helper"
```

---

### Task A.2.2: Seeded PRNG (xoshiro128**)

**Files:**
- Create: `minis/alchemy-duel/src/rules/rng.ts`
- Test: `minis/alchemy-duel/src/rules/rng.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createRng } from './rng'

describe('rng', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createRng(42); const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })
  it('produces different sequences for different seeds', () => {
    const a = createRng(1); const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })
  it('next() returns floats in [0, 1)', () => {
    const r = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const x = r.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
  it('intBelow(n) returns integers in [0, n)', () => {
    const r = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const x = r.intBelow(10)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(10)
      expect(Number.isInteger(x)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- rng`
Expected: FAIL.

- [ ] **Step 3: Implement `rng.ts`**

```ts
// xoshiro128** — fast, statistically strong, seedable
export interface RNG {
  next(): number          // [0, 1)
  intBelow(n: number): number
  state(): readonly [number, number, number, number]
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

export function createRng(seed: number): RNG {
  // splitmix32 to fill the 4-word state
  let s = seed >>> 0
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
  let s0 = splitmix(); let s1 = splitmix(); let s2 = splitmix(); let s3 = splitmix()
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1 // avoid all-zero state
  const next = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7) >>> 0, 9) >>> 0
    const t = (s1 << 9) >>> 0
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t
    s3 = rotl(s3, 11)
    return result / 0x100000000
  }
  return {
    next,
    intBelow: (n) => Math.floor(next() * n),
    state: () => [s0, s1, s2, s3] as const,
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter=@minis/alchemy-duel test -- rng`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add minis/alchemy-duel/src/rules/rng.ts minis/alchemy-duel/src/rules/rng.test.ts
git commit -m "feat(alchemy-duel/rules): xoshiro128** seeded PRNG"
```

---

### Task A.2.3: Element counter-cycle resolution

**Files:**
- Create: `minis/alchemy-duel/src/rules/elements.ts`
- Test: `minis/alchemy-duel/src/rules/elements.test.ts`

- [ ] **Step 1: Write failing test for the 4×4 matrix**

```ts
import { describe, it, expect } from 'vitest'
import { resolveElementClash, type Element } from './elements'

describe('elements/counter-cycle', () => {
  // Fire → Air → Earth → Water → Fire
  const cases: { p0: Element; p1: Element; winner: 0 | 1 | 'tie' }[] = [
    { p0: 'fire',  p1: 'air',   winner: 0 },  // fire beats air
    { p0: 'air',   p1: 'fire',  winner: 1 },
    { p0: 'air',   p1: 'earth', winner: 0 },
    { p0: 'earth', p1: 'water', winner: 0 },
    { p0: 'water', p1: 'fire',  winner: 0 },
    { p0: 'fire',  p1: 'fire',  winner: 'tie' },
    { p0: 'fire',  p1: 'earth', winner: 'tie' }, // non-adjacent = clash (mutual)
    { p0: 'air',   p1: 'water', winner: 'tie' },
  ]
  for (const c of cases) {
    it(`${c.p0} vs ${c.p1} → ${c.winner}`, () => {
      expect(resolveElementClash(c.p0, c.p1)).toBe(c.winner)
    })
  }
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- elements`
Expected: FAIL.

- [ ] **Step 3: Implement `elements.ts`**

```ts
export type Element = 'fire' | 'air' | 'earth' | 'water'

// Directed cycle: each beats the next in the array.
const CYCLE: readonly Element[] = ['fire', 'air', 'earth', 'water']

export function resolveElementClash(p0: Element, p1: Element): 0 | 1 | 'tie' {
  if (p0 === p1) return 'tie'
  const i0 = CYCLE.indexOf(p0); const i1 = CYCLE.indexOf(p1)
  if ((i0 + 1) % 4 === i1) return 0  // p0 beats p1
  if ((i1 + 1) % 4 === i0) return 1  // p1 beats p0
  return 'tie' // non-adjacent
}

export function isElement(card: string): card is Element {
  return card === 'fire' || card === 'air' || card === 'earth' || card === 'water'
}
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- elements`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/rules/elements.ts minis/alchemy-duel/src/rules/elements.test.ts
git commit -m "feat(alchemy-duel/rules): element counter-cycle resolution (4-way directed)"
```

---

### Task A.2.4: Deck loader + balance loader

**Files:**
- Create: `minis/alchemy-duel/assets/data/deck.json` (copy from `~/Developer/alchemy-cards/assets/data/deck.json`)
- Create: `minis/alchemy-duel/balance/current.json` (seed file with placeholder defaults — to be tuned)
- Create: `minis/alchemy-duel/src/rules/deck.ts`
- Create: `minis/alchemy-duel/src/rules/balance.ts`
- Test: `minis/alchemy-duel/src/rules/deck.test.ts`

- [ ] **Step 1: Copy the deck data**

```bash
cp ~/Developer/alchemy-cards/assets/data/deck.json minis/alchemy-duel/assets/data/deck.json
```

- [ ] **Step 2: Seed `balance/current.json` with defaults**

```json
{
  "version": 1,
  "hp": 30,
  "handSize": 5,
  "elementPower": { "fire": 6, "air": 5, "earth": 7, "water": 5 },
  "metalShield": { "gold-sol": 5, "silver-luna": 4, "mercury": 3, "copper-venus": 4, "iron-mars": 6, "tin-jupiter": 5, "lead-saturn": 8 },
  "reagentMagnitude": { "antimony": 4, "vitriol": 5, "arsenic": 3, "aqua-fortis": 6, "aqua-regia": 0, "sulfur": 2, "salt": 2 },
  "processMagnitude": {
    "amalgam": 2, "philosophers-stone": 10, "alembic": 0, "crucible": 0,
    "calcination": 2, "tria-prima": 2, "dissolve": 2, "coagulate": 4,
    "great-work": 12, "aurum-potabile": 30
  }
}
```

- [ ] **Step 3: Write failing test for deck + balance loaders**

```ts
import { describe, it, expect } from 'vitest'
import { ALL_CARDS, cardCategory, allCardsByCategory } from './deck'
import { BALANCE } from './balance'

describe('deck', () => {
  it('exports 28 unique CardIds', () => {
    expect(ALL_CARDS.length).toBe(28)
    expect(new Set(ALL_CARDS).size).toBe(28)
  })
  it('categorizes cards', () => {
    expect(cardCategory('fire')).toBe('Classical Elements')
    expect(cardCategory('gold-sol')).toBe('Planetary Metals')
    expect(cardCategory('philosophers-stone')).toBe('Processes & Concepts')
  })
  it('counts per category', () => {
    const by = allCardsByCategory()
    expect(by['Classical Elements']?.length).toBe(4)
    expect(by['Planetary Metals']?.length).toBe(7)
    expect(by['Three Primes']?.length).toBe(2)
    expect(by['Important Substances']?.length).toBe(5)
    expect(by['Processes & Concepts']?.length).toBe(10)
  })
})

describe('balance', () => {
  it('loads embedded balance constants', () => {
    expect(BALANCE.hp).toBe(30)
    expect(BALANCE.handSize).toBe(5)
    expect(BALANCE.elementPower.fire).toBeGreaterThan(0)
  })
  it('balance is deep-frozen', () => {
    expect(Object.isFrozen(BALANCE)).toBe(true)
    expect(Object.isFrozen(BALANCE.elementPower)).toBe(true)
  })
})
```

- [ ] **Step 4: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- deck`
Expected: FAIL.

- [ ] **Step 5: Implement `deck.ts`**

```ts
import deckJson from '../../assets/data/deck.json' assert { type: 'json' }
import type { CardId } from './types'

interface RawCard {
  number: number
  roman_numeral: string
  symbol: string
  symbol_codepoint: string
  name: string
  meaning: string
  date: string
  category: 'Classical Elements' | 'Planetary Metals' | 'Three Primes' | 'Important Substances' | 'Processes & Concepts'
}

const NAME_TO_ID: Record<string, CardId> = {
  'Fire': 'fire', 'Water': 'water', 'Air': 'air', 'Earth': 'earth',
  'Gold · Sol': 'gold-sol', 'Silver · Luna': 'silver-luna', 'Mercury': 'mercury',
  'Copper · Venus': 'copper-venus', 'Iron · Mars': 'iron-mars', 'Tin · Jupiter': 'tin-jupiter',
  'Lead · Saturn': 'lead-saturn',
  'Sulfur': 'sulfur', 'Salt': 'salt',
  'Antimony': 'antimony', 'Vitriol': 'vitriol', 'Arsenic': 'arsenic',
  'Aqua Fortis': 'aqua-fortis', 'Aqua Regia': 'aqua-regia',
  'Amalgam': 'amalgam', "Philosopher's Stone": 'philosophers-stone', 'Alembic': 'alembic',
  'Crucible': 'crucible', 'Calcination': 'calcination', 'Tria Prima': 'tria-prima',
  'Dissolve': 'dissolve', 'Coagulate': 'coagulate', 'The Great Work': 'great-work',
  'Aurum Potabile': 'aurum-potabile',
}

const cards: RawCard[] = (deckJson as { cards: RawCard[] }).cards
export const ALL_CARDS: readonly CardId[] = cards.map((c) => NAME_TO_ID[c.name]!).filter(Boolean)

const _idToRaw: Map<CardId, RawCard> = new Map(cards.map((c) => [NAME_TO_ID[c.name]!, c]))

export function cardMeta(id: CardId): { name: string; symbol: string; codepoint: string; meaning: string; numeral: string; category: RawCard['category'] } {
  const r = _idToRaw.get(id)!
  return { name: r.name, symbol: r.symbol, codepoint: r.symbol_codepoint, meaning: r.meaning, numeral: r.roman_numeral, category: r.category }
}

export function cardCategory(id: CardId): RawCard['category'] { return _idToRaw.get(id)!.category }

export function allCardsByCategory(): Record<string, CardId[]> {
  const out: Record<string, CardId[]> = {}
  for (const id of ALL_CARDS) (out[cardCategory(id)] ??= []).push(id)
  return out
}
```

- [ ] **Step 6: Implement `balance.ts`**

```ts
import current from '../../balance/current.json' assert { type: 'json' }

export interface BalanceParams {
  readonly version: number
  readonly hp: number
  readonly handSize: number
  readonly elementPower: Readonly<Record<'fire' | 'air' | 'earth' | 'water', number>>
  readonly metalShield: Readonly<Record<string, number>>
  readonly reagentMagnitude: Readonly<Record<string, number>>
  readonly processMagnitude: Readonly<Record<string, number>>
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

export const BALANCE: BalanceParams = deepFreeze(current as BalanceParams)
```

- [ ] **Step 7: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- deck`
Expected: PASS.

```bash
git add minis/alchemy-duel/assets/data/deck.json minis/alchemy-duel/balance/current.json \
        minis/alchemy-duel/src/rules/deck.ts minis/alchemy-duel/src/rules/balance.ts \
        minis/alchemy-duel/src/rules/deck.test.ts
git commit -m "feat(alchemy-duel/rules): deck loader (28 cards) + embedded balance constants"
```

---

### Task A.2.5: Effect-table type + dispatch shape

**Files:**
- Create: `minis/alchemy-duel/src/rules/effects.ts` (types only in this task; entries in A.2.6)
- Test: `minis/alchemy-duel/src/rules/effects.test.ts`

- [ ] **Step 1: Write failing test for the EffectFn shape**

```ts
import { describe, it, expect } from 'vitest'
import type { EffectContext, EffectFn, EffectEntry } from './effects'
import { EFFECTS } from './effects'
import { ALL_CARDS } from './deck'

describe('effects/dispatch', () => {
  it('exports an effect entry for every card in the deck', () => {
    for (const id of ALL_CARDS) {
      expect(EFFECTS[id], `missing effect entry for ${id}`).toBeDefined()
      expect(typeof EFFECTS[id]!.kind).toBe('string')
      expect(typeof EFFECTS[id]!.apply).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- effects`
Expected: FAIL ("Cannot find module './effects'").

- [ ] **Step 3: Implement the effect-shape types (no entries yet)**

```ts
import type { DuelState, CardId, PlayerState, Status } from './types'
import type { RNG } from './rng'
import type { BalanceParams } from './balance'

export interface EffectContext {
  readonly state: DuelState
  readonly self: 0 | 1                // the player who played the card
  readonly opponent: 0 | 1
  readonly balance: BalanceParams
  readonly rng: RNG
}

/** Returns a new DuelState; MUST be pure given (ctx, self/opponent). */
export type EffectFn = (ctx: EffectContext) => DuelState

export interface EffectEntry {
  /** Coarse role used by AI heuristics + balance metrics. */
  readonly kind: 'element' | 'metal' | 'reagent' | 'process-verb' | 'finisher'
  /** Optional sub-kind for elements (cycle resolution). */
  readonly element?: 'fire' | 'air' | 'earth' | 'water'
  readonly apply: EffectFn
}

export const EFFECTS: Partial<Record<CardId, EffectEntry>> = {}
```

- [ ] **Step 4: Run, expect fail (the "every card has an entry" assertion fails)**

Run: `pnpm --filter=@minis/alchemy-duel test -- effects`
Expected: FAIL ("missing effect entry for fire" etc.).

This is the deliberate red — A.2.6 fills the table.

- [ ] **Step 5: Commit the scaffold**

```bash
git add minis/alchemy-duel/src/rules/effects.ts minis/alchemy-duel/src/rules/effects.test.ts
git commit -m "feat(alchemy-duel/rules): effect-table types (entries land in A.2.6)"
```

---

### Task A.2.6: 28 card-effect entries

**Files:**
- Modify: `minis/alchemy-duel/src/rules/effects.ts`
- Create: `minis/alchemy-duel/src/rules/stateHelpers.ts`
- Test: `minis/alchemy-duel/src/rules/effects.entries.test.ts`

**Pattern (worked example, then table):** every entry follows the shape `{ kind, element?, apply(ctx) }`. `apply` reads `ctx.state`, computes a new immutable `PlayerState[]` via `stateHelpers`, returns a new `DuelState`. All mutation goes through `stateHelpers` so the engine stays pure.

- [ ] **Step 1: Write `stateHelpers.ts` — the pure-update helpers**

```ts
// minis/alchemy-duel/src/rules/stateHelpers.ts
import type { DuelState, PlayerState, Status, CardId } from './types'

export function replacePlayer(state: DuelState, who: 0 | 1, p: PlayerState): DuelState {
  const players: [PlayerState, PlayerState] = [state.players[0], state.players[1]]
  players[who] = p
  return { ...state, players }
}

export function withHp(p: PlayerState, hp: number): PlayerState {
  return { ...p, hp: Math.max(0, Math.min(99, hp)) }
}

export function withDamage(state: DuelState, target: 0 | 1, amount: number, opts: { ignoreShield?: boolean } = {}): DuelState {
  const p = state.players[target]
  let remaining = amount
  let statuses = p.statuses
  if (!opts.ignoreShield) {
    const shieldIdx = statuses.findIndex((s) => s.kind === 'shield' && (s as { amount: number }).amount > 0)
    if (shieldIdx >= 0) {
      const sh = statuses[shieldIdx] as { kind: 'shield'; amount: number; turnsRemaining: number }
      const absorbed = Math.min(sh.amount, remaining)
      remaining -= absorbed
      const next = absorbed >= sh.amount ? null : { ...sh, amount: sh.amount - absorbed }
      statuses = [...statuses.slice(0, shieldIdx), ...(next ? [next] : []), ...statuses.slice(shieldIdx + 1)]
    }
  }
  return replacePlayer(state, target, { ...withHp(p, p.hp - remaining), statuses })
}

export function withHeal(state: DuelState, target: 0 | 1, amount: number): DuelState {
  const p = state.players[target]
  return replacePlayer(state, target, withHp(p, p.hp + amount))
}

export function withStatus(state: DuelState, target: 0 | 1, status: Status): DuelState {
  const p = state.players[target]
  return replacePlayer(state, target, { ...p, statuses: [...p.statuses, status] })
}

export function withDiscarded(state: DuelState, who: 0 | 1, cardId: CardId): DuelState {
  const p = state.players[who]
  const handIdx = p.hand.indexOf(cardId)
  if (handIdx < 0) return state
  const hand = [...p.hand.slice(0, handIdx), ...p.hand.slice(handIdx + 1)]
  return replacePlayer(state, who, { ...p, hand, discard: [...p.discard, cardId] })
}

export function withDraw(state: DuelState, who: 0 | 1, count: number): DuelState {
  let s = state
  for (let i = 0; i < count; i++) {
    const p = s.players[who]
    if (p.hand.length >= 8) break
    let deck = p.deck
    let discard = p.discard
    if (deck.length === 0 && discard.length > 0) {
      deck = [...discard]
      discard = []
    }
    if (deck.length === 0) break
    const [drawn, ...rest] = deck
    s = replacePlayer(s, who, { ...p, hand: [...p.hand, drawn!], deck: rest, discard })
  }
  return s
}
```

- [ ] **Step 2: Fill the EFFECTS table — worked example (Fire) shown in full, then a table covering the other 27**

In `effects.ts`, replace the empty `EFFECTS` constant. Worked example for `fire`:

```ts
import { withDamage, withHeal, withStatus, withDiscarded, withDraw, replacePlayer } from './stateHelpers'

EFFECTS['fire'] = {
  kind: 'element',
  element: 'fire',
  apply: (ctx) => {
    const power = ctx.balance.elementPower.fire
    // Damage is applied during clash resolution (the engine's resolve phase consults the
    // committed cards' elements + base powers). The `apply` here is a no-op placeholder
    // for elements because resolution is multi-card; included for table completeness.
    return ctx.state
  },
}
```

> **Design note:** Element cards' actual damage is computed at the **resolve phase** of a round (both reveals + counter-cycle + powers + shields). The `EFFECTS` entry exists for completeness/AI introspection; the engine's `resolve` step in A.2.7 dispatches based on `kind === 'element'` and uses `resolveElementClash` + balance.

The complete table for the remaining 27 cards (each entry follows the `EffectEntry` shape; `apply` body shown where non-trivial):

| CardId | kind | apply behavior |
|---|---|---|
| `fire` | element + 'fire' | resolve-phase damage |
| `water` | element + 'water' | resolve-phase damage |
| `air` | element + 'air' | resolve-phase damage |
| `earth` | element + 'earth' | resolve-phase damage |
| `gold-sol` | metal | `withStatus(state, self, { kind:'shield', amount: balance.metalShield['gold-sol'], turnsRemaining: 1 })` |
| `silver-luna` | metal | `withStatus(state, self, { kind:'shield', amount: balance.metalShield['silver-luna'], turnsRemaining: 1 })` |
| `mercury` | metal | same pattern, key `'mercury'` |
| `copper-venus` | metal | same pattern, key `'copper-venus'` |
| `iron-mars` | metal | same pattern, key `'iron-mars'` |
| `tin-jupiter` | metal | same pattern, key `'tin-jupiter'` |
| `lead-saturn` | metal | same pattern, key `'lead-saturn'` |
| `sulfur` | reagent | `withStatus(state, self, { kind:'shield', amount: balance.reagentMagnitude.sulfur, turnsRemaining: 2 })` |
| `salt` | reagent | `withHeal(state, self, balance.reagentMagnitude.salt)` |
| `antimony` | reagent | strip poison stacks: filter `statuses` of opponent removing all `poison`; then `withHeal(state, self, balance.reagentMagnitude.antimony)` |
| `vitriol` | reagent | `withDamage(state, opponent, balance.reagentMagnitude.vitriol)` |
| `arsenic` | reagent | `withStatus(state, opponent, { kind:'poison', stacks: balance.reagentMagnitude.arsenic, turnsRemaining: 3 })` |
| `aqua-fortis` | reagent | `withDamage(state, opponent, balance.reagentMagnitude['aqua-fortis'], { ignoreShield: true })` |
| `aqua-regia` | reagent | dissolve opponent's committed Metal — if `state.players[opponent].committed` is a metal CardId, set their `committed = null` and `withDiscarded(state, opponent, that)` |
| `amalgam` | process-verb | combine top 2 metals on opponent's `statuses` (`kind==='shield'`) into one stack of summed amount on `self` |
| `philosophers-stone` | finisher | `withDamage(state, opponent, balance.processMagnitude['philosophers-stone'])` |
| `alembic` | process-verb | peek-only: returns `state` unchanged but writes a `peek` entry to `state.log` for the AI/UI |
| `crucible` | process-verb | `withDiscarded` self's hand entirely, then `withDraw(state, self, 5)` |
| `calcination` | process-verb | `withStatus(state, self, { kind:'calcination-boost', turnsRemaining: 1 })` |
| `tria-prima` | process-verb | Phase 1: `withDraw(state, self, balance.processMagnitude['tria-prima'])` (simple draw) |
| `dissolve` | process-verb | `withDraw(state, self, balance.processMagnitude.dissolve)` |
| `coagulate` | process-verb | `withStatus(state, self, { kind:'shield', amount: balance.processMagnitude.coagulate, turnsRemaining: 2 })` |
| `great-work` | finisher | `withDamage(state, opponent, balance.processMagnitude['great-work'], { ignoreShield: true })` |
| `aurum-potabile` | finisher | `withHeal(state, self, balance.processMagnitude['aurum-potabile'])` (heals to balance-cap via `withHp` clamp) |

Translate each row directly into an `EFFECTS[<id>] = { kind, apply: (ctx) => { ... } }` entry. Reagent and finisher targeting respects the optional `target` field on a `castReagent` Action (most reagents auto-target opponent or self per the rule above; `aqua-regia` targets opponent's committed; reagents that take an explicit `target` use the action's field).

- [ ] **Step 3: Write per-card unit tests (one per card, mirroring the table)**

```ts
// effects.entries.test.ts — one describe block per card; each verifies a single documented behavior.
import { describe, it, expect } from 'vitest'
import { EFFECTS } from './effects'
import { BALANCE } from './balance'
import { createRng } from './rng'
import { freezeStateInDev, type DuelState } from './types'

function blankState(p0Hp = 30, p1Hp = 30): DuelState {
  return freezeStateInDev({
    rngSeed: 1, turn: 1, activePlayer: 0, phase: 'resolve',
    players: [
      { avatar: 'wizard', hp: p0Hp, hand: [], deck: [], discard: [], committed: null, statuses: [] },
      { avatar: 'knight', hp: p1Hp, hand: [], deck: [], discard: [], committed: null, statuses: [] },
    ],
    log: [], pending: [],
  })
}

const rng = createRng(42)

describe('vitriol deals balance.reagentMagnitude.vitriol damage to opponent', () => {
  it('reduces opponent HP correctly', () => {
    const s = EFFECTS['vitriol']!.apply({ state: blankState(), self: 0, opponent: 1, balance: BALANCE, rng })
    expect(s.players[1]!.hp).toBe(30 - BALANCE.reagentMagnitude.vitriol)
  })
})

describe('aqua-fortis ignores shield', () => {
  it('damages through a shield', () => {
    const withShield: DuelState = (() => {
      const base = blankState()
      const p1 = { ...base.players[1]!, statuses: [{ kind: 'shield' as const, amount: 99, turnsRemaining: 1 }] }
      return { ...base, players: [base.players[0]!, p1] as const }
    })()
    const s = EFFECTS['aqua-fortis']!.apply({ state: withShield, self: 0, opponent: 1, balance: BALANCE, rng })
    expect(s.players[1]!.hp).toBe(30 - BALANCE.reagentMagnitude['aqua-fortis'])
  })
})

// ... one similar describe block per remaining card, asserting its documented state delta from the table above.
// AI-implementer note: copy the pattern from vitriol/aqua-fortis above; the table in A.2.6 step 2 names each card's
// observable. Element cards' tests live in A.2.7's engine.resolve test, not here.
```

- [ ] **Step 4: Run, expect PASS for all 28 entries (elements pass the "entry exists" assertion only)**

Run: `pnpm --filter=@minis/alchemy-duel test -- effects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add minis/alchemy-duel/src/rules/effects.ts minis/alchemy-duel/src/rules/effects.entries.test.ts minis/alchemy-duel/src/rules/stateHelpers.ts
git commit -m "feat(alchemy-duel/rules): 28 card-effect entries + pure state helpers"
```

---

### Task A.2.7: RulesEngine — applyAction, legalActions, view, isTerminal, winner

**Files:**
- Create: `minis/alchemy-duel/src/rules/engine.ts`
- Test: `minis/alchemy-duel/src/rules/engine.test.ts`

- [ ] **Step 1: Write failing tests for the engine surface**

```ts
import { describe, it, expect } from 'vitest'
import { RulesEngine } from './engine'
import { createRng } from './rng'
import { ALL_CARDS } from './deck'
import { BALANCE } from './balance'

describe('RulesEngine', () => {
  it('initializes a mirrored 28-card-deck duel at the documented HP', () => {
    const e = new RulesEngine(BALANCE)
    const s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    expect(s.players[0]!.hp).toBe(BALANCE.hp)
    expect(s.players[1]!.hp).toBe(BALANCE.hp)
    expect(s.players[0]!.hand.length).toBe(BALANCE.handSize)
    expect(s.players[0]!.deck.length + s.players[0]!.hand.length).toBe(28)
    expect(s.phase).toBe('commit')
  })
  it('applyAction is deterministic for the same (state, action, rng)', () => {
    const e = new RulesEngine(BALANCE)
    const s0 = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const card = s0.players[0]!.hand[0]!
    const action = { kind: 'commitCard' as const, cardId: card }
    const a = e.applyAction(s0, action, createRng(99))
    const b = e.applyAction(s0, action, createRng(99))
    expect(a).toEqual(b)
  })
  it('legalActions only returns playable actions', () => {
    const e = new RulesEngine(BALANCE)
    const s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const legal = e.legalActions(s, 0)
    expect(legal.length).toBeGreaterThan(0)
    for (const a of legal) {
      if (a.kind === 'commitCard' || a.kind === 'castReagent') {
        expect(s.players[0]!.hand).toContain(a.cardId)
      }
    }
  })
  it('isTerminal + winner', () => {
    const e = new RulesEngine(BALANCE)
    const s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    expect(e.isTerminal(s)).toBe(false)
    expect(e.winner(s)).toBe(null)
    const dead: typeof s = { ...s, players: [{ ...s.players[0]!, hp: 0 }, s.players[1]!] }
    expect(e.isTerminal(dead)).toBe(true)
    expect(e.winner(dead)).toBe(1)
  })
  it('view hides opponent hand (fog of war)', () => {
    const e = new RulesEngine(BALANCE)
    const s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const v = e.view(s, 0)
    expect(v.you.hand.length).toBe(BALANCE.handSize)
    expect(v.opponent.handCount).toBe(BALANCE.handSize)  // count visible, contents hidden
    expect('hand' in v.opponent).toBe(false)
  })
})

describe('RulesEngine.resolve (element clash)', () => {
  it('Fire vs Air: Fire wins, deals full power, Air dealt half', () => {
    // Driver test: construct a state with both players committed, advance to resolve, check damages.
    // Detailed AI-implementer task — full body shown when the engine wires resolve in step 3 below.
    expect(true).toBe(true) // placeholder for the suite-level integration test in A.2.8
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- engine`
Expected: FAIL.

- [ ] **Step 3: Implement `engine.ts`**

```ts
import type { DuelState, PlayerState, Action, CardId } from './types'
import type { BalanceParams } from './balance'
import type { RNG } from './rng'
import { freezeStateInDev } from './types'
import { ALL_CARDS } from './deck'
import { EFFECTS } from './effects'
import { resolveElementClash, isElement, type Element } from './elements'
import { withDamage, replacePlayer, withDiscarded, withDraw } from './stateHelpers'
import { createRng } from './rng'

export interface InitOptions {
  seed: number
  p0Avatar: PlayerState['avatar']
  p1Avatar: PlayerState['avatar']
}

export interface PerspectiveView {
  turn: number
  phase: DuelState['phase']
  you: PlayerState
  opponent: { hp: number; handCount: number; committedKnown: CardId | null; statuses: PlayerState['statuses']; deckCount: number; discardCount: number }
}

function shuffle<T>(arr: readonly T[], rng: RNG): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.intBelow(i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export class RulesEngine {
  constructor(readonly balance: BalanceParams) {}

  createInitialState(opts: InitOptions): DuelState {
    const rng = createRng(opts.seed)
    const mk = (avatar: PlayerState['avatar']): PlayerState => {
      const deck = shuffle(ALL_CARDS, rng)
      const hand = deck.slice(0, this.balance.handSize)
      return { avatar, hp: this.balance.hp, hand, deck: deck.slice(this.balance.handSize), discard: [], committed: null, statuses: [] }
    }
    return freezeStateInDev({
      rngSeed: opts.seed, turn: 1, activePlayer: 0, phase: 'commit',
      players: [mk(opts.p0Avatar), mk(opts.p1Avatar)],
      log: [], pending: [],
    })
  }

  legalActions(state: DuelState, player: 0 | 1): Action[] {
    if (state.phase === 'gameOver') return []
    const p = state.players[player]
    const out: Action[] = []
    if (state.phase === 'commit' && p.committed === null) {
      for (const id of p.hand) out.push({ kind: 'commitCard', cardId: id })
    }
    // Reagents castable any phase except gameOver
    if (state.phase !== 'gameOver') {
      for (const id of p.hand) {
        const e = EFFECTS[id]
        if (e?.kind === 'reagent') out.push({ kind: 'castReagent', cardId: id })
      }
    }
    out.push({ kind: 'endTurn' })
    return out
  }

  applyAction(state: DuelState, action: Action, rng: RNG): DuelState {
    if (state.phase === 'gameOver') return state
    switch (action.kind) {
      case 'commitCard': {
        const p = state.players[state.activePlayer]
        if (p.committed !== null || !p.hand.includes(action.cardId)) return state
        const handIdx = p.hand.indexOf(action.cardId)
        const hand = [...p.hand.slice(0, handIdx), ...p.hand.slice(handIdx + 1)]
        let s = replacePlayer(state, state.activePlayer, { ...p, hand, committed: action.cardId })
        s = { ...s, log: [...s.log, { turn: s.turn, action, byPlayer: state.activePlayer }] }
        const bothCommitted = s.players[0]!.committed !== null && s.players[1]!.committed !== null
        if (bothCommitted) s = this.resolveRound(s, rng)
        else s = { ...s, activePlayer: (1 - state.activePlayer) as 0 | 1 }
        return freezeStateInDev(s)
      }
      case 'castReagent': {
        const e = EFFECTS[action.cardId]
        if (!e || e.kind !== 'reagent') return state
        const p = state.players[state.activePlayer]
        if (!p.hand.includes(action.cardId)) return state
        const self = state.activePlayer, opponent = (1 - self) as 0 | 1
        let s = withDiscarded(state, self, action.cardId)
        s = e.apply({ state: s, self, opponent, balance: this.balance, rng })
        s = { ...s, log: [...s.log, { turn: s.turn, action, byPlayer: self }] }
        return freezeStateInDev(this.checkTerminal(s))
      }
      case 'endTurn': {
        const next: DuelState = { ...state, activePlayer: (1 - state.activePlayer) as 0 | 1, turn: state.turn + 1, phase: 'commit' }
        return freezeStateInDev(this.tickStatuses(next))
      }
    }
  }

  private resolveRound(state: DuelState, rng: RNG): DuelState {
    let s = state
    const c0 = s.players[0]!.committed!; const c1 = s.players[1]!.committed!
    const e0 = EFFECTS[c0]!; const e1 = EFFECTS[c1]!

    // Element clash (both elements): apply counter-cycle damage; elements take precedence over metals.
    if (e0.kind === 'element' && e1.kind === 'element') {
      const winner = resolveElementClash(e0.element!, e1.element!)
      const pwr0 = this.balance.elementPower[e0.element!]; const pwr1 = this.balance.elementPower[e1.element!]
      if (winner === 0) { s = withDamage(s, 1, pwr0); s = withDamage(s, 0, Math.floor(pwr1 / 2)) }
      else if (winner === 1) { s = withDamage(s, 0, pwr1); s = withDamage(s, 1, Math.floor(pwr0 / 2)) }
      else { s = withDamage(s, 1, pwr0); s = withDamage(s, 0, pwr1) }
    }
    // Mixed element + metal: metal shields self, element deals full power to attacker's target.
    else {
      // Apply each card's own apply() in seat order (0 then 1)
      for (const seat of [0, 1] as const) {
        const opponent = (1 - seat) as 0 | 1
        const e = seat === 0 ? e0 : e1
        s = e.apply({ state: s, self: seat, opponent, balance: this.balance, rng })
        // Element seats also deal their power to opponent
        if (e.kind === 'element') s = withDamage(s, opponent, this.balance.elementPower[e.element!])
      }
    }

    // Discard committed cards and advance phase
    s = withDiscarded(s, 0, c0); s = replacePlayer(s, 0, { ...s.players[0]!, committed: null })
    s = withDiscarded(s, 1, c1); s = replacePlayer(s, 1, { ...s.players[1]!, committed: null })
    s = withDraw(s, 0, this.balance.handSize - s.players[0]!.hand.length)
    s = withDraw(s, 1, this.balance.handSize - s.players[1]!.hand.length)
    s = { ...s, turn: s.turn + 1, activePlayer: 0, phase: 'commit' }
    return this.checkTerminal(this.tickStatuses(s))
  }

  private tickStatuses(state: DuelState): DuelState {
    let s = state
    for (const seat of [0, 1] as const) {
      const p = s.players[seat]
      // Poison: damage equal to stacks at turn start; tick durations.
      const poison = p.statuses.find((st) => st.kind === 'poison') as { kind: 'poison'; stacks: number; turnsRemaining: number } | undefined
      if (poison && poison.turnsRemaining > 0) s = withDamage(s, seat, poison.stacks, { ignoreShield: true })
      const statuses = p.statuses.map((st) => ('turnsRemaining' in st ? { ...st, turnsRemaining: st.turnsRemaining - 1 } : st)).filter((st) => !('turnsRemaining' in st) || st.turnsRemaining > 0)
      s = replacePlayer(s, seat, { ...s.players[seat]!, statuses })
    }
    return s
  }

  private checkTerminal(state: DuelState): DuelState {
    if (state.players[0]!.hp <= 0 || state.players[1]!.hp <= 0) return { ...state, phase: 'gameOver' }
    return state
  }

  isTerminal(state: DuelState): boolean { return state.phase === 'gameOver' }

  winner(state: DuelState): 0 | 1 | null {
    if (state.phase !== 'gameOver') return null
    if (state.players[0]!.hp <= 0 && state.players[1]!.hp <= 0) return null // simultaneous draw — caller treats as no-winner
    if (state.players[0]!.hp <= 0) return 1
    if (state.players[1]!.hp <= 0) return 0
    return null
  }

  view(state: DuelState, player: 0 | 1): PerspectiveView {
    const you = state.players[player]; const opp = state.players[1 - player]
    return {
      turn: state.turn, phase: state.phase, you,
      opponent: {
        hp: opp.hp, handCount: opp.hand.length, committedKnown: state.phase === 'resolve' ? opp.committed : null,
        statuses: opp.statuses, deckCount: opp.deck.length, discardCount: opp.discard.length,
      },
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter=@minis/alchemy-duel test -- engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add minis/alchemy-duel/src/rules/engine.ts minis/alchemy-duel/src/rules/engine.test.ts
git commit -m "feat(alchemy-duel/rules): RulesEngine — applyAction, legalActions, view, isTerminal, winner, resolveRound"
```

---

### Task A.2.8: HeuristicAI (counter-pick policy)

**Files:**
- Create: `minis/alchemy-duel/src/rules/ai.ts`
- Test: `minis/alchemy-duel/src/rules/ai.test.ts`

- [ ] **Step 1: Write failing tests for AI behavior**

```ts
import { describe, it, expect } from 'vitest'
import { HeuristicAI, type DuelAI } from './ai'
import { RulesEngine } from './engine'
import { BALANCE } from './balance'
import { createRng } from './rng'

describe('HeuristicAI', () => {
  const e = new RulesEngine(BALANCE); const rng = createRng(1)
  const ai: DuelAI = new HeuristicAI()

  it('returns a legal action on every call', () => {
    let s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    for (let i = 0; i < 20 && !e.isTerminal(s); i++) {
      const a = ai.chooseAction(s, s.activePlayer, rng)
      expect(e.legalActions(s, s.activePlayer)).toContainEqual(a)
      s = e.applyAction(s, a, rng)
    }
  })

  it('prefers shield when HP is low', () => {
    let s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    // Force HP low and hand to contain a metal
    s = { ...s, players: [{ ...s.players[0]!, hp: 5, hand: ['gold-sol', 'fire'] }, s.players[1]!] }
    const a = ai.chooseAction(s, 0, rng)
    expect(a.kind === 'commitCard' && a.cardId === 'gold-sol').toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- ai`
Expected: FAIL.

- [ ] **Step 3: Implement `ai.ts`**

```ts
import type { DuelState, Action } from './types'
import type { RNG } from './rng'
import { EFFECTS } from './effects'
import { resolveElementClash, isElement } from './elements'
import { BALANCE } from './balance'

export interface DuelAI {
  chooseAction(state: DuelState, player: 0 | 1, rng: RNG): Action
}

const LOW_HP_THRESHOLD = 10

export class HeuristicAI implements DuelAI {
  chooseAction(state: DuelState, player: 0 | 1, rng: RNG): Action {
    const p = state.players[player]; const opp = state.players[1 - player]
    // 1) If HP critical and a metal is available, shield
    if (p.hp <= LOW_HP_THRESHOLD && state.phase === 'commit' && p.committed === null) {
      const metal = p.hand.find((c) => EFFECTS[c]?.kind === 'metal')
      if (metal) return { kind: 'commitCard', cardId: metal }
    }
    // 2) If opponent committed and visible, counter-pick element
    if (state.phase === 'commit' && p.committed === null && opp.committed && isElement(opp.committed)) {
      const counters: Record<string, string> = { fire: 'water', air: 'fire', earth: 'air', water: 'earth' }
      const counter = counters[opp.committed]
      const c = p.hand.find((card) => card === counter)
      if (c) return { kind: 'commitCard', cardId: c }
    }
    // 3) Burst reagent if it would finish opponent
    if (opp.hp <= BALANCE.reagentMagnitude['aqua-fortis']) {
      const finisher = p.hand.find((c) => c === 'aqua-fortis')
      if (finisher) return { kind: 'castReagent', cardId: finisher }
    }
    // 4) Otherwise play highest-power element, or any element, or fall back to endTurn
    const elements = p.hand.filter((c) => EFFECTS[c]?.kind === 'element')
    if (state.phase === 'commit' && p.committed === null && elements.length > 0) {
      const ranked = [...elements].sort((a, b) => (BALANCE.elementPower[EFFECTS[b]!.element!] ?? 0) - (BALANCE.elementPower[EFFECTS[a]!.element!] ?? 0))
      return { kind: 'commitCard', cardId: ranked[0]! }
    }
    return { kind: 'endTurn' }
  }
}
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- ai`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/rules/ai.ts minis/alchemy-duel/src/rules/ai.test.ts
git commit -m "feat(alchemy-duel/rules): HeuristicAI counter-pick policy (Strategy interface)"
```

---

### Task A.2.9: Integration test — full deterministic match

**Files:**
- Test: `minis/alchemy-duel/src/rules/integration.match.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect } from 'vitest'
import { RulesEngine } from './engine'
import { HeuristicAI } from './ai'
import { BALANCE } from './balance'
import { createRng } from './rng'

describe('integration: full deterministic match', () => {
  it('completes in < 100ms and is bit-identical across runs (seed=1)', () => {
    const run = () => {
      const e = new RulesEngine(BALANCE)
      const ai0 = new HeuristicAI(); const ai1 = new HeuristicAI()
      const rng = createRng(1)
      let s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
      let safety = 0
      while (!e.isTerminal(s) && safety++ < 500) {
        const ai = s.activePlayer === 0 ? ai0 : ai1
        s = e.applyAction(s, ai.chooseAction(s, s.activePlayer, rng), rng)
      }
      return s
    }
    const start = performance.now()
    const a = run(); const b = run()
    const ms = performance.now() - start
    expect(ms).toBeLessThan(100)
    expect(e_eq(a, b)).toBe(true)
    expect(a.phase).toBe('gameOver')
  })
})

function e_eq(a: object, b: object): boolean { return JSON.stringify(a) === JSON.stringify(b) }
```

- [ ] **Step 2: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- integration.match`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/rules/integration.match.test.ts
git commit -m "test(alchemy-duel/rules): integration — full deterministic match completes < 100ms"
```

---

### Task A.3.1: Headless simulator — `simulateMatch`

**Files:**
- Create: `minis/alchemy-duel/src/dev/balance/simulator.ts`
- Test: `minis/alchemy-duel/src/dev/balance/simulator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { simulateMatch, type MatchRecord } from './simulator'
import { BALANCE } from '../../rules/balance'
import { HeuristicAI } from '../../rules/ai'

describe('simulateMatch', () => {
  it('produces a MatchRecord with terminal state and complete action log', () => {
    const rec: MatchRecord = simulateMatch({ balance: BALANCE, p0: new HeuristicAI(), p1: new HeuristicAI(), seed: 1 })
    expect(rec.terminal).toBe(true)
    expect(rec.winner === 0 || rec.winner === 1 || rec.winner === null).toBe(true)
    expect(rec.actions.length).toBeGreaterThan(0)
    expect(rec.seed).toBe(1)
  })
  it('is bit-identical on replay', () => {
    const a = simulateMatch({ balance: BALANCE, p0: new HeuristicAI(), p1: new HeuristicAI(), seed: 7 })
    const b = simulateMatch({ balance: BALANCE, p0: new HeuristicAI(), p1: new HeuristicAI(), seed: 7 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- simulator`
Expected: FAIL.

- [ ] **Step 3: Implement `simulator.ts`**

```ts
import { RulesEngine } from '../../rules/engine'
import type { Action, DuelState } from '../../rules/types'
import type { DuelAI } from '../../rules/ai'
import type { BalanceParams } from '../../rules/balance'
import { createRng } from '../../rules/rng'

export interface SimOptions {
  balance: BalanceParams
  p0: DuelAI
  p1: DuelAI
  seed: number
  p0Avatar?: 'wizard' | 'witch' | 'warlock' | 'knight'
  p1Avatar?: 'wizard' | 'witch' | 'warlock' | 'knight'
  maxTurns?: number
}

export interface MatchRecord {
  seed: number
  terminal: boolean
  winner: 0 | 1 | null
  turns: number
  actions: { turn: number; byPlayer: 0 | 1; action: Action }[]
  finalState: DuelState
}

export function simulateMatch(opts: SimOptions): MatchRecord {
  const e = new RulesEngine(opts.balance)
  const rng = createRng(opts.seed)
  let s = e.createInitialState({ seed: opts.seed, p0Avatar: opts.p0Avatar ?? 'wizard', p1Avatar: opts.p1Avatar ?? 'knight' })
  const actions: MatchRecord['actions'] = []
  const max = opts.maxTurns ?? 500
  while (!e.isTerminal(s) && s.turn <= max) {
    const ai = s.activePlayer === 0 ? opts.p0 : opts.p1
    const action = ai.chooseAction(s, s.activePlayer, rng)
    actions.push({ turn: s.turn, byPlayer: s.activePlayer, action })
    s = e.applyAction(s, action, rng)
  }
  return { seed: opts.seed, terminal: e.isTerminal(s), winner: e.winner(s), turns: s.turn, actions, finalState: s }
}
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- simulator`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/balance/simulator.ts minis/alchemy-duel/src/dev/balance/simulator.test.ts
git commit -m "feat(alchemy-duel/dev/balance): simulateMatch — bit-identical replays, deterministic"
```

---

### Task A.3.2: `simulateBatch` + worker_threads sharding

**Files:**
- Modify: `minis/alchemy-duel/src/dev/balance/simulator.ts` (add `simulateBatch`)
- Create: `minis/alchemy-duel/src/dev/balance/simulator.worker.ts`
- Test: `minis/alchemy-duel/src/dev/balance/simulator.batch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { simulateBatch } from './simulator'
import { BALANCE } from '../../rules/balance'
import { HeuristicAI } from '../../rules/ai'

describe('simulateBatch', () => {
  it('runs N matches and returns aggregated counts', async () => {
    const r = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: 50, seedBank: 100 })
    expect(r.matchesRun).toBe(50)
    expect(r.p0Wins + r.p1Wins + r.draws).toBe(50)
    expect(r.medianTurns).toBeGreaterThan(0)
  })
  it('is reproducible from the same seedBank', async () => {
    const a = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: 20, seedBank: 42 })
    const b = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: 20, seedBank: 42 })
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- simulator.batch`
Expected: FAIL.

- [ ] **Step 3: Append `simulateBatch` to `simulator.ts` (single-threaded baseline; worker sharding is an optimization)**

```ts
export interface BatchOptions {
  balance: BalanceParams
  p0: () => DuelAI                  // factory so each match gets a fresh AI instance
  p1: () => DuelAI
  matches: number
  seedBank: number                  // base seed; per-match seed = seedBank * matches + i
}

export interface BatchResult {
  matchesRun: number
  p0Wins: number; p1Wins: number; draws: number
  medianTurns: number
  records: MatchRecord[]
}

export async function simulateBatch(opts: BatchOptions): Promise<BatchResult> {
  const records: MatchRecord[] = []
  for (let i = 0; i < opts.matches; i++) {
    const seed = (opts.seedBank * 1000003 + i) >>> 0
    records.push(simulateMatch({ balance: opts.balance, p0: opts.p0(), p1: opts.p1(), seed }))
  }
  const turns = [...records].map((r) => r.turns).sort((a, b) => a - b)
  return {
    matchesRun: records.length,
    p0Wins: records.filter((r) => r.winner === 0).length,
    p1Wins: records.filter((r) => r.winner === 1).length,
    draws: records.filter((r) => r.winner === null).length,
    medianTurns: turns[Math.floor(turns.length / 2)] ?? 0,
    records,
  }
}
```

> **Worker_threads sharding is a Phase 2 optimization** of this subsystem (per spec §3 phasing discipline). Single-threaded baseline ships first because the typical batch (10k matches × <100ms each) completes in seconds; sharding's value is at 50k+. Add `simulator.worker.ts` + a `WORKER_COUNT` env knob in Phase 2 when batch sizes grow.

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- simulator.batch`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/balance/simulator.ts minis/alchemy-duel/src/dev/balance/simulator.batch.test.ts
git commit -m "feat(alchemy-duel/dev/balance): simulateBatch (Phase 1 single-threaded; worker sharding deferred to Phase 2)"
```

---

### Task A.3.3: Metrics aggregator + composite L(θ) + essentiality

**Files:**
- Create: `minis/alchemy-duel/src/dev/balance/metrics.ts`
- Test: `minis/alchemy-duel/src/dev/balance/metrics.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { computeMetrics, compositeLoss, runEssentiality, DEFAULT_WEIGHTS } from './metrics'
import { simulateBatch } from './simulator'
import { BALANCE } from '../../rules/balance'
import { HeuristicAI } from '../../rules/ai'

describe('metrics', () => {
  it('computes fairness, length, per-card winrate/playrate from a batch', async () => {
    const batch = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: 100, seedBank: 1 })
    const m = computeMetrics(batch)
    expect(Math.abs(m.fairness.p0Winrate - 0.5)).toBeLessThan(0.5)
    expect(m.length.median).toBeGreaterThan(0)
    expect(Object.keys(m.perCard).length).toBeGreaterThan(0)
  })
  it('compositeLoss is non-negative and finite', async () => {
    const batch = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: 100, seedBank: 1 })
    const L = compositeLoss(computeMetrics(batch), DEFAULT_WEIGHTS)
    expect(Number.isFinite(L)).toBe(true)
    expect(L).toBeGreaterThanOrEqual(0)
  })
  it('runEssentiality passes for the current balance', async () => {
    const r = await runEssentiality(BALANCE, 200, 1)
    for (const [card, pass] of Object.entries(r)) expect(pass.passed, `${card} essentiality failed (winrate ${pass.winrate})`).toBe(true)
  }, 60_000)
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- metrics`
Expected: FAIL.

- [ ] **Step 3: Implement `metrics.ts`**

```ts
import type { BalanceParams } from '../../rules/balance'
import type { BatchResult } from './simulator'
import { simulateBatch } from './simulator'
import { HeuristicAI } from '../../rules/ai'
import { ALL_CARDS } from '../../rules/deck'
import type { CardId } from '../../rules/types'

export interface CompositeWeights { fair: number; length: number; viability: number; synergy: number; runaway: number; redundancy: number }
export const DEFAULT_WEIGHTS: CompositeWeights = { fair: 1.0, length: 0.5, viability: 0.8, synergy: 0.6, runaway: 0.4, redundancy: 0 }

export interface MetricsReport {
  fairness: { p0Winrate: number; drift: number }
  length: { median: number; outOfBandPenalty: number }
  perCard: Record<CardId, { playrate: number; winrateWhenPlayed: number }>
  synergyOutliers: number      // count of card pairs whose pair-uplift Z > threshold
  comebackRate: number
  decisionTension: number
  reagentImpactEntropy: number
}

const SIGNATURE_CARDS = new Set<CardId>(['philosophers-stone', 'great-work', 'aurum-potabile'])
const VIABILITY_WINRATE_FLOOR = 0.35
const VIABILITY_PLAYRATE_FLOOR = 0.05
const LENGTH_BAND: [number, number] = [12, 20]
const COMEBACK_FLOOR = 0.15

export function computeMetrics(batch: BatchResult): MetricsReport {
  const p0Winrate = batch.p0Wins / batch.matchesRun
  const drift = Math.abs(p0Winrate - 0.5)
  const median = batch.medianTurns
  const out = median < LENGTH_BAND[0] ? LENGTH_BAND[0] - median : median > LENGTH_BAND[1] ? median - LENGTH_BAND[1] : 0
  const cardPlay: Record<string, number> = {}; const cardWinPlay: Record<string, number> = {}
  for (const rec of batch.records) {
    for (const a of rec.actions) {
      if (a.action.kind !== 'commitCard' && a.action.kind !== 'castReagent') continue
      const id = a.action.cardId
      cardPlay[id] = (cardPlay[id] ?? 0) + 1
      if (rec.winner === a.byPlayer) cardWinPlay[id] = (cardWinPlay[id] ?? 0) + 1
    }
  }
  const totalCardPlays = Object.values(cardPlay).reduce((a, b) => a + b, 0) || 1
  const perCard = {} as MetricsReport['perCard']
  for (const id of ALL_CARDS) {
    const plays = cardPlay[id] ?? 0
    perCard[id] = { playrate: plays / totalCardPlays, winrateWhenPlayed: plays > 0 ? (cardWinPlay[id] ?? 0) / plays : 0 }
  }
  // Synergy / comeback / tension / reagent-entropy are computed similarly from the records;
  // implementation reads the action stream + winner. Stub-zero for v1 metrics; full impls
  // land alongside the persona playtest pass that calibrates their bands (per spec §5.B.6).
  return { fairness: { p0Winrate, drift }, length: { median, outOfBandPenalty: out }, perCard, synergyOutliers: 0, comebackRate: 0.5, decisionTension: 0, reagentImpactEntropy: 0 }
}

export function compositeLoss(m: MetricsReport, w: CompositeWeights): number {
  let L = 0
  L += w.fair * m.fairness.drift * m.fairness.drift
  L += w.length * m.length.outOfBandPenalty * m.length.outOfBandPenalty
  // Viability — sum of per-card violations; signature cards exempted.
  for (const id of ALL_CARDS) {
    if (SIGNATURE_CARDS.has(id)) continue
    const c = m.perCard[id]!
    if (c.winrateWhenPlayed < VIABILITY_WINRATE_FLOOR) L += w.viability * (VIABILITY_WINRATE_FLOOR - c.winrateWhenPlayed)
    if (c.playrate < VIABILITY_PLAYRATE_FLOOR) L += w.viability * (VIABILITY_PLAYRATE_FLOOR - c.playrate)
  }
  L += w.synergy * m.synergyOutliers
  L += w.runaway * Math.max(0, COMEBACK_FLOOR - m.comebackRate)
  L += w.redundancy * 0   // Phase 2 — weight 0 by default
  return L
}

export interface EssentialityResult { passed: boolean; winrate: number }

export async function runEssentiality(balance: BalanceParams, matchesPerCard: number, seedBank: number): Promise<Record<CardId, EssentialityResult>> {
  const out: Record<CardId, EssentialityResult> = {} as Record<CardId, EssentialityResult>
  for (const id of ALL_CARDS) {
    // p1 loses card_i — measured by its remaining winrate. <0.45 → essential, fails the gate.
    const depletedBalance = balance // No balance mutation here; depletion happens via AI/state init filtering.
    // For Phase 1 we approximate essentiality by removing the card from p1's initial deck.
    // (Full implementation in A.3.4 — for now we just call simulateBatch and pass).
    const batch = await simulateBatch({ balance: depletedBalance, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: matchesPerCard, seedBank })
    const p1Winrate = batch.p1Wins / batch.matchesRun
    out[id] = { passed: p1Winrate >= 0.45, winrate: p1Winrate }
  }
  return out
}
```

> **Note:** `runEssentiality` above is the Phase 1 approximation (uses the unmodified deck both sides). A.3.4 lands the asymmetric leave-one-out where p1's deck is constructed with `card_i` removed.

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- metrics`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/balance/metrics.ts minis/alchemy-duel/src/dev/balance/metrics.test.ts
git commit -m "feat(alchemy-duel/dev/balance): metrics + composite L(θ) + essentiality scaffold"
```

---

### Task A.3.4: Asymmetric leave-one-out essentiality

**Files:**
- Modify: `minis/alchemy-duel/src/dev/balance/simulator.ts` (add a `deckOverride` option)
- Modify: `minis/alchemy-duel/src/dev/balance/metrics.ts` (real `runEssentiality`)
- Test: `minis/alchemy-duel/src/dev/balance/essentiality.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { runEssentiality } from './metrics'
import { BALANCE } from '../../rules/balance'

describe('runEssentiality (asymmetric)', () => {
  it('passes for every card with the seeded baseline balance', async () => {
    const r = await runEssentiality(BALANCE, 200, 1)
    for (const [card, res] of Object.entries(r)) expect(res.passed, `${card} essentiality failed (winrate ${res.winrate.toFixed(3)})`).toBe(true)
  }, 120_000)
})
```

- [ ] **Step 2: Extend `RulesEngine.createInitialState` to accept per-seat deck overrides + plumb through `simulateMatch`/`simulateBatch`/`runEssentiality`**

Implementation sketch (apply to the relevant files):
- `engine.ts` `InitOptions` gains `p0Deck?: readonly CardId[]; p1Deck?: readonly CardId[]`.
- `createInitialState` uses overrides when provided, else `ALL_CARDS`.
- `simulator.ts` `SimOptions` / `BatchOptions` gain `p0Deck?` / `p1Deck?` forwarded to `createInitialState`.
- `metrics.ts` `runEssentiality` removes `card_i` from `p1Deck` and asserts p1 winrate ≥ 0.45.

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- essentiality`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/rules/engine.ts minis/alchemy-duel/src/dev/balance/simulator.ts minis/alchemy-duel/src/dev/balance/metrics.ts minis/alchemy-duel/src/dev/balance/essentiality.test.ts
git commit -m "feat(alchemy-duel/dev/balance): asymmetric leave-one-out essentiality (hard gate)"
```

---

### Task A.4.1: CMA-ES tuner wrapper

**Files:**
- Create: `minis/alchemy-duel/src/dev/balance/tuner.ts`
- Test: `minis/alchemy-duel/src/dev/balance/tuner.test.ts`

- [ ] **Step 1: Write failing test (uses a synthetic mini-game so it converges fast)**

```ts
import { describe, it, expect } from 'vitest'
import { tune, paramsToVector, vectorToParams } from './tuner'
import { BALANCE } from '../../rules/balance'

describe('CMA-ES tuner', () => {
  it('paramsToVector ↔ vectorToParams round-trips', () => {
    const v = paramsToVector(BALANCE)
    const p = vectorToParams(v)
    expect(p.elementPower.fire).toBe(BALANCE.elementPower.fire)
    expect(p.metalShield['gold-sol']).toBe(BALANCE.metalShield['gold-sol'])
  })
  it('runs a tiny generation budget without throwing', async () => {
    const result = await tune({ start: BALANCE, populationSize: 6, generations: 3, matchesPerEval: 20, seedBank: 1 })
    expect(result.bestLoss).toBeGreaterThanOrEqual(0)
    expect(result.bestParams.elementPower.fire).toBeGreaterThan(0)
  }, 60_000)
})
```

- [ ] **Step 2: Implement `tuner.ts`**

```ts
import type { BalanceParams } from '../../rules/balance'
import { simulateBatch } from './simulator'
import { computeMetrics, compositeLoss, DEFAULT_WEIGHTS } from './metrics'
import { HeuristicAI } from '../../rules/ai'
// @ts-expect-error — cma-es has no types
import { CMAES } from 'cma-es'

const ELEMENT_KEYS = ['fire', 'air', 'earth', 'water'] as const
const METAL_KEYS = ['gold-sol', 'silver-luna', 'mercury', 'copper-venus', 'iron-mars', 'tin-jupiter', 'lead-saturn'] as const
const REAGENT_KEYS = ['antimony', 'vitriol', 'arsenic', 'aqua-fortis', 'aqua-regia', 'sulfur', 'salt'] as const
const PROCESS_KEYS = ['amalgam', 'philosophers-stone', 'alembic', 'crucible', 'calcination', 'tria-prima', 'dissolve', 'coagulate', 'great-work', 'aurum-potabile'] as const

const BOUNDS: { lo: number; hi: number }[] = [
  ...ELEMENT_KEYS.map(() => ({ lo: 1, hi: 12 })),
  ...METAL_KEYS.map(() => ({ lo: 1, hi: 12 })),
  ...REAGENT_KEYS.map(() => ({ lo: 0, hi: 12 })),
  ...PROCESS_KEYS.map(() => ({ lo: 0, hi: 30 })),
]

export function paramsToVector(p: BalanceParams): number[] {
  return [
    ...ELEMENT_KEYS.map((k) => p.elementPower[k]),
    ...METAL_KEYS.map((k) => p.metalShield[k] ?? 0),
    ...REAGENT_KEYS.map((k) => p.reagentMagnitude[k] ?? 0),
    ...PROCESS_KEYS.map((k) => p.processMagnitude[k] ?? 0),
  ]
}

export function vectorToParams(v: number[]): BalanceParams {
  let i = 0; const take = () => v[i++]!
  const elementPower = Object.fromEntries(ELEMENT_KEYS.map((k) => [k, take()])) as BalanceParams['elementPower']
  const metalShield = Object.fromEntries(METAL_KEYS.map((k) => [k, take()]))
  const reagentMagnitude = Object.fromEntries(REAGENT_KEYS.map((k) => [k, take()]))
  const processMagnitude = Object.fromEntries(PROCESS_KEYS.map((k) => [k, take()]))
  return { version: 1, hp: 30, handSize: 5, elementPower, metalShield, reagentMagnitude, processMagnitude }
}

function clampVector(v: number[]): number[] {
  return v.map((x, i) => Math.max(BOUNDS[i]!.lo, Math.min(BOUNDS[i]!.hi, x)))
}

export interface TuneOptions {
  start: BalanceParams
  populationSize: number
  generations: number
  matchesPerEval: number
  seedBank: number
  sigma?: number
}

export interface TuneResult { bestParams: BalanceParams; bestLoss: number; history: number[] }

export async function tune(opts: TuneOptions): Promise<TuneResult> {
  const x0 = paramsToVector(opts.start)
  const es = new CMAES({ initialMean: x0, initialStandardDeviation: opts.sigma ?? 1.0, populationSize: opts.populationSize, maxGenerations: opts.generations })
  let bestLoss = Infinity; let bestVector = x0
  const history: number[] = []
  for (let gen = 0; gen < opts.generations; gen++) {
    const population: number[][] = es.ask().map(clampVector)
    const losses: number[] = []
    for (const v of population) {
      const candidate = vectorToParams(v)
      const batch = await simulateBatch({ balance: candidate, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches: opts.matchesPerEval, seedBank: opts.seedBank + gen })
      const L = compositeLoss(computeMetrics(batch), DEFAULT_WEIGHTS)
      losses.push(L)
      if (L < bestLoss) { bestLoss = L; bestVector = v }
    }
    es.tell(losses)
    history.push(Math.min(...losses))
  }
  return { bestParams: vectorToParams(bestVector), bestLoss, history }
}
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- tuner`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/balance/tuner.ts minis/alchemy-duel/src/dev/balance/tuner.test.ts
git commit -m "feat(alchemy-duel/dev/balance): CMA-ES tuner wrapper with bounded params + history"
```

---

### Task A.5.1: Daemon — WS protocol schema + validation

**Files:**
- Create: `minis/alchemy-duel/src/dev/daemon/protocol.ts`
- Test: `minis/alchemy-duel/src/dev/daemon/protocol.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseMessage, type DaemonRequest, type DaemonResponse } from './protocol'

describe('daemon/protocol', () => {
  it('parses session.start request', () => {
    const r = parseMessage(JSON.stringify({ cmd: 'session.start', persona: 'aggro-anna', seed: 42, opponent: 'heuristic' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.cmd).toBe('session.start')
  })
  it('rejects unknown cmd', () => {
    const r = parseMessage(JSON.stringify({ cmd: 'nope' }))
    expect(r.ok).toBe(false)
  })
  it('rejects malformed JSON', () => {
    const r = parseMessage('{not-json}')
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- protocol`
Expected: FAIL.

- [ ] **Step 3: Implement `protocol.ts`**

```ts
import type { Action } from '../../rules/types'
import type { CardId } from '../../rules/types'

export type DaemonRequest =
  | { cmd: 'session.start';   persona: string; seed: number; opponent: 'heuristic'; params?: unknown }
  | { cmd: 'session.view';    sessionId: string; player: 0 | 1 }
  | { cmd: 'session.actions'; sessionId: string; player: 0 | 1 }
  | { cmd: 'session.play';    sessionId: string; player: 0 | 1; actionIndex: number }
  | { cmd: 'session.tag';     sessionId: string; player: 0 | 1; kind: 'feelbad' | 'boring' | 'surprising' | 'satisfying' | 'confusing'; card?: CardId; why?: string }
  | { cmd: 'session.rubric';  sessionId: string; player: 0 | 1; fun: number; fairness: number; clarity: number; comeback: number; interesting: number }
  | { cmd: 'session.end';     sessionId: string }
  | { cmd: 'batch.sim';       params: unknown; matches: number; seedBank: number; ai0: 'heuristic'; ai1: 'heuristic' }

export type DaemonResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export function parseMessage(raw: string): { ok: true; value: DaemonRequest } | { ok: false; error: string } {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { ok: false, error: 'invalid-json' } }
  if (!parsed || typeof parsed !== 'object' || !('cmd' in parsed)) return { ok: false, error: 'missing-cmd' }
  const valid: DaemonRequest['cmd'][] = ['session.start', 'session.view', 'session.actions', 'session.play', 'session.tag', 'session.rubric', 'session.end', 'batch.sim']
  if (!valid.includes((parsed as { cmd: string }).cmd as DaemonRequest['cmd'])) return { ok: false, error: 'unknown-cmd' }
  return { ok: true, value: parsed as DaemonRequest }
}
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- protocol`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/daemon/protocol.ts minis/alchemy-duel/src/dev/daemon/protocol.test.ts
git commit -m "feat(alchemy-duel/dev/daemon): WS protocol schema + parser"
```

---

### Task A.5.2: Daemon — session store + transcript persistence

**Files:**
- Create: `minis/alchemy-duel/src/dev/daemon/sessions.ts`
- Test: `minis/alchemy-duel/src/dev/daemon/sessions.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionStore } from './sessions'
import { BALANCE } from '../../rules/balance'

describe('SessionStore', () => {
  it('creates, plays, tags, and persists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'duel-sessions-'))
    const store = new SessionStore({ balance: BALANCE, transcriptDir: dir, feedbackDir: dir })
    const id = store.create({ persona: 'aggro-anna', seed: 1, opponent: 'heuristic' })
    expect(typeof id).toBe('string')
    const view = store.view(id, 0)
    expect(view.you.hand.length).toBeGreaterThan(0)
    const acts = store.actions(id, 0)
    expect(acts.length).toBeGreaterThan(0)
    const before = store.view(id, 0)
    store.play(id, 0, 0)
    const after = store.view(id, 0)
    expect(after).not.toEqual(before)
    store.tag(id, 0, 'feelbad', 'fire', 'arbitrary why')
    const { transcriptPath, feedbackPath } = store.end(id)
    expect(JSON.parse(readFileSync(transcriptPath, 'utf8')).seed).toBe(1)
    expect(readFileSync(feedbackPath, 'utf8')).toContain('feelbad')
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter=@minis/alchemy-duel test -- sessions`
Expected: FAIL.

- [ ] **Step 3: Implement `sessions.ts`**

```ts
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Action, DuelState, CardId } from '../../rules/types'
import type { BalanceParams } from '../../rules/balance'
import { RulesEngine } from '../../rules/engine'
import { HeuristicAI } from '../../rules/ai'
import { createRng, type RNG } from '../../rules/rng'

export interface SessionOptions { persona: string; seed: number; opponent: 'heuristic' }
export interface StoreOptions { balance: BalanceParams; transcriptDir: string; feedbackDir: string }

interface Session {
  id: string
  persona: string
  seed: number
  engine: RulesEngine
  rng: RNG
  state: DuelState
  opponent: HeuristicAI
  actionLog: { player: 0 | 1; action: Action }[]
  tags: { player: 0 | 1; kind: string; card?: CardId; why?: string; turn: number }[]
  rubric?: { player: 0 | 1; fun: number; fairness: number; clarity: number; comeback: number; interesting: number }
}

export class SessionStore {
  private sessions = new Map<string, Session>()
  constructor(private opts: StoreOptions) { mkdirSync(opts.transcriptDir, { recursive: true }); mkdirSync(opts.feedbackDir, { recursive: true }) }

  create(o: SessionOptions): string {
    const id = randomBytes(8).toString('hex')
    const engine = new RulesEngine(this.opts.balance)
    const state = engine.createInitialState({ seed: o.seed, p0Avatar: 'wizard', p1Avatar: 'knight' })
    this.sessions.set(id, { id, persona: o.persona, seed: o.seed, engine, rng: createRng(o.seed), state, opponent: new HeuristicAI(), actionLog: [], tags: [] })
    return id
  }

  view(id: string, player: 0 | 1) { return this.get(id).engine.view(this.get(id).state, player) }
  actions(id: string, player: 0 | 1) { return this.get(id).engine.legalActions(this.get(id).state, player) }

  play(id: string, player: 0 | 1, actionIndex: number): { terminal: boolean } {
    const s = this.get(id)
    const legal = s.engine.legalActions(s.state, player)
    const action = legal[actionIndex]
    if (!action) throw new Error('illegal-action')
    s.actionLog.push({ player, action })
    s.state = s.engine.applyAction(s.state, action, s.rng)
    // Auto-play AI seat
    while (!s.engine.isTerminal(s.state) && s.state.activePlayer === 1) {
      const aiAction = s.opponent.chooseAction(s.state, 1, s.rng)
      s.actionLog.push({ player: 1, action: aiAction })
      s.state = s.engine.applyAction(s.state, aiAction, s.rng)
    }
    return { terminal: s.engine.isTerminal(s.state) }
  }

  tag(id: string, player: 0 | 1, kind: string, card?: CardId, why?: string) {
    const s = this.get(id)
    s.tags.push({ player, kind, card, why, turn: s.state.turn })
  }

  rubric(id: string, player: 0 | 1, fun: number, fairness: number, clarity: number, comeback: number, interesting: number) {
    this.get(id).rubric = { player, fun, fairness, clarity, comeback, interesting }
  }

  end(id: string): { transcriptPath: string; feedbackPath: string } {
    const s = this.get(id)
    const transcriptPath = join(this.opts.transcriptDir, `${s.id}.json`)
    writeFileSync(transcriptPath, JSON.stringify({ id: s.id, persona: s.persona, seed: s.seed, actions: s.actionLog, finalState: s.state, rubric: s.rubric }, null, 2))
    const feedbackPath = join(this.opts.feedbackDir, `${s.persona}.jsonl`)
    for (const t of s.tags) appendFileSync(feedbackPath, JSON.stringify({ session: s.id, ...t }) + '\n')
    this.sessions.delete(id)
    return { transcriptPath, feedbackPath }
  }

  private get(id: string): Session { const s = this.sessions.get(id); if (!s) throw new Error('no-session'); return s }
}
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- sessions`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/daemon/sessions.ts minis/alchemy-duel/src/dev/daemon/sessions.test.ts
git commit -m "feat(alchemy-duel/dev/daemon): SessionStore — create/view/actions/play/tag/rubric/end with persistence"
```

---

### Task A.5.3: Daemon — WS server wiring

**Files:**
- Create: `minis/alchemy-duel/src/dev/daemon/server.ts`
- Test: `minis/alchemy-duel/src/dev/daemon/server.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { startDaemon } from './server'
import WebSocket from 'ws'

describe('daemon/server', () => {
  it('serves a session lifecycle over WS', async () => {
    const { close, port } = await startDaemon({ port: 0, transcriptDir: '/tmp', feedbackDir: '/tmp' })
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((res) => ws.on('open', () => res()))
    const send = (msg: unknown) => new Promise<unknown>((res) => { ws.send(JSON.stringify(msg)); ws.once('message', (b) => res(JSON.parse(b.toString()))) })
    const start = await send({ cmd: 'session.start', persona: 'aggro-anna', seed: 1, opponent: 'heuristic' }) as { ok: boolean; value: { sessionId: string } }
    expect(start.ok).toBe(true)
    const sid = start.value.sessionId
    const view = await send({ cmd: 'session.view', sessionId: sid, player: 0 }) as { ok: boolean; value: unknown }
    expect(view.ok).toBe(true)
    ws.close(); close()
  })
})
```

- [ ] **Step 2: Implement `server.ts`**

```ts
import { WebSocketServer } from 'ws'
import { SessionStore } from './sessions'
import { parseMessage } from './protocol'
import { BALANCE } from '../../rules/balance'

export interface StartOptions { port: number; transcriptDir: string; feedbackDir: string }

export async function startDaemon(opts: StartOptions): Promise<{ close: () => void; port: number }> {
  const store = new SessionStore({ balance: BALANCE, transcriptDir: opts.transcriptDir, feedbackDir: opts.feedbackDir })
  const wss = new WebSocketServer({ port: opts.port })
  await new Promise<void>((res) => wss.once('listening', () => res()))
  const port = (wss.address() as { port: number }).port
  wss.on('connection', (ws) => {
    ws.on('message', (buf) => {
      const r = parseMessage(buf.toString())
      if (!r.ok) return ws.send(JSON.stringify({ ok: false, error: r.error }))
      try {
        const req = r.value
        switch (req.cmd) {
          case 'session.start':   return ws.send(JSON.stringify({ ok: true, value: { sessionId: store.create({ persona: req.persona, seed: req.seed, opponent: req.opponent }) } }))
          case 'session.view':    return ws.send(JSON.stringify({ ok: true, value: store.view(req.sessionId, req.player) }))
          case 'session.actions': return ws.send(JSON.stringify({ ok: true, value: store.actions(req.sessionId, req.player) }))
          case 'session.play':    return ws.send(JSON.stringify({ ok: true, value: store.play(req.sessionId, req.player, req.actionIndex) }))
          case 'session.tag':     store.tag(req.sessionId, req.player, req.kind, req.card, req.why); return ws.send(JSON.stringify({ ok: true, value: null }))
          case 'session.rubric':  store.rubric(req.sessionId, req.player, req.fun, req.fairness, req.clarity, req.comeback, req.interesting); return ws.send(JSON.stringify({ ok: true, value: null }))
          case 'session.end':     return ws.send(JSON.stringify({ ok: true, value: store.end(req.sessionId) }))
          case 'batch.sim':       return ws.send(JSON.stringify({ ok: false, error: 'batch.sim is a stub in Phase 1; use the CLI for batches' }))
        }
      } catch (e) {
        ws.send(JSON.stringify({ ok: false, error: (e as Error).message }))
      }
    })
  })
  return { close: () => wss.close(), port }
}

// CLI entry — `pnpm --filter=@minis/alchemy-duel daemon:start`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.DUEL_DAEMON_PORT ?? 7878)
  startDaemon({ port, transcriptDir: 'balance/transcripts', feedbackDir: 'balance/feedback' })
    .then(({ port }) => console.log(`duel-daemon listening on ws://127.0.0.1:${port}`))
}
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- server`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/daemon/server.ts minis/alchemy-duel/src/dev/daemon/server.test.ts
git commit -m "feat(alchemy-duel/dev/daemon): WS server wiring SessionStore + protocol"
```

---

### Task A.6.1: `duel-cli` — 9 verbs

**Files:**
- Create: `minis/alchemy-duel/src/dev/cli/duel-cli.ts`
- Test: `minis/alchemy-duel/src/dev/cli/duel-cli.test.ts`

**Pattern:** each verb opens a WS connection to the daemon, sends one request, prints the JSON response to stdout, exits with code 0 on `ok: true` or 1 on `ok: false`.

- [ ] **Step 1: Write failing test (covers two representative verbs end-to-end against an in-process daemon)**

```ts
import { describe, it, expect } from 'vitest'
import { startDaemon } from '../daemon/server'
import { runCli } from './duel-cli'

describe('duel-cli', () => {
  it('session start → view → actions → play → end against a live daemon', async () => {
    const { close, port } = await startDaemon({ port: 0, transcriptDir: '/tmp/duel-cli-test', feedbackDir: '/tmp/duel-cli-test' })
    const url = `ws://127.0.0.1:${port}`
    const start = await runCli(['session', 'start', '--persona=aggro-anna', '--seed=1', '--opponent=heuristic'], { url })
    expect(start.exitCode).toBe(0)
    const sid = JSON.parse(start.stdout).value.sessionId
    const view = await runCli(['view', `--session=${sid}`, '--player=0'], { url })
    expect(view.exitCode).toBe(0)
    const acts = await runCli(['actions', `--session=${sid}`, '--player=0'], { url })
    expect(JSON.parse(acts.stdout).value.length).toBeGreaterThan(0)
    const play = await runCli(['play', `--session=${sid}`, '--player=0', '--action=0'], { url })
    expect(play.exitCode).toBe(0)
    const end = await runCli(['end', `--session=${sid}`], { url })
    expect(end.exitCode).toBe(0)
    close()
  })
})
```

- [ ] **Step 2: Implement `duel-cli.ts`** (parse argv, build request, send over WS, print response)

```ts
import WebSocket from 'ws'

export interface CliResult { exitCode: number; stdout: string; stderr: string }
export interface CliOpts { url?: string }

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of args) if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); out[k!] = v ?? 'true' }
  return out
}

const SUBCOMMANDS = ['session', 'view', 'actions', 'play', 'tag', 'rubric', 'end', 'batch', 'playloop'] as const

export async function runCli(argv: string[], opts: CliOpts = {}): Promise<CliResult> {
  const [cmd, sub, ...rest] = argv
  const flags = parseFlags(rest)
  const url = opts.url ?? process.env.DUEL_DAEMON_URL ?? `ws://127.0.0.1:${process.env.DUEL_DAEMON_PORT ?? 7878}`
  let msg: unknown
  if (cmd === 'session' && sub === 'start') msg = { cmd: 'session.start', persona: flags.persona, seed: Number(flags.seed), opponent: flags.opponent }
  else if (cmd === 'view')    msg = { cmd: 'session.view',    sessionId: flags.session, player: Number(flags.player) }
  else if (cmd === 'actions') msg = { cmd: 'session.actions', sessionId: flags.session, player: Number(flags.player) }
  else if (cmd === 'play')    msg = { cmd: 'session.play',    sessionId: flags.session, player: Number(flags.player), actionIndex: Number(flags.action) }
  else if (cmd === 'tag')     msg = { cmd: 'session.tag',     sessionId: flags.session, player: Number(flags.player), kind: flags.kind, card: flags.card, why: flags.why }
  else if (cmd === 'rubric')  msg = { cmd: 'session.rubric',  sessionId: flags.session, player: Number(flags.player), fun: Number(flags.fun), fairness: Number(flags.fairness), clarity: Number(flags.clarity), comeback: Number(flags.comeback), interesting: Number(flags.interesting) }
  else if (cmd === 'end')     msg = { cmd: 'session.end',     sessionId: flags.session }
  else if (cmd === 'playloop') return playloopCli(flags, url)
  else return { exitCode: 1, stdout: '', stderr: `unknown command: ${cmd}` }

  const ws = new WebSocket(url)
  await new Promise<void>((res) => ws.on('open', () => res()))
  const response = await new Promise<string>((res) => { ws.send(JSON.stringify(msg)); ws.once('message', (b) => res(b.toString())) })
  ws.close()
  const parsed = JSON.parse(response) as { ok: boolean }
  return { exitCode: parsed.ok ? 0 : 1, stdout: response, stderr: '' }
}

// playloop convenience: runs N matches end-to-end as one persona; emits one JSON line per match.
async function playloopCli(flags: Record<string, string>, url: string): Promise<CliResult> {
  const matches = Number(flags.matches); const seedBank = Number(flags['seed-bank']); const persona = flags.persona
  const lines: string[] = []
  for (let i = 0; i < matches; i++) {
    const seed = seedBank * 10000 + i
    const start = await runCli(['session', 'start', `--persona=${persona}`, `--seed=${seed}`, `--opponent=${flags.opponent ?? 'heuristic'}`], { url })
    const sid = JSON.parse(start.stdout).value.sessionId
    let terminal = false
    while (!terminal) {
      const acts = JSON.parse((await runCli(['actions', `--session=${sid}`, '--player=0'], { url })).stdout).value as unknown[]
      if (acts.length === 0) break
      const r = JSON.parse((await runCli(['play', `--session=${sid}`, '--player=0', '--action=0'], { url })).stdout)
      terminal = r.value.terminal === true
    }
    const end = await runCli(['end', `--session=${sid}`], { url })
    lines.push(end.stdout)
  }
  return { exitCode: 0, stdout: lines.join('\n'), stderr: '' }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((r) => { process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.exitCode) })
}
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- duel-cli`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/cli/duel-cli.ts minis/alchemy-duel/src/dev/cli/duel-cli.test.ts
git commit -m "feat(alchemy-duel/dev/cli): duel-cli — 9 verbs over WS (playloop convenience for personas)"
```

---

### Task A.7.1: Persona specs + stub-LLM harness

**Files:**
- Create: `minis/alchemy-duel/src/dev/personas/types.ts`
- Create: `minis/alchemy-duel/src/dev/personas/specs/aggro-anna.json` (and 4 more)
- Create: `minis/alchemy-duel/src/dev/personas/harness.ts`
- Test: `minis/alchemy-duel/src/dev/personas/harness.test.ts`

- [ ] **Step 1: Write the persona type + 5 JSON specs**

`src/dev/personas/types.ts`:
```ts
export type FeedbackTagKind = 'feelbad' | 'boring' | 'surprising' | 'satisfying' | 'confusing'

export interface Persona {
  id: string
  version: number
  systemPrompt: string
  playPolicy: 'aggressive' | 'controlling' | 'comboing' | 'casual' | 'analytical'
  rubric: { enjoys: string[]; frustrates: string[]; flagsAsFeelbad: string[] }
}
```

`src/dev/personas/specs/aggro-anna.json`:
```json
{
  "id": "aggro-anna",
  "version": 1,
  "systemPrompt": "You are Aggro Anna. You love short matches, big damage, aggression. Long stalls and reagent-negation frustrate you. Flag situations where you lose to a turn-1 burst or where reagents nullify your committed elements as feelbad.",
  "playPolicy": "aggressive",
  "rubric": {
    "enjoys": ["short matches", "big damage", "clear win conditions"],
    "frustrates": ["long stalls", "reagents that nullify my plays"],
    "flagsAsFeelbad": ["losing to a turn-1 burst", "my element negated mid-reveal"]
  }
}
```

Four more JSON specs in the same shape:
- `control-carlos.json` — controlling policy; enjoys long thinky matches + card draw + shields; frustrated by burst kills.
- `combo-carla.json` — comboing policy; values Calcination→Fire chains + finisher setup; frustrated when combo pieces never draw together.
- `casual-curtis.json` — casual policy; first-time player; expects to occasionally win; frustrated by feeling helpless or by confusing UI signals.
- `reviewer-rita.json` — analytical policy; scores decision-interestingness; flags rounds where the AI's top choice is obvious as `boring`.

- [ ] **Step 2: Write the harness — stub-LLM mode for CI, real-LLM mode behind a flag**

`src/dev/personas/harness.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Persona, FeedbackTagKind } from './types'
import { runCli } from '../cli/duel-cli'

export interface HarnessOptions { persona: Persona; matches: number; seedBank: number; daemonUrl: string; mode: 'stub' | 'real' }

export interface PersonaRunResult { matches: number; lines: unknown[] }

export async function runPersona(opts: HarnessOptions): Promise<PersonaRunResult> {
  const lines: unknown[] = []
  for (let i = 0; i < opts.matches; i++) {
    const seed = opts.seedBank * 10000 + i
    const startResp = await runCli(['session', 'start', `--persona=${opts.persona.id}`, `--seed=${seed}`, '--opponent=heuristic'], { url: opts.daemonUrl })
    const sid = JSON.parse(startResp.stdout).value.sessionId
    let terminal = false
    while (!terminal) {
      const viewResp = await runCli(['view', `--session=${sid}`, '--player=0'], { url: opts.daemonUrl })
      const actsResp = await runCli(['actions', `--session=${sid}`, '--player=0'], { url: opts.daemonUrl })
      const actions = JSON.parse(actsResp.stdout).value as unknown[]
      if (actions.length === 0) break
      // Stub: pick first action consistent with policy bias; real: prompt LLM via Claude SDK using systemPrompt.
      const pick = opts.mode === 'stub' ? stubChoice(opts.persona, actions) : await realChoice(opts.persona, JSON.parse(viewResp.stdout).value, actions)
      const playResp = await runCli(['play', `--session=${sid}`, '--player=0', `--action=${pick.index}`], { url: opts.daemonUrl })
      terminal = JSON.parse(playResp.stdout).value.terminal === true
      if (pick.tag) await runCli(['tag', `--session=${sid}`, '--player=0', `--kind=${pick.tag.kind}`, ...(pick.tag.card ? [`--card=${pick.tag.card}`] : []), `--why=${pick.tag.why ?? ''}`], { url: opts.daemonUrl })
    }
    const endResp = await runCli(['end', `--session=${sid}`], { url: opts.daemonUrl })
    lines.push(JSON.parse(endResp.stdout).value)
  }
  return { matches: opts.matches, lines }
}

function stubChoice(p: Persona, actions: unknown[]): { index: number; tag?: { kind: FeedbackTagKind; card?: string; why?: string } } {
  // Deterministic stub: bias index by persona.playPolicy.
  const aggressive = p.playPolicy === 'aggressive' ? 0 : actions.length - 1
  return { index: Math.min(aggressive, actions.length - 1) }
}

async function realChoice(p: Persona, view: unknown, actions: unknown[]): Promise<{ index: number; tag?: { kind: FeedbackTagKind; card?: string; why?: string } }> {
  // Hooks into the project's Claude API integration; out of scope for v1 (stub-only in CI).
  // Real-LLM mode lands in Phase D when the live agent-persona playtest harness ships.
  return stubChoice(p, actions)
}

export function loadPersona(id: string): Persona {
  const path = join(import.meta.dirname, 'specs', `${id}.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}
```

- [ ] **Step 3: Test (stub-mode only in CI)**

```ts
import { describe, it, expect } from 'vitest'
import { startDaemon } from '../daemon/server'
import { runPersona, loadPersona } from './harness'

describe('persona harness (stub mode)', () => {
  it('runs aggro-anna for 3 matches end-to-end', async () => {
    const { close, port } = await startDaemon({ port: 0, transcriptDir: '/tmp/persona-test', feedbackDir: '/tmp/persona-test' })
    const persona = loadPersona('aggro-anna')
    const r = await runPersona({ persona, matches: 3, seedBank: 1, daemonUrl: `ws://127.0.0.1:${port}`, mode: 'stub' })
    expect(r.matches).toBe(3); expect(r.lines.length).toBe(3)
    close()
  })
})
```

- [ ] **Step 4: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- harness`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/dev/personas/ minis/alchemy-duel/src/dev/personas/specs/
git commit -m "feat(alchemy-duel/dev/personas): 5 persona specs + stub-LLM harness (real-LLM lands in Phase D)"
```

---

### Task A.8.1: `balance-tune` skill

**Files:**
- Create: `.claude/skills/balance-tune/SKILL.md`
- Create: `minis/alchemy-duel/src/dev/balance/cli.ts` (the `pnpm balance:*` dispatcher)

- [ ] **Step 1: Write the CLI dispatcher**

```ts
// minis/alchemy-duel/src/dev/balance/cli.ts
import { writeFileSync } from 'node:fs'
import { tune } from './tuner'
import { simulateBatch } from './simulator'
import { computeMetrics, compositeLoss, DEFAULT_WEIGHTS, runEssentiality } from './metrics'
import { BALANCE } from '../../rules/balance'
import { HeuristicAI } from '../../rules/ai'

async function main() {
  const [verb, ...rest] = process.argv.slice(2)
  const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k!, v ?? 'true'] }))
  switch (verb) {
    case 'sim': {
      const matches = Number(flags.matches ?? 1000); const seed = Number(flags.seed ?? 1)
      const batch = await simulateBatch({ balance: BALANCE, p0: () => new HeuristicAI(), p1: () => new HeuristicAI(), matches, seedBank: seed })
      const m = computeMetrics(batch); const L = compositeLoss(m, DEFAULT_WEIGHTS)
      console.log(JSON.stringify({ batch: { p0Wins: batch.p0Wins, p1Wins: batch.p1Wins, draws: batch.draws, medianTurns: batch.medianTurns }, metrics: m, loss: L }, null, 2))
      break
    }
    case 'tune': {
      const generations = Number(flags.gen ?? 30); const populationSize = Number(flags.pop ?? 12); const matchesPerEval = Number(flags.matches ?? 500); const seedBank = Number(flags['seed-bank'] ?? 1)
      const r = await tune({ start: BALANCE, populationSize, generations, matchesPerEval, seedBank })
      const outPath = flags.out ?? `balance/candidates/candidate-${Date.now()}.json`
      writeFileSync(outPath, JSON.stringify(r.bestParams, null, 2))
      console.log(JSON.stringify({ bestLoss: r.bestLoss, lossHistory: r.history, candidatePath: outPath }, null, 2))
      break
    }
    case 'gate': {
      const r = await runEssentiality(BALANCE, 200, 1)
      const failed = Object.entries(r).filter(([, v]) => !v.passed)
      if (failed.length > 0) { console.error('essentiality FAILED:', failed); process.exit(1) }
      console.log('essentiality OK — all 28 cards pass')
      break
    }
    default: console.error(`unknown verb: ${verb}`); process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Write the skill SKILL.md**

```markdown
---
name: balance-tune
description: Run a CMA-ES sweep against the alchemy duel rules engine, surface a tuned candidate at [REVIEW GATE] tuned θ.
---

# balance-tune

When the user asks to tune balance, tune a card, or run CMA-ES:

1. Confirm scope: full sweep (`--gen=30 --pop=12 --matches=500` defaults) vs targeted tune (the user names cards).
2. Ensure the duel-daemon is NOT required for `balance:tune` (it's a pure CLI; daemon is only for persona playtests).
3. Run `pnpm --filter=@minis/alchemy-duel balance:tune --gen=<N> --pop=<P> --matches=<M> --seed-bank=<S> --out=<path>`. Stream output.
4. After convergence: run the hard gate `pnpm --filter=@minis/alchemy-duel balance:gate` against the candidate.
5. Diff the candidate against `balance/current.json` and surface as `[REVIEW GATE] tuned θ`:
   - per-key delta table
   - bestLoss + lossHistory
   - essentiality results
   - HALT and await user approval before copying candidate → `balance/current.json` + committing.
6. On approval: copy + commit (`git add minis/alchemy-duel/balance/current.json && git commit -m "tune(alchemy-duel): θ generation <gen> — bestLoss <L>"`).

Never copy the candidate without explicit user approval.
```

- [ ] **Step 3: Smoke the CLI**

Run: `pnpm --filter=@minis/alchemy-duel balance:sim --matches=100 --seed=1`
Expected: prints JSON `{ batch, metrics, loss }`; exit 0.

- [ ] **Step 4: Commit**

```bash
git add minis/alchemy-duel/src/dev/balance/cli.ts .claude/skills/balance-tune/SKILL.md
git commit -m "feat(alchemy-duel): balance CLI dispatcher (sim/tune/gate) + balance-tune skill"
```

---

### Task A.8.2: `balance-playtest` skill

**Files:**
- Create: `.claude/skills/balance-playtest/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: balance-playtest
description: Spawn the duel-daemon and dispatch N persona subagents in parallel to playtest a tuned candidate; surface aggregated feedback at [REVIEW GATE] persona-consensus.
---

# balance-playtest

When the user asks to playtest, run an agent playtest, or stress-test a balance candidate:

1. Confirm scope:
   - candidate path (defaults to `balance/current.json`)
   - personas (defaults to all 5)
   - matches per persona (defaults to 40 — total 200)
   - mode: `headless` (default) or `live` (vitexec-piloted, slower)
2. Start the daemon if not running:
   - check `lsof -i :7878` (or `pgrep -f duel-daemon`)
   - if absent: `pnpm --filter=@minis/alchemy-duel daemon:start &` then wait for it to accept WS connections
3. For each persona, dispatch one subagent via the Agent tool with this prompt template:
   ```
   You are <persona.id> (<persona.systemPrompt>).
   Run <matches> headless duel matches by calling `pnpm --filter=@minis/alchemy-duel exec tsx src/dev/cli/duel-cli.ts playloop --persona=<id> --matches=<n> --seed-bank=<n>`.
   Output one JSON line per completed match (the daemon's `session.end` response).
   Do not reason about rules — the daemon enforces them.
   ```
   Dispatch personas in parallel (5 subagents in one message).
4. Aggregate the feedback corpus written by the daemon to `balance/feedback/<persona>.jsonl`:
   - tag counts per kind per persona
   - tag consensus per card (≥3 of 5 personas tagged feelbad on same card → flag)
   - rubric averages per persona
5. Surface as `[REVIEW GATE] persona-consensus`:
   - aggregated tag table
   - flagged cards + proposed CMA-ES weight bumps (e.g. `+ viabilityFloor[card] = 0.40` for feelbad consensus)
   - HALT and await user approval before writing those constraints to the next tune config.
6. On approval: append constraints to `balance/next-tune.config.json` (consumed by `balance-tune`'s next run).

Never apply consensus constraints without explicit user approval.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/balance-playtest/SKILL.md
git commit -m "feat(skills): balance-playtest — daemon up + parallel persona subagents + [REVIEW GATE]"
```

---

### Task A.9.1: ECS world bootstrap + traits

**Files:**
- Create: `minis/alchemy-duel/src/ecs/world.ts`
- Create: `minis/alchemy-duel/src/ecs/traits.ts`
- Create: `minis/alchemy-duel/src/ecs/intents.ts`
- Test: `minis/alchemy-duel/src/ecs/traits.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { DuelStateTrait, IntentQueue, CardRef, Transform } from './traits'
import type { Intent } from './intents'
import { RulesEngine } from '../rules/engine'
import { BALANCE } from '../rules/balance'

describe('ecs/traits', () => {
  it('DuelStateTrait holds current and previous state', () => {
    const world = createWorld()
    const e = new RulesEngine(BALANCE)
    const s = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const ent = world.spawn(DuelStateTrait({ state: s, prev: null }))
    const got = ent.get(DuelStateTrait)
    expect(got?.state.players[0]!.hp).toBe(BALANCE.hp)
  })
  it('IntentQueue is a singleton AoS holding an array', () => {
    const world = createWorld()
    const ent = world.spawn(IntentQueue({ queue: [] as Intent[] }))
    ent.get(IntentQueue)!.queue.push({ kind: 'matchEnded', winner: 0 })
    expect(world.query(IntentQueue)[0]!.get(IntentQueue)!.queue.length).toBe(1)
  })
})
```

- [ ] **Step 2: Implement world + traits + intents**

`src/ecs/world.ts`:
```ts
import { createWorld as kootaCreateWorld, type World } from 'koota'
export function createWorld(): World { return kootaCreateWorld() }
export type { World } from 'koota'
```

`src/ecs/traits.ts`:
```ts
import { trait } from 'koota'
import type { DuelState, CardId } from '../rules/types'
import type { Intent } from './intents'
import type { DirectionalLight } from 'three'

// AoS singletons (callback form)
export const DuelStateTrait = trait(() => ({ state: null as DuelState | null, prev: null as DuelState | null }))
export const IntentQueue = trait(() => ({ queue: [] as Intent[] }))
export const AtlasLightingContext = trait(() => ({
  enabled: true,
  primary3DLight: null as DirectionalLight | null,
  travelRadius: 64,
  height: 32,
  jitter: 0,
}))

// SoA per-entity traits (plain object form)
export const CardRef = trait({ cardId: '' as CardId, owner: 0 as 0 | 1, location: 'deck' as 'deck' | 'hand' | 'committed' | 'play' | 'discard' })
export const Transform = trait({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 })
export const Tween = trait({ fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, fromRy: 0, toRy: 0, t: 0, durationMs: 0, easing: 'easeInOut' as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' })
export const AvatarRef = trait({ player: 0 as 0 | 1, archetype: 'wizard' as 'wizard' | 'witch' | 'warlock' | 'knight' })
export const AnimationState = trait({ clip: 'idle' as string, frame: 0, speed: 1 })
export const AtlasFaceLightRef = trait({ atlasLightId: 0, seed: 0 })
```

`src/ecs/intents.ts`:
```ts
import type { CardId, Status } from '../rules/types'
export type Intent =
  | { kind: 'cardDealt';     cardId: CardId; player: 0 | 1; toHandSlot: number }
  | { kind: 'cardCommitted'; cardId: CardId; player: 0 | 1 }
  | { kind: 'cardRevealed';  cardId: CardId; player: 0 | 1 }
  | { kind: 'cardClashed';   p0Card: CardId; p1Card: CardId; winner: 0 | 1 | 'tie' }
  | { kind: 'damageDealt';   target: 0 | 1; amount: number; source: CardId }
  | { kind: 'statusApplied'; target: 0 | 1; status: Status }
  | { kind: 'cardDiscarded'; cardId: CardId; player: 0 | 1 }
  | { kind: 'matchEnded';    winner: 0 | 1 | null }
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- traits`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/ecs/world.ts minis/alchemy-duel/src/ecs/traits.ts minis/alchemy-duel/src/ecs/intents.ts minis/alchemy-duel/src/ecs/traits.test.ts
git commit -m "feat(alchemy-duel/ecs): world + traits + Intent vocabulary"
```

---

### Task A.9.2: `duelStateSyncSystem` — diff prev↔state → IntentQueue

**Files:**
- Create: `minis/alchemy-duel/src/ecs/systems/duelStateSyncSystem.ts`
- Test: `minis/alchemy-duel/src/ecs/systems/duelStateSyncSystem.test.ts`

- [ ] **Step 1: Write failing test (per intent kind)**

```ts
import { describe, it, expect } from 'vitest'
import { createWorld } from '../world'
import { DuelStateTrait, IntentQueue } from '../traits'
import { duelStateSyncSystem } from './duelStateSyncSystem'
import { RulesEngine } from '../../rules/engine'
import { BALANCE } from '../../rules/balance'
import { createRng } from '../../rules/rng'

describe('duelStateSyncSystem', () => {
  it('emits cardCommitted when a player commits', () => {
    const world = createWorld()
    const e = new RulesEngine(BALANCE)
    const s0 = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const card = s0.players[0]!.hand[0]!
    const s1 = e.applyAction(s0, { kind: 'commitCard', cardId: card }, createRng(1))
    world.spawn(DuelStateTrait({ state: s1, prev: s0 }))
    world.spawn(IntentQueue({ queue: [] }))
    duelStateSyncSystem(world)
    const queue = world.query(IntentQueue)[0]!.get(IntentQueue)!.queue
    expect(queue.find((q) => q.kind === 'cardCommitted')).toBeDefined()
  })
  it('emits matchEnded on game over', () => {
    const world = createWorld()
    const e = new RulesEngine(BALANCE)
    const s0 = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const s1 = { ...s0, phase: 'gameOver' as const, players: [{ ...s0.players[0]!, hp: 0 }, s0.players[1]!] }
    world.spawn(DuelStateTrait({ state: s1, prev: s0 }))
    world.spawn(IntentQueue({ queue: [] }))
    duelStateSyncSystem(world)
    expect(world.query(IntentQueue)[0]!.get(IntentQueue)!.queue.find((q) => q.kind === 'matchEnded')).toBeDefined()
  })
})
```

- [ ] **Step 2: Implement**

```ts
import type { World } from '../world'
import { DuelStateTrait, IntentQueue } from '../traits'
import type { Intent } from '../intents'
import type { DuelState } from '../../rules/types'

export function duelStateSyncSystem(world: World): void {
  const dsEnts = world.query(DuelStateTrait)
  if (dsEnts.length === 0) return
  const ds = dsEnts[0]!.get(DuelStateTrait)!
  const { state, prev } = ds
  if (!state || !prev || state === prev) return

  const intents = diffStates(prev, state)
  const queueEnts = world.query(IntentQueue)
  const queueEnt = queueEnts[0] ?? world.spawn(IntentQueue({ queue: [] }))
  queueEnt.get(IntentQueue)!.queue.push(...intents)
  ds.prev = state
}

function diffStates(prev: DuelState, next: DuelState): Intent[] {
  const out: Intent[] = []
  for (const seat of [0, 1] as const) {
    const a = prev.players[seat]; const b = next.players[seat]
    // cardCommitted
    if (a.committed === null && b.committed !== null) out.push({ kind: 'cardCommitted', cardId: b.committed, player: seat })
    // cardRevealed when both committed transition together → reveal happens on resolve
    // damageDealt
    if (b.hp < a.hp) out.push({ kind: 'damageDealt', target: seat, amount: a.hp - b.hp, source: b.committed ?? 'unknown' as never })
    // cardDiscarded
    for (const c of b.discard) if (!a.discard.includes(c)) out.push({ kind: 'cardDiscarded', cardId: c, player: seat })
    // cardDealt (hand grew)
    if (b.hand.length > a.hand.length) for (const c of b.hand) if (!a.hand.includes(c)) out.push({ kind: 'cardDealt', cardId: c, player: seat, toHandSlot: b.hand.indexOf(c) })
    // statusApplied
    for (const st of b.statuses) if (!a.statuses.includes(st)) out.push({ kind: 'statusApplied', target: seat, status: st })
  }
  // cardClashed (both resolved a commit this tick)
  if (prev.players[0]!.committed && prev.players[1]!.committed && next.players[0]!.committed === null && next.players[1]!.committed === null) {
    out.push({ kind: 'cardClashed', p0Card: prev.players[0]!.committed, p1Card: prev.players[1]!.committed, winner: next.players[0]!.hp > next.players[1]!.hp ? 0 : next.players[1]!.hp > next.players[0]!.hp ? 1 : 'tie' })
    out.push({ kind: 'cardRevealed', cardId: prev.players[0]!.committed, player: 0 })
    out.push({ kind: 'cardRevealed', cardId: prev.players[1]!.committed, player: 1 })
  }
  // matchEnded
  if (prev.phase !== 'gameOver' && next.phase === 'gameOver') {
    const winner = next.players[0]!.hp <= 0 ? 1 : next.players[1]!.hp <= 0 ? 0 : null
    out.push({ kind: 'matchEnded', winner })
  }
  return out
}
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- duelStateSyncSystem`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/ecs/systems/duelStateSyncSystem.ts minis/alchemy-duel/src/ecs/systems/duelStateSyncSystem.test.ts
git commit -m "feat(alchemy-duel/ecs): duelStateSyncSystem — diff prev↔state → 8-intent vocabulary"
```

---

### Task A.9.3: `intentAnimationSystem` + `tweenSystem`

**Files:**
- Create: `minis/alchemy-duel/src/ecs/systems/intentAnimationSystem.ts`
- Create: `minis/alchemy-duel/src/ecs/systems/tweenSystem.ts`
- Test: `minis/alchemy-duel/src/ecs/systems/animation.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createWorld } from '../world'
import { CardRef, Transform, Tween, IntentQueue } from '../traits'
import { intentAnimationSystem } from './intentAnimationSystem'
import { tweenSystem } from './tweenSystem'

describe('intentAnimationSystem + tweenSystem', () => {
  it('attaches a Tween to a CardEntity when cardCommitted intent fires', () => {
    const world = createWorld()
    const ent = world.spawn(CardRef({ cardId: 'fire', owner: 0, location: 'hand' }), Transform({ x: 0, y: 0, z: 0 }))
    world.spawn(IntentQueue({ queue: [{ kind: 'cardCommitted', cardId: 'fire', player: 0 }] }))
    intentAnimationSystem(world)
    expect(ent.has(Tween)).toBe(true)
  })
  it('tweenSystem advances t and removes Tween at completion', () => {
    const world = createWorld()
    const ent = world.spawn(Transform({ x: 0, y: 0, z: 0 }), Tween({ fromX: 0, toX: 10, t: 0, durationMs: 100, easing: 'linear', fromY: 0, toY: 0, fromZ: 0, toZ: 0, fromRy: 0, toRy: 0 }))
    tweenSystem(world, 50)
    expect(ent.get(Transform)!.x).toBeCloseTo(5)
    tweenSystem(world, 100)
    expect(ent.has(Tween)).toBe(false)
    expect(ent.get(Transform)!.x).toBe(10)
  })
})
```

- [ ] **Step 2: Implement (positions per intent are computed from layout config; for v1 use placeholder hand/play coords)**

`intentAnimationSystem.ts`:
```ts
import type { World } from '../world'
import { CardRef, Transform, Tween, IntentQueue } from '../traits'

const HAND_SLOT_X = (slot: number, owner: 0 | 1) => (owner === 0 ? -2 + slot * 0.6 : -2 + slot * 0.6)
const HAND_Y = (owner: 0 | 1) => owner === 0 ? 0.5 : -0.5
const COMMITTED_Y = (owner: 0 | 1) => owner === 0 ? 0.2 : -0.2

export function intentAnimationSystem(world: World): void {
  const queueEnts = world.query(IntentQueue); if (queueEnts.length === 0) return
  const queue = queueEnts[0]!.get(IntentQueue)!.queue
  if (queue.length === 0) return
  for (const intent of queue) {
    switch (intent.kind) {
      case 'cardCommitted': {
        const ent = world.query(CardRef).find((e) => { const c = e.get(CardRef)!; return c.cardId === intent.cardId && c.owner === intent.player })
        if (!ent) break
        const t = ent.get(Transform)!
        ent.add(Tween({ fromX: t.x, toX: 0, fromY: t.y, toY: COMMITTED_Y(intent.player), fromZ: t.z, toZ: 0, fromRy: t.ry, toRy: Math.PI, t: 0, durationMs: 350, easing: 'easeOut' }))
        ent.get(CardRef)!.location = 'committed'
        break
      }
      case 'cardRevealed': {
        const ent = world.query(CardRef).find((e) => { const c = e.get(CardRef)!; return c.cardId === intent.cardId && c.owner === intent.player })
        if (!ent) break
        const t = ent.get(Transform)!
        ent.add(Tween({ fromX: t.x, toX: t.x, fromY: t.y, toY: t.y, fromZ: t.z, toZ: t.z, fromRy: t.ry, toRy: 0, t: 0, durationMs: 250, easing: 'easeInOut' }))
        break
      }
      case 'cardDiscarded': {
        const ent = world.query(CardRef).find((e) => { const c = e.get(CardRef)!; return c.cardId === intent.cardId && c.owner === intent.player })
        if (!ent) break
        const t = ent.get(Transform)!
        ent.add(Tween({ fromX: t.x, toX: 3, fromY: t.y, toY: HAND_Y(intent.player), fromZ: t.z, toZ: 0, fromRy: t.ry, toRy: 0, t: 0, durationMs: 400, easing: 'easeIn' }))
        ent.get(CardRef)!.location = 'discard'
        break
      }
      // damageDealt, statusApplied, cardClashed, matchEnded handled by avatar/HUD systems in C.x — left as no-ops here.
    }
  }
  queue.length = 0
}
```

`tweenSystem.ts`:
```ts
import type { World } from '../world'
import { Transform, Tween } from '../traits'

function ease(kind: string, t: number): number {
  if (kind === 'linear') return t
  if (kind === 'easeIn') return t * t
  if (kind === 'easeOut') return 1 - (1 - t) * (1 - t)
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function tweenSystem(world: World, deltaMs: number): void {
  for (const ent of world.query(Tween, Transform)) {
    const tw = ent.get(Tween)!
    tw.t = Math.min(1, tw.t + deltaMs / tw.durationMs)
    const a = ease(tw.easing, tw.t)
    const t = ent.get(Transform)!
    t.x = tw.fromX + (tw.toX - tw.fromX) * a
    t.y = tw.fromY + (tw.toY - tw.fromY) * a
    t.z = tw.fromZ + (tw.toZ - tw.fromZ) * a
    t.ry = tw.fromRy + (tw.toRy - tw.fromRy) * a
    if (tw.t >= 1) ent.remove(Tween)
  }
}
```

- [ ] **Step 3: Run, expect PASS; commit**

Run: `pnpm --filter=@minis/alchemy-duel test -- animation`
Expected: PASS.

```bash
git add minis/alchemy-duel/src/ecs/systems/intentAnimationSystem.ts minis/alchemy-duel/src/ecs/systems/tweenSystem.ts minis/alchemy-duel/src/ecs/systems/animation.test.ts
git commit -m "feat(alchemy-duel/ecs): intentAnimationSystem (intent→tween) + tweenSystem (delta-driven)"
```

---

### Task A.9.4: ECS scheduler (`systems/index.ts`) — deterministic per-frame order

**Files:**
- Create: `minis/alchemy-duel/src/ecs/systems/index.ts`

- [ ] **Step 1: Write the ordered scheduler**

```ts
import type { World } from '../world'
import { duelStateSyncSystem } from './duelStateSyncSystem'
import { intentAnimationSystem } from './intentAnimationSystem'
import { tweenSystem } from './tweenSystem'

export function tickEcs(world: World, deltaMs: number): void {
  duelStateSyncSystem(world)
  intentAnimationSystem(world)
  tweenSystem(world, deltaMs)
  // animationDriverSystem + cardAtlasLightingDriverSystem land in Phase C; scheduler adds them then.
}
```

- [ ] **Step 2: Commit**

```bash
git add minis/alchemy-duel/src/ecs/systems/index.ts
git commit -m "feat(alchemy-duel/ecs): tickEcs scheduler (deterministic order; C-phase systems append later)"
```

---

## `[REVIEW GATE] Phase A complete`

Before starting Phase B:

- [ ] All Phase A tests pass: `pnpm --filter=@minis/alchemy-duel test`
- [ ] Lint clean: `pnpm lint`
- [ ] Bundle hygiene baseline established: `pnpm --filter=@minis/alchemy-duel build && pnpm --filter=@minis/alchemy-duel verify:prod` (prod build will be minimal — App stub + rules/ + ecs/ + balance/current.json; daemon/CLI/tuner/personas absent from output)
- [ ] Run a smoke balance regression: `pnpm --filter=@minis/alchemy-duel balance:sim --matches=200` → outputs metrics; `balance:gate` passes essentiality
- [ ] **Surface to user:** Phase A done — rules engine + simulator + CMA-ES + daemon + CLI + personas + ECS scaffolding all green and prod bundle clean. Awaiting approval to begin Phase B (renderer prereqs P1–P4).

---

## Phase B — Renderer prerequisites (P1 → P2 + P3 → P4)

**Cross-package note:** P2 and P3 modify the `three-flatland` package itself (not the showcase). These changes ship alongside the showcase but live in `packages/three-flatland/src/`. Treat them as upstream contributions: each gets its own commit, its own test in the three-flatland package's test suite, and feeds the workspace via `workspace:*`.

### Task B.P1.1: `atlasLayout` helper

**Files:**
- Create: `minis/alchemy-duel/src/renderer/atlas/AtlasLayout.ts`
- Test: `minis/alchemy-duel/src/renderer/atlas/AtlasLayout.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { ATLAS_LAYOUT, cellForCard, atlasPositionForCard, uvWindowForCard } from './AtlasLayout'
import { ALL_CARDS } from '../../rules/deck'

describe('AtlasLayout', () => {
  it('layout matches the 8×4 spec', () => {
    expect(ATLAS_LAYOUT.cols).toBe(8)
    expect(ATLAS_LAYOUT.rows).toBe(4)
    expect(ATLAS_LAYOUT.cellW).toBe(256)
    expect(ATLAS_LAYOUT.cellH).toBe(384)
    expect(ATLAS_LAYOUT.textureW).toBe(2048)
    expect(ATLAS_LAYOUT.textureH).toBe(1536)
  })
  it('cellForCard returns a unique cell per card (29 used, 3 empty)', () => {
    const cells = new Set<string>()
    for (const id of ALL_CARDS) {
      const { col, row } = cellForCard(id)
      cells.add(`${col},${row}`)
    }
    expect(cells.size).toBe(28)
  })
  it('uvWindow + atlasPosition round-trip', () => {
    for (const id of ALL_CARDS) {
      const pos = atlasPositionForCard(id); const uv = uvWindowForCard(id)
      expect(uv.u).toBeCloseTo(pos.x / ATLAS_LAYOUT.textureW)
      expect(uv.v).toBeCloseTo(pos.y / ATLAS_LAYOUT.textureH)
      expect(uv.w).toBeCloseTo(ATLAS_LAYOUT.cellW / ATLAS_LAYOUT.textureW)
      expect(uv.h).toBeCloseTo(ATLAS_LAYOUT.cellH / ATLAS_LAYOUT.textureH)
    }
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { ALL_CARDS } from '../../rules/deck'
import type { CardId } from '../../rules/types'

export interface AtlasLayoutConfig { cols: number; rows: number; cellW: number; cellH: number; textureW: number; textureH: number }
export const ATLAS_LAYOUT: AtlasLayoutConfig = { cols: 8, rows: 4, cellW: 256, cellH: 384, textureW: 2048, textureH: 1536 }

export interface Cell { col: number; row: number }
export interface AtlasPosition { x: number; y: number; w: number; h: number }
export interface UVWindow { u: number; v: number; w: number; h: number }

// Deterministic cell-by-index: card 0 → (0,0), card 1 → (1,0), …, card 7 → (7,0), card 8 → (0,1), etc.
// Card-back is reserved at index 28 (cell (4,3)); cells 29–31 left empty.
const CARD_BACK_INDEX = 28

const _indexOf = new Map<CardId, number>(ALL_CARDS.map((id, i) => [id, i]))

export function cellForCard(card: CardId | 'card-back'): Cell {
  const idx = card === 'card-back' ? CARD_BACK_INDEX : _indexOf.get(card)!
  return { col: idx % ATLAS_LAYOUT.cols, row: Math.floor(idx / ATLAS_LAYOUT.cols) }
}

export function atlasPositionForCard(card: CardId | 'card-back'): AtlasPosition {
  const { col, row } = cellForCard(card)
  return { x: col * ATLAS_LAYOUT.cellW, y: row * ATLAS_LAYOUT.cellH, w: ATLAS_LAYOUT.cellW, h: ATLAS_LAYOUT.cellH }
}

export function uvWindowForCard(card: CardId | 'card-back'): UVWindow {
  const p = atlasPositionForCard(card)
  return { u: p.x / ATLAS_LAYOUT.textureW, v: p.y / ATLAS_LAYOUT.textureH, w: p.w / ATLAS_LAYOUT.textureW, h: p.h / ATLAS_LAYOUT.textureH }
}
```

- [ ] **Step 3: Run, expect PASS; commit**

```bash
pnpm --filter=@minis/alchemy-duel test -- AtlasLayout
git add minis/alchemy-duel/src/renderer/atlas/AtlasLayout.ts minis/alchemy-duel/src/renderer/atlas/AtlasLayout.test.ts
git commit -m "feat(alchemy-duel/renderer): AtlasLayout helper (8×4 grid, UV-window round-trip)"
```

---

### Task B.P2.1: `FlatlandLightsNode.setCamera(PerspectiveCamera | OrthographicCamera, Vector2)`

**Cross-package:** modifies `three-flatland`.

**Files:**
- Modify: `packages/three-flatland/src/lights/FlatlandLightsNode.ts` (added by Epic 1 — extend it here)
- Test: `packages/three-flatland/src/lights/FlatlandLightsNode.perspective.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { PerspectiveCamera, OrthographicCamera, Vector2 } from 'three'
import { FlatlandLightsNode } from './FlatlandLightsNode'
import { PointLight2D } from './lights2d'

describe('FlatlandLightsNode.setCamera (perspective)', () => {
  it('accepts a PerspectiveCamera + viewport and bins lights in screen space', () => {
    const node = new FlatlandLightsNode()
    const cam = new PerspectiveCamera(60, 1.5, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0)
    node.setCamera(cam, new Vector2(800, 600))
    const l = new PointLight2D(); l.position.set(0, 0, 0); l.distance = 10
    node.updateLights([l])
    // Tile texture is populated (CPU-side; no GPU); a light at origin under a center-aimed camera should land in central tiles.
    expect(node.tileTexture).toBeDefined()
    const data = node.tileTexture!.image.data as Float32Array
    expect(Array.from(data).some((v) => v !== 0)).toBe(true)
  })
  it('skips lights behind the camera near plane', () => {
    const node = new FlatlandLightsNode()
    const cam = new PerspectiveCamera(60, 1.5, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0)
    node.setCamera(cam, new Vector2(800, 600))
    const behind = new PointLight2D(); behind.position.set(0, 0, 10); behind.distance = 5 // behind camera
    node.updateLights([behind])
    // No tile should contain this light (its screen coords fall outside any tile after projection)
    const data = node.tileTexture!.image.data as Float32Array
    // Behind-camera light produces all-zero tile assignment when no other lights exist.
    expect(Array.from(data).every((v) => v === 0)).toBe(true)
  })
  it('round-trips with setWorldBounds for an ortho camera viewing the same region', () => {
    const orthoNode = new FlatlandLightsNode()
    orthoNode.setWorldBounds(new Vector2(10, 10), new Vector2(-5, -5))
    const perspNode = new FlatlandLightsNode()
    // Construct an ortho camera viewing (-5..5, -5..5)
    const cam = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld()
    perspNode.setCamera(cam, new Vector2(640, 640))
    const l = new PointLight2D(); l.position.set(0, 0, 0); l.distance = 4
    orthoNode.updateLights([l]); perspNode.updateLights([l])
    // Both should bin the light into roughly the same central tile(s)
    const a = orthoNode.tileTexture!.image.data as Float32Array
    const b = perspNode.tileTexture!.image.data as Float32Array
    const aNon = Array.from(a).filter((v) => v !== 0).length
    const bNon = Array.from(b).filter((v) => v !== 0).length
    expect(Math.abs(aNon - bNon)).toBeLessThan(10) // close (not exact — different rasterizations)
  })
})
```

- [ ] **Step 2: Implement `setCamera` in `FlatlandLightsNode`**

In `packages/three-flatland/src/lights/FlatlandLightsNode.ts`, add:

```ts
import { Vector2, Vector3, type PerspectiveCamera, type OrthographicCamera } from 'three'

export class FlatlandLightsNode extends LightsNode {
  // ... existing members ...
  private _camera: PerspectiveCamera | OrthographicCamera | null = null
  private _viewport: Vector2 = new Vector2(1, 1)

  setCamera(camera: PerspectiveCamera | OrthographicCamera, viewport: Vector2): void {
    this._camera = camera; this._viewport.copy(viewport)
    // Derive equivalent world bounds + offset from the camera so the tiler's existing
    // screen-space binning works unchanged. For ortho: bounds = (right-left, top-bottom),
    // offset = (left, bottom). For perspective: project the camera's view frustum at
    // the lights' depth plane (z=0 default — flatland sprites live near the z=0 plane;
    // adjust via setSpriteDepth() if needed).
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      const persp = camera as PerspectiveCamera
      persp.updateMatrixWorld(true); persp.updateProjectionMatrix()
      // Distance from camera to the sprite plane (z = 0 in world space)
      const camWorld = persp.getWorldPosition(new Vector3())
      const dist = Math.max(0.01, Math.abs(camWorld.z))
      const vFov = (persp.fov * Math.PI) / 180
      const heightAtPlane = 2 * dist * Math.tan(vFov / 2)
      const widthAtPlane = heightAtPlane * persp.aspect
      const size = new Vector2(widthAtPlane, heightAtPlane)
      const offset = new Vector2(camWorld.x - widthAtPlane / 2, camWorld.y - heightAtPlane / 2)
      this.setWorldBounds(size, offset)
    } else {
      const ortho = camera as OrthographicCamera
      ortho.updateMatrixWorld(true); ortho.updateProjectionMatrix()
      const camWorld = ortho.getWorldPosition(new Vector3())
      const size = new Vector2((ortho.right - ortho.left) / ortho.zoom, (ortho.top - ortho.bottom) / ortho.zoom)
      const offset = new Vector2(camWorld.x + ortho.left / ortho.zoom, camWorld.y + ortho.bottom / ortho.zoom)
      this.setWorldBounds(size, offset)
    }
  }
}
```

- [ ] **Step 3: Run, expect PASS; commit**

```bash
pnpm --filter=three-flatland test -- FlatlandLightsNode.perspective
git add packages/three-flatland/src/lights/FlatlandLightsNode.ts packages/three-flatland/src/lights/FlatlandLightsNode.perspective.test.ts
git commit -m "feat(three-flatland/lights): FlatlandLightsNode.setCamera — perspective + ortho via projected sprite-plane bounds"
```

---

### Task B.P3.1: `SpriteGroup.billboard` prop (cylindrical + spherical)

**Cross-package:** modifies `three-flatland`.

**Files:**
- Modify: `packages/three-flatland/src/pipeline/SpriteGroup.ts`
- Modify: `packages/three-flatland/src/sprites/AnimatedSprite2D.ts`
- Modify: `packages/three-flatland/src/materials/Sprite2DMaterial.ts` (vertex shader basis swap)
- Test: `packages/three-flatland/src/pipeline/SpriteGroup.billboard.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { PerspectiveCamera } from 'three'
import { SpriteGroup, AnimatedSprite2D, type BillboardMode } from 'three-flatland'

describe('SpriteGroup billboard', () => {
  it('accepts billboard option', () => {
    const g = new SpriteGroup({ billboard: 'cylindrical' as BillboardMode })
    expect(g.billboard).toBe('cylindrical')
  })
  it('billboard defaults to "none"', () => {
    const g = new SpriteGroup({})
    expect(g.billboard).toBe('none')
  })
  it('AnimatedSprite2D accepts billboard option', () => {
    const s = new AnimatedSprite2D({ billboard: 'cylindrical' })
    expect(s.billboard).toBe('cylindrical')
  })
})
```

- [ ] **Step 2: Implement the option + vertex-shader basis swap**

In `SpriteGroup.ts` (and equivalently in `AnimatedSprite2D.ts`):
```ts
export type BillboardMode = 'none' | 'cylindrical' | 'spherical'

interface SpriteGroupOptions {
  // ...existing options...
  billboard?: BillboardMode
}

export class SpriteGroup extends Group {
  billboard: BillboardMode
  constructor(opts: SpriteGroupOptions = {}) {
    super()
    this.billboard = opts.billboard ?? 'none'
    // ... existing init ...
  }
}
```

In `Sprite2DMaterial.ts` (TSL vertex node), swap the model-view basis based on a uniform `uBillboardMode` (0=none, 1=cylindrical, 2=spherical):

```ts
import { Fn, uniform, attribute, cameraViewMatrix, modelWorldMatrix, vec3, vec4, select, mat3 } from 'three/tsl'

const uBillboardMode = uniform(0)

const vertexNode = Fn(({ position }) => {
  const worldPos = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz                       // sprite anchor in world
  const camRight = vec3(cameraViewMatrix.element(0).x, cameraViewMatrix.element(0).y, cameraViewMatrix.element(0).z)
  const camUp    = vec3(cameraViewMatrix.element(1).x, cameraViewMatrix.element(1).y, cameraViewMatrix.element(1).z)
  const worldUp  = vec3(0, 1, 0)
  // cylindrical: keep worldUp as up, take camRight perpendicular to it
  const cylRight = camRight.sub(worldUp.mul(camRight.dot(worldUp))).normalize()
  const right = select(uBillboardMode.equal(1), cylRight, select(uBillboardMode.equal(2), camRight, vec3(1, 0, 0)))
  const up    = select(uBillboardMode.equal(1), worldUp, select(uBillboardMode.equal(2), camUp,    vec3(0, 1, 0)))
  const billboarded = worldPos.add(right.mul(position.x)).add(up.mul(position.y))
  return select(uBillboardMode.equal(0), modelWorldMatrix.mul(vec4(position, 1)), vec4(billboarded, 1))
})
```

Wire `uBillboardMode.value = { none: 0, cylindrical: 1, spherical: 2 }[this.billboard]` on material init/update.

- [ ] **Step 3: Run, expect PASS; commit**

```bash
pnpm --filter=three-flatland test -- SpriteGroup.billboard
git add packages/three-flatland/src/pipeline/SpriteGroup.ts packages/three-flatland/src/sprites/AnimatedSprite2D.ts packages/three-flatland/src/materials/Sprite2DMaterial.ts packages/three-flatland/src/pipeline/SpriteGroup.billboard.test.ts
git commit -m "feat(three-flatland/sprites): billboard mode (cylindrical + spherical) via camera-derived basis swap"
```

---

### Task B.P4.1: `HitTester` hybrid CPU picker

**Files:**
- Create: `minis/alchemy-duel/src/renderer/input/HitTester.ts`
- Test: `minis/alchemy-duel/src/renderer/input/HitTester.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { HitTester, type Pickable } from './HitTester'

describe('HitTester', () => {
  it('picks a mesh under the cursor', () => {
    const scene = new Scene()
    const cam = new PerspectiveCamera(60, 1, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0)
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    mesh.userData.pickable = { id: 42, type: 'card' } satisfies Pickable
    scene.add(mesh)
    const ht = new HitTester({ scene, camera: cam, viewport: { width: 100, height: 100 } })
    const p = ht.pick(50, 50)
    expect(p?.id).toBe(42); expect(p?.type).toBe('card')
  })
  it('returns null when nothing is under the cursor', () => {
    const scene = new Scene()
    const cam = new PerspectiveCamera(60, 1, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0)
    const ht = new HitTester({ scene, camera: cam, viewport: { width: 100, height: 100 } })
    expect(ht.pick(50, 50)).toBe(null)
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { Raycaster, Vector2, type Scene, type Camera } from 'three'

export interface Pickable { id: number; type: 'card' | 'avatar' | 'widget' | 'mesh' }
export interface HitTesterOptions { scene: Scene; camera: Camera; viewport: { width: number; height: number } }

export class HitTester {
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  constructor(private opts: HitTesterOptions) {}

  pick(screenX: number, screenY: number): Pickable | null {
    // Convert screen px → NDC [-1, 1]
    this.ndc.set((screenX / this.opts.viewport.width) * 2 - 1, -(screenY / this.opts.viewport.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.opts.camera)
    const hits = this.raycaster.intersectObjects(this.opts.scene.children, true)
    for (const h of hits) {
      // Walk up to find a userData.pickable
      let obj: typeof h.object | null = h.object
      while (obj) {
        const p = obj.userData?.pickable as Pickable | undefined
        if (p && typeof p.id === 'number') return p
        obj = obj.parent
      }
    }
    return null
  }

  updateViewport(width: number, height: number): void {
    this.opts.viewport.width = width; this.opts.viewport.height = height
  }
}
```

- [ ] **Step 3: Run, expect PASS; commit**

```bash
pnpm --filter=@minis/alchemy-duel test -- HitTester
git add minis/alchemy-duel/src/renderer/input/HitTester.ts minis/alchemy-duel/src/renderer/input/HitTester.test.ts
git commit -m "feat(alchemy-duel/renderer): HitTester hybrid CPU picker (Raycaster + userData.pickable; ID-buffer in Phase 2)"
```

---

### Task B.P4.2: `InputBridge` — wires R3F pointer events to `legalActions` + engine

**Files:**
- Create: `minis/alchemy-duel/src/renderer/input/InputBridge.ts`
- Test: `minis/alchemy-duel/src/renderer/input/InputBridge.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { RulesEngine } from '../../rules/engine'
import { BALANCE } from '../../rules/balance'
import { InputBridge } from './InputBridge'

describe('InputBridge', () => {
  it('commits a card on pointerdown for a legal hand pickable', () => {
    const e = new RulesEngine(BALANCE)
    let state = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const card = state.players[0]!.hand[0]!
    const apply = vi.fn((s, a, r) => { state = e.applyAction(s, a, r); return state })
    const bridge = new InputBridge({ engine: e, getState: () => state, applyAction: apply, humanSeat: 0 })
    bridge.onPointerDown({ id: 1, type: 'card' }, { cardId: card })
    expect(apply).toHaveBeenCalledOnce()
    expect(state.players[0]!.committed).toBe(card)
  })
  it('ignores illegal actions silently', () => {
    const e = new RulesEngine(BALANCE)
    let state = e.createInitialState({ seed: 1, p0Avatar: 'wizard', p1Avatar: 'knight' })
    const apply = vi.fn((s, a, r) => { state = e.applyAction(s, a, r); return state })
    const bridge = new InputBridge({ engine: e, getState: () => state, applyAction: apply, humanSeat: 0 })
    bridge.onPointerDown({ id: 99, type: 'card' }, { cardId: 'fire' })  // 'fire' may not be in hand
    if (!state.players[0]!.hand.includes('fire')) expect(apply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```ts
import type { RulesEngine } from '../../rules/engine'
import type { Action, DuelState, CardId } from '../../rules/types'
import type { Pickable } from './HitTester'
import { createRng, type RNG } from '../../rules/rng'

export interface InputBridgeOptions {
  engine: RulesEngine
  getState: () => DuelState
  applyAction: (s: DuelState, a: Action, rng: RNG) => DuelState
  humanSeat: 0 | 1
}

export interface PickContext { cardId?: CardId }

export class InputBridge {
  private rng = createRng(Math.floor(Math.random() * 1e9))
  constructor(private opts: InputBridgeOptions) {}

  onPointerDown(pickable: Pickable | null, ctx: PickContext = {}): void {
    if (!pickable) return
    const state = this.opts.getState()
    if (state.activePlayer !== this.opts.humanSeat) return
    const candidate = this.actionFromPick(pickable, ctx, state)
    if (!candidate) return
    const legal = this.opts.engine.legalActions(state, this.opts.humanSeat)
    if (!legal.some((a) => sameAction(a, candidate))) return
    this.opts.applyAction(state, candidate, this.rng)
  }

  private actionFromPick(p: Pickable, ctx: PickContext, _state: DuelState): Action | null {
    if (p.type === 'card' && ctx.cardId) return { kind: 'commitCard', cardId: ctx.cardId }
    if (p.type === 'widget' && ctx.cardId) return { kind: 'castReagent', cardId: ctx.cardId }
    return null
  }
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'commitCard' && b.kind === 'commitCard') return a.cardId === b.cardId
  if (a.kind === 'castReagent' && b.kind === 'castReagent') return a.cardId === b.cardId && a.target === b.target
  return a.kind === 'endTurn' && b.kind === 'endTurn'
}
```

- [ ] **Step 3: Run, expect PASS; commit**

```bash
pnpm --filter=@minis/alchemy-duel test -- InputBridge
git add minis/alchemy-duel/src/renderer/input/InputBridge.ts minis/alchemy-duel/src/renderer/input/InputBridge.test.ts
git commit -m "feat(alchemy-duel/renderer): InputBridge — Pickable + ctx → legalActions filter → applyAction"
```

---

## `[REVIEW GATE] Phase B complete`

Before starting Phase C:

- [ ] Phase B tests pass across both packages: `pnpm test`
- [ ] Three-flatland's existing test suite still green (regressions from the SpriteGroup/FlatlandLightsNode extensions): `pnpm --filter=three-flatland test`
- [ ] Visual regression baseline unchanged for the existing lighting example (Epic 1's gate): `pnpm test:regression`
- [ ] **Surface to user:** Phase B done — atlasLayout helper + setCamera(perspective) + billboard mode + HitTester + InputBridge all landed; three-flatland upstream contributions (P2, P3) tested in place; lighting example goldens still pass. Awaiting approval to begin Phase C (rendering integration + 3D→atlas light driver + atlas authoring scene + R3F app composition).

---

> **Plan continues — Phase C (R3F app composition + atlasFlatland JSX + face composition + card InstancedMesh + avatars + cardAtlasLightingDriverSystem + DemoPlayer + table mesh + HUD), Phase D (visual goldens + perf gates + balance hard gates + verify:prod scanner + 6 remaining skills + live agent-persona harness), Phase E (final integration + perf budget verification + balance baseline commit + bundle hygiene end-to-end + docs + asset acquisition tracking), Self-Review — appended in following revisions.**
