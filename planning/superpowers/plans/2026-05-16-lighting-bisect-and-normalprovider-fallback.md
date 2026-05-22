# Lighting Bisection + NormalProvider Fallback Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move four unfinished lighting presets (Radiance/Direct/Simple/RadianceCascades) to a follow-up PR, clean dangling `AutoNormalProvider` references, and harden the normals runtime-bake fallback (lazy-import the baker, add a `disableRuntimeBake` flag, extend `NormalMapLoader.load()` to optionally accept a descriptor).

**Architecture:** Two phases. **Phase A** is a deletion + reference-cleanup pass — no new logic, mostly grep-and-edit. **Phase B** does NOT introduce a new fallback (one already exists in `resolveNormalMap()` and the high-level loaders) — it lazy-imports the baker for bundle hygiene, adds an opt-out flag, and gives `NormalMapLoader.load()` a descriptor-aware route into the existing fallback path.

**Discovery note:** Before this plan, the team's mental model was *"NormalMapProvider has no fallback."* That's only true at the **provider** level — the **resolver** (`@three-flatland/normals/resolveNormalMap`) already does try-baked-hash-check → `devtimeWarn` → in-memory bake. SpriteSheetLoader (when `{ normals: true }`) and LDtkLoader (when `normals !== false`) both route through it. The four NormalMapProvider sites in `examples/three/lighting/main.ts` get the fallback for free. The gap is the **URL-only** entry point (`NormalMapLoader.load(url)`) and bundle weight.

**Tech Stack:** TypeScript 5.x, three.js, tsup, vitest, dynamic `import()` for baker.

---

## Phase A — Lighting Bisection + Cleanup

### Task A1: Save extraction tag for the follow-up PR

The four moved files (Radiance/Direct/Simple + RadianceCascades) need to land in a separate PR later. Tag the current HEAD so we can extract them cleanly.

- [ ] **Step 1: Tag current state**

```bash
git tag pre-lighting-bisect HEAD
```

- [ ] **Step 2: Note the tag in this plan**

The follow-up PR will start with: `git checkout -b radiance-followup pre-lighting-bisect && git rm $(git ls-files | grep -vE 'RadianceCascades|RadianceLightEffect|DirectLightEffect|SimpleLightEffect|Radiance-Accumulation|SDF-Tiled-Forward-Plus')` (sketch — actual extraction is out of scope for this plan).

---

### Task A2: Delete moved preset files

**Files:**
- Delete: `packages/three-flatland/src/lights/RadianceCascades.ts`
- Delete: `packages/presets/src/lighting/RadianceLightEffect.ts`
- Delete: `packages/presets/src/lighting/DirectLightEffect.ts`
- Delete: `packages/presets/src/lighting/SimpleLightEffect.ts`
- Delete: `planning/experiments/Radiance-Accumulation.md`
- Delete: `planning/experiments/SDF-Tiled-Forward-Plus.md`

- [ ] **Step 1: Verify no test files exist for these (none should)**

```bash
git ls-files | grep -E 'RadianceCascades|RadianceLightEffect|DirectLightEffect|SimpleLightEffect'
```
Expected: only the 4 source files listed (no `*.test.ts`).

- [ ] **Step 2: Delete the files**

```bash
git rm \
  packages/three-flatland/src/lights/RadianceCascades.ts \
  packages/presets/src/lighting/RadianceLightEffect.ts \
  packages/presets/src/lighting/DirectLightEffect.ts \
  packages/presets/src/lighting/SimpleLightEffect.ts \
  planning/experiments/Radiance-Accumulation.md \
  planning/experiments/SDF-Tiled-Forward-Plus.md
```

---

### Task A3: Trim barrel exports

**Files:**
- Modify: `packages/presets/src/lighting/index.ts`
- Modify: `packages/three-flatland/src/lights/index.ts`

- [ ] **Step 1: Edit `packages/presets/src/lighting/index.ts`**

Replace current contents:
```ts
export { DefaultLightEffect } from './DefaultLightEffect'
export { DirectLightEffect } from './DirectLightEffect'
export { SimpleLightEffect } from './SimpleLightEffect'
export { RadianceLightEffect } from './RadianceLightEffect'
export { NormalMapProvider } from './NormalMapProvider'
```
With:
```ts
export { DefaultLightEffect } from './DefaultLightEffect'
export { NormalMapProvider } from './NormalMapProvider'
```

- [ ] **Step 2: Edit `packages/three-flatland/src/lights/index.ts` — remove the RadianceCascades export**

Find and delete the two lines:
```ts
export { RadianceCascades } from './RadianceCascades'
export type { RadianceCascadesOptions } from './RadianceCascades'
```
(Or whatever the exact export name + type form is — verify with `grep -n RadianceCascades packages/three-flatland/src/lights/index.ts` first.)

- [ ] **Step 3: Verify barrel is consistent**

```bash
grep -n "RadianceCascades\|RadianceLightEffect\|DirectLightEffect\|SimpleLightEffect" \
  packages/presets/src/lighting/index.ts \
  packages/three-flatland/src/lights/index.ts
```
Expected: no matches.

---

### Task A4: Drop ThreeElements augmentations for moved presets

**File:**
- Modify: `packages/presets/src/react/types.ts`

- [ ] **Step 1: Edit `packages/presets/src/react/types.ts`**

Replace current contents:
```ts
import type { LightEffectElement, EffectElement } from 'three-flatland/react'
import type { DefaultLightEffect } from '../lighting/DefaultLightEffect'
import type { DirectLightEffect } from '../lighting/DirectLightEffect'
import type { SimpleLightEffect } from '../lighting/SimpleLightEffect'
import type { RadianceLightEffect } from '../lighting/RadianceLightEffect'
import type { NormalMapProvider } from '../lighting/NormalMapProvider'

declare module '@react-three/fiber' {
  interface ThreeElements {
    defaultLightEffect: LightEffectElement<typeof DefaultLightEffect>
    directLightEffect: LightEffectElement<typeof DirectLightEffect>
    simpleLightEffect: LightEffectElement<typeof SimpleLightEffect>
    radianceLightEffect: LightEffectElement<typeof RadianceLightEffect>
    normalMapProvider: EffectElement<typeof NormalMapProvider>
  }
}
```
With:
```ts
import type { LightEffectElement, EffectElement } from 'three-flatland/react'
import type { DefaultLightEffect } from '../lighting/DefaultLightEffect'
import type { NormalMapProvider } from '../lighting/NormalMapProvider'

declare module '@react-three/fiber' {
  interface ThreeElements {
    defaultLightEffect: LightEffectElement<typeof DefaultLightEffect>
    normalMapProvider: EffectElement<typeof NormalMapProvider>
  }
}
```

- [ ] **Step 2: Regenerate React subpaths**

```bash
pnpm sync:react
```
Expected: `packages/presets/src/react/lighting/index.ts` is auto-rewritten to drop wrappers for the four deleted exports.

---

### Task A5: Fix AutoNormalProvider references in `Flatland.ts`

**File:**
- Modify: `packages/three-flatland/src/Flatland.ts` (lines around 470, 1118 — locate with grep first)

- [ ] **Step 1: Find the exact lines**

```bash
grep -n "AutoNormalProvider" packages/three-flatland/src/Flatland.ts
```

- [ ] **Step 2: Edit the runtime error message (around line 1118)**

Find:
```
`Add a MaterialEffect that provides these channels (e.g. AutoNormalProvider for 'normal'). ` +
```
Replace with:
```
`Add a MaterialEffect that provides these channels (e.g. NormalMapProvider with a baked atlas, or use SpriteSheetLoader/LDtkLoader with \`normals: true\` to auto-bake). ` +
```

- [ ] **Step 3: Edit the comment around line 470**

Find:
```
// mounted any MaterialEffect children (AutoNormalProvider, etc.)
```
Replace with:
```
// mounted any MaterialEffect children (NormalMapProvider, etc.)
```

- [ ] **Step 4: Verify no AutoNormalProvider mentions remain in `Flatland.ts`**

```bash
grep -c "AutoNormalProvider" packages/three-flatland/src/Flatland.ts
```
Expected: `0`.

---

### Task A6: Fix `TileMap2D.ts` comment

**File:**
- Modify: `packages/three-flatland/src/tilemap/TileMap2D.ts:428`

- [ ] **Step 1: Edit the comment**

Find:
```
* Use this to add channel providers (e.g. AutoNormalProvider) so
```
Replace with:
```
* Use this to add channel providers (e.g. NormalMapProvider) so
```

Also fix the JSDoc `@example` block in the same docblock:
```
*   <autoNormalProvider attach={attachEffect} />
```
Replace with:
```
*   <normalMapProvider attach={attachEffect} />
```

- [ ] **Step 2: Verify**

```bash
grep -c "AutoNormalProvider\|autoNormalProvider" packages/three-flatland/src/tilemap/TileMap2D.ts
```
Expected: `0`.

---

### Task A7: Edit `docs/src/content/docs/guides/lighting.mdx`

**File:**
- Modify: `docs/src/content/docs/guides/lighting.mdx`

This file has four distinct removable sections. Read the current file first, then delete in this order (back-to-front so line numbers stay stable).

- [ ] **Step 1: Re-find the line ranges with current content**

```bash
grep -n "DirectLightEffect\|SimpleLightEffect\|RadianceLightEffect\|AutoNormalProvider\|radianceIntensity" docs/src/content/docs/guides/lighting.mdx
```

- [ ] **Step 2: Delete the `AutoNormalProvider` section (was around lines 498–525)**

Remove the entire H3 `### AutoNormalProvider` section through to the next H3 or H2 — the section includes a vanilla + R3F code-tab block.

- [ ] **Step 3: Delete the three preset code-example sections (was lines 242–281)**

Remove:
- H3/H4 `DirectLightEffect` + its code block
- H3/H4 `SimpleLightEffect` + its code block
- H3/H4 `RadianceLightEffect` + its code block (including any `radianceIntensity` mentions)

- [ ] **Step 4: Trim the preset comparison table (was lines 210–212)**

In the table comparing presets, remove the three rows for Direct/Simple/Radiance. Keep only the `DefaultLightEffect` row.

- [ ] **Step 5: Update the "Recommendations" prose (was lines 546–547)**

Find any text recommending `SimpleLightEffect` for low-end devices or `DirectLightEffect` for simple scenes, and replace with a single paragraph: `DefaultLightEffect is the canonical preset; lighter-weight and global-illumination variants are tracked in a follow-up PR.`

- [ ] **Step 6: Verify no orphaned references**

```bash
grep -nE "DirectLightEffect|SimpleLightEffect|RadianceLightEffect|AutoNormalProvider|radianceIntensity" \
  docs/src/content/docs/guides/lighting.mdx
```
Expected: no matches.

---

### Task A8: Edit `docs/src/content/docs/examples/lighting.mdx`

**File:**
- Modify: `docs/src/content/docs/examples/lighting.mdx`

- [ ] **Step 1: Update intro text (was lines 22, 32)**

Replace any `"toggleable DefaultLightEffect / DirectLightEffect / SimpleLightEffect"` with `"DefaultLightEffect-driven"`.

- [ ] **Step 2: Trim the example import line (was line 36)**

Change:
```ts
import { DefaultLightEffect, DirectLightEffect, SimpleLightEffect } from '@three-flatland/presets'
```
To:
```ts
import { DefaultLightEffect } from '@three-flatland/presets'
```

- [ ] **Step 3: Drop instantiations (were lines 39–40)**

Delete:
```ts
const directEffect = new DirectLightEffect()
const simpleEffect = new SimpleLightEffect()
```

Drop the toggle comments (`// flatland.setLighting(directEffect)` etc.).

- [ ] **Step 4: Fix the React `extend({...})` lists (were lines 104, 108)**

Find:
```tsx
import {
  Flatland, Light2D, Sprite2D, attachLighting, attachEffect,
} from 'three-flatland/react'
import {
  DefaultLightEffect, DirectLightEffect, SimpleLightEffect, AutoNormalProvider,
} from '@three-flatland/presets'
```
Replace with:
```tsx
import {
  Flatland, Light2D, Sprite2D, attachLighting, attachEffect,
} from 'three-flatland/react'
import { DefaultLightEffect, NormalMapProvider } from '@three-flatland/presets'
```

And:
```tsx
extend({ Flatland, Sprite2D, Light2D, DefaultLightEffect, DirectLightEffect, SimpleLightEffect, AutoNormalProvider })
```
→
```tsx
extend({ Flatland, Sprite2D, Light2D, DefaultLightEffect, NormalMapProvider })
```

- [ ] **Step 5: Update the JSX showing the toggle**

Find:
```tsx
<defaultLightEffect attach={attachLighting} />
```
Keep it. Drop any `<directLightEffect>` / `<simpleLightEffect>` / `<radianceLightEffect>` siblings if present.

Find any `<autoNormalProvider attach={attachEffect} />` and replace with `<normalMapProvider attach={attachEffect} />`.

- [ ] **Step 6: Verify**

```bash
grep -nE "DirectLightEffect|SimpleLightEffect|RadianceLightEffect|AutoNormalProvider" \
  docs/src/content/docs/examples/lighting.mdx
```
Expected: no matches.

---

### Task A9: Edit `docs/src/content/docs/guides/pass-effects.mdx:71`

**File:**
- Modify: `docs/src/content/docs/guides/pass-effects.mdx`

- [ ] **Step 1: Drop `AutoNormalProvider` from the comparison table row**

Find:
```
Channel providers (`NormalMapProvider`, `AutoNormalProvider`) are also MaterialEffects
```
Replace with:
```
Channel providers (`NormalMapProvider`) are also MaterialEffects
```

- [ ] **Step 2: Verify**

```bash
grep -c "AutoNormalProvider" docs/src/content/docs/guides/pass-effects.mdx
```
Expected: `0`.

---

### Task A10: Update planning notes that mention split-out scope

**Files:**
- Modify: `planning/experiments/Hybrid-SDF-Shadow-System.md`
- Modify: `planning/experiments/Unified-2D-Lighting-Architecture.md`
- Modify: `planning/experiments/Dungeon-Lighting-Demo.md` (line 26 — fix the `AutoNormalProvider` mention)
- Modify: `planning/effect-channels/rfc-effect-channel-dependencies.md`
- Modify: `.claude/skills/docs-audit/SKILL.md:275`

- [ ] **Step 1: Append a status note to `Hybrid-SDF-Shadow-System.md` (top of file, under the title)**

Add:
```markdown
> **Status (2026-05-16):** Phase-1 (DefaultLightEffect + SDF shadows) ships in `lighting-stochastic-adoption`. Phase-2 GI (RadianceLightEffect, Direct/Simple variants) split into a follow-up PR; see tag `pre-lighting-bisect` for the source state of those presets.
```

- [ ] **Step 2: Append the same note (verbatim) to `Unified-2D-Lighting-Architecture.md`**

- [ ] **Step 3: Edit `Dungeon-Lighting-Demo.md:26`**

Find:
```
| Sprite-normal lighting | Knights + slimes get `AutoNormalProvider` so they pop volumetrically |
```
Replace with:
```
| Sprite-normal lighting | Knights + slimes get `NormalMapProvider` fed by `SpriteSheetLoader({ normals: true })`, which auto-bakes via `resolveNormalMap` on first load (cached + dev-warned) |
```

- [ ] **Step 4: Edit `rfc-effect-channel-dependencies.md` — drop `AutoNormalProvider` from code examples**

Search for the four `AutoNormalProvider` references (lines 225, 302, 340, 389, 393, 828) and remove the relevant `import` / `extend({})` / inline code mentions. Where the doc demonstrates the channel-dependency contract, switch the example to use `NormalMapProvider` (or just leave a `// AutoNormalProvider deferred — see Hybrid-SDF-Shadow-System.md status note` placeholder).

- [ ] **Step 5: Edit `.claude/skills/docs-audit/SKILL.md:275`**

Find:
```
Pre-configured effects: `DefaultLightEffect`, `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect`, `NormalMapProvider`, `AutoNormalProvider`.
```
Replace with:
```
Pre-configured effects: `DefaultLightEffect`, `NormalMapProvider`.
```

- [ ] **Step 6: Workspace-wide AutoNormalProvider check**

```bash
git grep -n "AutoNormalProvider" | grep -v '\.changeset/'
```
Expected: zero lines (the auto-changeset entry is fine since it's an archival changelog).

---

### Task A11: Regenerate + verify Phase A

- [ ] **Step 1: Regen subpaths + lockfile**

```bash
pnpm sync:react
pnpm install
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -r typecheck
```
Expected: all packages green. If `presets`/`presets/react` errors on missing imports of moved types, re-check Task A4.

- [ ] **Step 3: Test**

```bash
pnpm -r test
```
Expected: all green.

- [ ] **Step 4: Full build (validates docs)**

```bash
pnpm build
```
Expected: 33/33 tasks pass; `astro check` validates no orphaned mdx imports of the deleted presets.

- [ ] **Step 5: Run the lighting example in dev to verify (manual check)**

```bash
pnpm dev
```
Visit `http://localhost:5173/three/lighting/` and `http://localhost:5173/react/lighting/`. Confirm: dungeon renders, lights work, no console errors mentioning `AutoNormalProvider` / `RadianceLightEffect`.

Kill dev server with Ctrl-C when done.

- [ ] **Step 6: Commit Phase A**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(lighting): bisect — move Radiance/Direct/Simple to follow-up PR, drop AutoNormalProvider refs

Move out (to be reintroduced via a separate PR seeded from tag pre-lighting-bisect):
- packages/three-flatland/src/lights/RadianceCascades.ts
- packages/presets/src/lighting/{Radiance,Direct,Simple}LightEffect.ts
- planning/experiments/{Radiance-Accumulation,SDF-Tiled-Forward-Plus}.md

Clean dangling references: drop the four ThreeElements augmentations, the
two barrel exports, the Flatland.ts error-message + comment that named
AutoNormalProvider (which never shipped), the matching TileMap2D doc
comment, and every doc section / planning note describing the moved
presets or AutoNormalProvider.

The lighting example continues to use DefaultLightEffect + NormalMapProvider.
SpriteSheetLoader.resolveSheetNormals and LDtkLoader.resolveTilesetNormals
already auto-bake via resolveNormalMap when sidecars are missing — no
behavioural change there.

Verified: pnpm -r typecheck, pnpm -r test, pnpm build (33/33 incl. docs),
manual run of /three/lighting and /react/lighting.
EOF
)"
```

---

## Phase B — NormalProvider Fallback Hardening

The runtime in-memory bake path already exists in `resolveNormalMap()`. Phase B closes three gaps:
1. The baker is statically imported → ships in every bundle. Make it lazy.
2. No "disable runtime bake" flag for production hot paths.
3. `NormalMapLoader.load(url)` (URL-only entry point) doesn't have a descriptor → can't auto-bake. Give it one.

### Task B1: End-to-end smoke test the EXISTING fallback

Before changing anything, prove the fallback actually works on the lighting example by temporarily removing a pre-baked sidecar.

- [ ] **Step 1: Verify the lighting example has pre-baked sidecars to move**

```bash
ls examples/three/lighting/public/sprites/*.normal.png 2>/dev/null
ls examples/react/lighting/public/sprites/*.normal.png 2>/dev/null
```

- [ ] **Step 2: Move the tileset sidecar out of the way**

```bash
mv examples/three/lighting/public/sprites/Dungeon_Tileset.normal.png /tmp/
```

- [ ] **Step 3: Start dev server and open the example**

```bash
pnpm dev
```
Open `http://localhost:5173/three/lighting/`. Check the browser console.

**Expected:** A `[normal]` devtime warning prefixed with `No baked sibling at .../Dungeon_Tileset.normal.png — baking in memory.` AND the dungeon still renders with lit tiles.

**Failure mode:** If the dungeon renders without normals (flat shading) AND no warning fires, the fallback isn't reaching the call site — the rest of Phase B becomes "fix the routing" rather than "harden."

- [ ] **Step 4: Restore the sidecar**

```bash
mv /tmp/Dungeon_Tileset.normal.png examples/three/lighting/public/sprites/
```

- [ ] **Step 5: Stop the dev server (Ctrl-C)**

- [ ] **Step 6: If Step 3 failed, STOP and file an issue describing where the fallback dropped out — do not proceed to B2 until the existing path works.**

---

### Task B2: Make the baker import lazy

**Files:**
- Modify: `packages/normals/src/resolveNormalMap.ts`
- Modify: `packages/normals/package.json` (add `./bake` subpath if not present)

**Why:** Today `bakeInMemory` does `import { bakeNormalMap } from './bake.js'` at module top. That pulls the baker into every consumer's bundle. Lazy-load it so the `~3kB` baker only ships when fallback fires.

- [ ] **Step 1: Add a `./bake` subpath export to `packages/normals/package.json`**

Add to the `exports` object:
```json
"./bake": {
  "source": "./src/bake.ts",
  "types": "./dist/bake.d.ts",
  "import": "./dist/bake.js"
}
```

- [ ] **Step 2: Edit `packages/normals/src/resolveNormalMap.ts` — replace static import**

Find at the top:
```ts
import { bakeNormalMap } from './bake.js'
```
Delete that line.

Find inside `bakeInMemory()`:
```ts
const normalPixels = bakeNormalMap(pixels, width, height, descriptor)
```
Replace with:
```ts
const { bakeNormalMap } = await import('./bake.js')
const normalPixels = bakeNormalMap(pixels, width, height, descriptor)
```

- [ ] **Step 3: Rebuild + verify no regression**

```bash
pnpm --filter @three-flatland/normals build
pnpm --filter @three-flatland/normals test
```
Expected: green.

- [ ] **Step 4: Verify bundle reduction with `pnpm size:why`**

```bash
SIZE_FILTER="@three-flatland/presets" pnpm size:why
```
Check the treemap — `bakeNormalMap` should no longer appear in presets' default chunk.

---

### Task B3: Add a `disableRuntimeBake` flag

**File:**
- Modify: `packages/normals/src/resolveNormalMap.ts`

- [ ] **Step 1: Extend `ResolveNormalMapOptions`**

Find:
```ts
export interface ResolveNormalMapOptions {
  skipBakedProbe?: boolean
  flipY?: boolean
}
```
Replace with:
```ts
export interface ResolveNormalMapOptions {
  skipBakedProbe?: boolean
  flipY?: boolean
  /**
   * If `true`, never bake in memory. When the baked sibling is missing
   * (or stale), resolve to a flat-default `DataTexture` rather than
   * triggering the runtime bake. Use in production where you've already
   * shipped all sidecars and want a missing one to fail loudly via the
   * flat-shaded look, not silently incur a CPU bake on first frame.
   * Default: `false` (runtime bake allowed).
   */
  disableRuntimeBake?: boolean
}
```

- [ ] **Step 2: Honor the flag in `resolveNormalMap()`**

Find the line:
```ts
const tex = await bakeInMemory(sourceURL, descriptor)
```
Replace with:
```ts
if (options.disableRuntimeBake) {
  return flatDefaultTexture(options.flipY)
}
const tex = await bakeInMemory(sourceURL, descriptor)
```

- [ ] **Step 3: Add the `flatDefaultTexture` helper at the bottom of the file**

Append:
```ts
function flatDefaultTexture(flipY?: boolean): Texture {
  // Single-pixel "flat" normal: nx=0, ny=0 (encoded 128, 128), elevation=0, alpha=255.
  // Sampled by NormalMapProvider it decodes to (0, 0, 1) — same as the no-texture default.
  const pixels = new Uint8Array([128, 128, 0, 255])
  const tex = new DataTexture(pixels, 1, 1, RGBAFormat, UnsignedByteType)
  if (flipY !== undefined) tex.flipY = flipY
  tex.needsUpdate = true
  return tex
}
```

- [ ] **Step 4: Write the test**

**File:** Create `packages/normals/src/resolveNormalMap.test.ts` (or append to existing).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveNormalMap } from './resolveNormalMap'
import type { NormalSourceDescriptor } from './descriptor'

const descriptor: NormalSourceDescriptor = { version: 1, pitch: Math.PI / 4, regions: [] }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('resolveNormalMap', () => {
  it('returns a 1x1 flat default when disableRuntimeBake is true and no sidecar exists', async () => {
    // Mock fetch to 404 the sidecar probe + 404 the source so bakeInMemory would fail.
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    const tex = await resolveNormalMap('/missing.png', descriptor, { disableRuntimeBake: true })
    expect(tex.image.width).toBe(1)
    expect(tex.image.height).toBe(1)
  })
})
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter @three-flatland/normals test resolveNormalMap
```
Expected: PASS.

---

### Task B4: Extend `NormalMapLoader.load()` with optional descriptor

**File:**
- Modify: `packages/normals/src/NormalMapLoader.ts`

**Why:** Today `NormalMapLoader.load(url)` only probes the baked sibling and returns null on miss. Anyone using it directly (outside SpriteSheetLoader/LDtkLoader) loses the auto-bake. Accept an optional descriptor and route through `resolveNormalMap` when provided.

- [ ] **Step 1: Add descriptor + disableRuntimeBake to the options type**

Find the static `load` signature:
```ts
static load(
  url: string,
  options?: { skipBakedProbe?: boolean }
): Promise<NormalMapResult>
```
Replace with:
```ts
static load(
  url: string,
  options?: {
    skipBakedProbe?: boolean
    /**
     * When provided, missing sidecars trigger an in-memory bake via
     * `resolveNormalMap`. Without a descriptor, NormalMapLoader can only
     * probe the baked sibling and returns null on miss (legacy behavior,
     * preserved for backward compat).
     */
    descriptor?: NormalSourceDescriptor
    disableRuntimeBake?: boolean
  }
): Promise<NormalMapResult>
```
Add `import type { NormalSourceDescriptor } from './descriptor.js'` at the top if not present.

- [ ] **Step 2: Wire the descriptor through to `_loadImpl`**

In `static load`:
```ts
const skipBakedProbe = options?.skipBakedProbe ?? false
const cacheKey = skipBakedProbe ? `${url}:skip-probe` : url
```
becomes:
```ts
const skipBakedProbe = options?.skipBakedProbe ?? false
const descriptor = options?.descriptor
const disableRuntimeBake = options?.disableRuntimeBake ?? false
const cacheKey = `${url}:${skipBakedProbe ? 'skip' : 'probe'}:${descriptor ? 'desc' : 'nodesc'}:${disableRuntimeBake ? 'noruntime' : 'allowruntime'}`
```
And the call:
```ts
const promise = this._loadImpl(url, skipBakedProbe)
```
becomes:
```ts
const promise = this._loadImpl(url, skipBakedProbe, descriptor, disableRuntimeBake)
```

- [ ] **Step 3: Update `_loadImpl` to route through `resolveNormalMap` when given a descriptor**

Find:
```ts
private static async _loadImpl(
  url: string,
  skipBakedProbe: boolean
): Promise<NormalMapResult> {
  if (!skipBakedProbe) {
    const baked = await this._tryLoadBaked(url)
    if (baked) return baked
  }

  sharedDevtimeWarn(
    'normal',
    url,
    `No baked normal sibling for ${url}. Bake with \`npx flatland-bake normal\` or pass \`normals\` to a high-level loader (SpriteSheetLoader, LDtkLoader) for in-memory generation.`
  )
  return null
}
```
Replace with:
```ts
private static async _loadImpl(
  url: string,
  skipBakedProbe: boolean,
  descriptor: NormalSourceDescriptor | undefined,
  disableRuntimeBake: boolean
): Promise<NormalMapResult> {
  // With a descriptor we can do the full resolve (try baked → in-memory bake).
  if (descriptor) {
    const { resolveNormalMap } = await import('./resolveNormalMap.js')
    return resolveNormalMap(url, descriptor, { skipBakedProbe, disableRuntimeBake })
  }

  // No descriptor → legacy URL-only behavior: probe sidecar, return null on miss.
  if (!skipBakedProbe) {
    const baked = await this._tryLoadBaked(url)
    if (baked) return baked
  }

  sharedDevtimeWarn(
    'normal',
    url,
    `No baked normal sibling for ${url} and no descriptor passed. ` +
      `Either pre-bake (\`npx flatland-bake normal\`), pass a \`descriptor\` to ` +
      `NormalMapLoader.load() for in-memory bake, or use SpriteSheetLoader/LDtkLoader ` +
      `with \`normals: true\` (which synthesizes a descriptor for you).`
  )
  return null
}
```

- [ ] **Step 4: Update the matching instance methods (`load`, `loadAsync`) to thread the same args**

Find the instance `load(url, onLoad, ...)` and `loadAsync(url)` methods; mirror the new signature so the R3F path also accepts a descriptor + disableRuntimeBake. (Reuse the same options-object shape.)

- [ ] **Step 5: Write tests for the descriptor route**

**File:** `packages/normals/src/NormalMapLoader.test.ts` (extend).

```ts
it('uses resolveNormalMap when a descriptor is provided', async () => {
  const descriptor: NormalSourceDescriptor = { version: 1, pitch: Math.PI / 4, regions: [] }
  // Mock fetch: 404 for sidecar HEAD, 200 with bytes for source GET
  let calls = 0
  global.fetch = vi.fn(async (url, init) => {
    calls++
    if (init?.method === 'HEAD') return new Response(null, { status: 404 })
    // Return a 1x1 transparent PNG buffer for the source fetch
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
  }) as unknown as typeof fetch
  // Stub createImageBitmap for jsdom
  global.createImageBitmap = vi.fn(async () => ({ width: 1, height: 1, close: () => {} } as ImageBitmap))

  const tex = await NormalMapLoader.load('/missing.png', { descriptor })
  expect(tex).not.toBeNull()
})

it('falls back to null + warns when no descriptor is provided', async () => {
  global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const tex = await NormalMapLoader.load('/missing.png')
  expect(tex).toBeNull()
  expect(warnSpy).toHaveBeenCalled()
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @three-flatland/normals test NormalMapLoader
```
Expected: PASS (both new tests + the existing baked-probe tests).

---

### Task B5: Verify SpriteSheetLoader + LDtkLoader still wire through correctly

**Why:** The high-level loaders already call `resolveNormalMap` with a descriptor. Confirm the new `disableRuntimeBake` flag can be forwarded.

**Files (inspect, may not need changes):**
- `packages/three-flatland/src/loaders/SpriteSheetLoader.ts`
- `packages/three-flatland/src/loaders/LDtkLoader.ts`

- [ ] **Step 1: Find the call sites**

```bash
grep -n "resolveNormalMap\|resolveSheetNormals\|resolveTilesetNormals" \
  packages/three-flatland/src/loaders/*.ts \
  packages/normals/src/*.ts
```

- [ ] **Step 2: Add `disableRuntimeBake` to each loader's `normals` option type**

If `SpriteSheetLoader`'s normals option is currently `{ normals?: boolean | NormalsConfig }` where `NormalsConfig` already has `skipBakedProbe`, add `disableRuntimeBake` alongside. Same for LDtkLoader.

- [ ] **Step 3: Pass the new option through to `resolveNormalMap`**

Wherever each loader calls `resolveNormalMap(url, descriptor, { skipBakedProbe, flipY })`, append the new flag.

- [ ] **Step 4: Typecheck**

```bash
pnpm -r typecheck
```
Expected: green.

---

### Task B6: Update documentation

**Files:**
- Modify: `docs/src/content/docs/guides/lighting.mdx` (add a "Runtime bake fallback" subsection under the Normals section)
- Modify: `docs/src/content/docs/guides/loaders.mdx` (clarify `normals: true` behavior)

- [ ] **Step 1: Add a "Runtime bake fallback" callout in `guides/lighting.mdx`**

Under the existing `NormalMapProvider` section, append:

```md
### Runtime bake fallback

`NormalMapProvider` is fed by a baked `.normal.png` atlas. The high-level loaders
(`SpriteSheetLoader({ normals: true })`, `LDtkLoader` with `normals: true`)
handle the fallback for you: if the baked sibling is missing or its descriptor
hash is stale, the loader bakes the atlas in memory on first load (lazy-imports
the baker, so the cost is paid only when needed) and emits a dev-mode warning
pointing at `npx flatland-bake normal`.

For production builds where you've shipped all sidecars and want a missing one
to fail loudly (flat lighting) rather than silently incur a CPU bake on first
frame, pass `normals: { disableRuntimeBake: true }`.
```

- [ ] **Step 2: Mirror that note in `guides/loaders.mdx`**

Briefly describe `normals: true | { skipBakedProbe?: boolean, disableRuntimeBake?: boolean }` and what each flag does.

- [ ] **Step 3: Rebuild docs**

```bash
pnpm --filter docs build
```
Expected: 408+ pages, `astro check` clean.

---

### Task B7: Final verify + commit Phase B

- [ ] **Step 1: Full workspace verify**

```bash
pnpm -r typecheck
pnpm -r test
pnpm build
```
Expected: all green.

- [ ] **Step 2: Run the smoke test from B1 one more time** (sidecar moved away → confirm warning + render works → restore)

- [ ] **Step 3: Commit Phase B**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(normals): lazy-load baker + disableRuntimeBake flag + NormalMapLoader descriptor route

Three small hardening changes around the already-shipped runtime in-memory
bake fallback in resolveNormalMap():

- bakeInMemory now dynamic-imports './bake.js' so the baker (~3kB) only
  lands in consumer bundles when the fallback fires; gates via a new
  exports./bake subpath in packages/normals/package.json.
- ResolveNormalMapOptions gains disableRuntimeBake. When true, a missing
  sidecar resolves to a 1x1 flat DataTexture (visually identical to the
  no-texture case) instead of triggering a CPU bake. Use in prod where
  every sidecar should ship.
- NormalMapLoader.load() now accepts an optional NormalSourceDescriptor.
  With one, it routes through resolveNormalMap and gets the full fallback
  for free. Without one, it preserves legacy URL-only behavior (probe →
  null on miss, with a warn pointing at the high-level loaders).
- SpriteSheetLoader and LDtkLoader expose disableRuntimeBake on their
  normals option.
- Docs updated under guides/lighting + guides/loaders.

Verified: full smoke — moved Dungeon_Tileset.normal.png out, confirmed
"baking in memory" devwarn fired, lighting still rendered correctly,
restored sidecar.
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin lighting-stochastic-adoption
```

---

## Verification Checklist (apply at every commit boundary)

- [ ] `pnpm -r typecheck` is green
- [ ] `pnpm -r test` is green
- [ ] `pnpm build` is green (33/33 tasks, including `docs#build` for the MDX edits)
- [ ] `git grep AutoNormalProvider` returns nothing outside `.changeset/` archives
- [ ] `git grep RadianceLightEffect\|DirectLightEffect\|SimpleLightEffect\|RadianceCascades` returns nothing outside `planning/experiments/Hybrid-SDF-Shadow-System.md` + `Unified-2D-Lighting-Architecture.md` status notes (which intentionally name them)
- [ ] Lighting example runs in `pnpm dev` (manual)
- [ ] Smoke: move `Dungeon_Tileset.normal.png` out, confirm dev warning + correct render (manual; Task B1 + B7 Step 2)
