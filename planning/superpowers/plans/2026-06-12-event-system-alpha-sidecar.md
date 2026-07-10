# Event System — Plan 3: Baked Alpha Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pixel-perfect hit-testing (`hitTestMode: 'alpha'`) backed by a bake-time `.alpha.png` sidecar with runtime canvas-readback fallback, following the `@three-flatland/normals` pipeline verbatim.

**Architecture:** Per spec §10 + decision D2: a new `alpha` baker registered in `@three-flatland/normals`'s `flatland.bake` array (the package already owns PNG decode and the alpha channel) writes `<source>.alpha.png` stamped with a tEXt descriptor hash; `resolveAlphaMap` in the core package probes via `bakedSiblingURL`/`probeBakedSibling`, falls back to `AlphaMap.fromTexture`-style readback with the standard devtime warning; `SpriteSheetLoader` grows an `alpha` option parallel to `normals` and populates `SpriteSheet.alphaMap`; `AnimatedSprite2D` auto-wires `sheet.alphaMap` → `sprite.alphaMap` (spec §8.4).

**Tech Stack:** pngjs (already a normals dep), `@three-flatland/bake` sidecar utilities (`bakedSiblingURL`, `probeBakedSibling`, `hashDescriptor`, `writeSidecarPng`), vitest.

**Prerequisite:** Plan 1 merged (`AlphaMap` class exists at `packages/three-flatland/src/events/AlphaMap.ts`).

**Schema rider (out of scope here):** `meta.alpha` as an explicit atlas-JSON field belongs to the atlas schema (`atlas.v1.json` / `packages/schemas`), which lives on the unlanded `feat-vscode-tools` branch — main has neither file. This plan ships the naming-convention path (`bakedSiblingURL`); add `meta.alpha` to the schema in the feat-vscode-tools line when it lands (file an issue referencing spec §10 during the final task).

**PNG channel note:** `writeSidecarPng` writes RGBA via pngjs. The alpha sidecar stores the value in **R** (replicated to G/B for grayscale viewability, A=255). Runtime reads R. PNG row filtering compresses the replication to near-single-channel cost; this is the "single-channel PNG" of decision D2 realized on the existing machinery.

---

## File structure

| File                                                              | Responsibility                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Create `packages/normals/src/alphaBake.node.ts`                   | `bakeAlphaMapFile(input, output?)` — PNG → alpha-in-R sidecar + stamp                                                         |
| Create `packages/normals/src/alphaCli.ts`                         | `Baker` for `flatland-bake alpha`                                                                                             |
| Modify `packages/normals/package.json`                            | Second `flatland.bake` entry + `./alpha-cli` build output (mirror how `cli.ts` becomes `./dist/cli.js` in the tsup config)    |
| Create `packages/three-flatland/src/events/resolveAlphaMap.ts`    | probe → fetch baked → decode R channel → `AlphaMap`; fallback readback                                                        |
| Modify `packages/three-flatland/src/events/index.ts`              | Export `resolveAlphaMap`                                                                                                      |
| Modify `packages/three-flatland/src/sprites/types.ts`             | `SpriteSheet.alphaMap?: AlphaMap`                                                                                             |
| Modify `packages/three-flatland/src/loaders/SpriteSheetLoader.ts` | `alpha` option, populate `sheet.alphaMap`                                                                                     |
| Modify `packages/three-flatland/src/sprites/AnimatedSprite2D.ts`  | Copy `sheet.alphaMap` → `this.alphaMap` when the sheet is assigned                                                            |
| Tests                                                             | `packages/normals/src/alphaBake.test.ts`, `packages/three-flatland/src/events/resolveAlphaMap.test.ts`, loader test additions |

The alpha descriptor is parameterless: `{ kind: 'alpha', v: 1 }` — its hash is a constant, so staleness only triggers on format version bumps. Define it ONCE in the core package and import nothing across packages for it (the baker re-declares the same literal; both sides hash with `hashDescriptor` from `@three-flatland/bake`, which both packages already depend on — verify with `grep '"@three-flatland/bake"' packages/normals/package.json packages/three-flatland/package.json`).

---

### Task 1: Alpha baker (node)

**Files:**

- Create: `packages/normals/src/alphaBake.node.ts`
- Test: `packages/normals/src/alphaBake.test.ts`

Read `packages/normals/src/bake.node.ts` first — `bakeNormalMapFile` shows the exact pngjs read/write idiom this mirrors.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { bakeAlphaMapFile, ALPHA_DESCRIPTOR } from './alphaBake.node'
import { hashDescriptor } from '@three-flatland/bake'

function writeTestPng(path: string): void {
  const png = new PNG({ width: 2, height: 2 })
  // RGBA: pixel (0,0) opaque red, (1,0) half alpha, row 1 transparent
  png.data = Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 0])
  writeFileSync(path, PNG.sync.write(png))
}

describe('bakeAlphaMapFile', () => {
  it('writes <input>.alpha.png with alpha in R and the descriptor stamp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alpha-bake-'))
    const input = join(dir, 'sprites.png')
    writeTestPng(input)

    const output = bakeAlphaMapFile(input)
    expect(output).toBe(join(dir, 'sprites.alpha.png'))

    const baked = PNG.sync.read(readFileSync(output))
    expect(baked.width).toBe(2)
    expect(baked.height).toBe(2)
    // R channel carries the source alpha
    expect(baked.data[0]).toBe(255)
    expect(baked.data[4]).toBe(128)
    expect(baked.data[8]).toBe(0)
    // replicated to G/B, A=255
    expect(baked.data[1]).toBe(255)
    expect(baked.data[3]).toBe(255)

    // tEXt stamp present with the constant descriptor hash
    const raw = readFileSync(output)
    const text = raw.toString('latin1')
    expect(text).toContain('flatland')
    expect(text).toContain(hashDescriptor(ALPHA_DESCRIPTOR))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/normals/src/alphaBake.test.ts`
Expected: FAIL — cannot resolve `./alphaBake.node`

- [ ] **Step 3: Write the implementation**

```ts
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { bakedSiblingURL, hashDescriptor, writeSidecarPng } from '@three-flatland/bake'

/**
 * Versioned descriptor for the alpha sidecar. Parameterless — the hash
 * is constant per format version, so probeBakedSibling staleness only
 * triggers on a `v` bump. Spec §10.
 */
export const ALPHA_DESCRIPTOR = { kind: 'alpha', v: 1 } as const

/**
 * Bake `<input>.alpha.png` from an RGBA PNG: source alpha stored in R
 * (replicated to G/B for grayscale viewability, A=255), stamped with
 * the descriptor hash under the `flatland` tEXt chunk.
 *
 * Returns the output path.
 */
export function bakeAlphaMapFile(inputPath: string, outputPath?: string): string {
  const png = PNG.sync.read(readFileSync(inputPath))
  const out = outputPath ?? bakedSiblingURL(inputPath, '.alpha.png')
  const pixels = new Uint8Array(png.width * png.height * 4)
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3]!
    pixels[i * 4 + 0] = a
    pixels[i * 4 + 1] = a
    pixels[i * 4 + 2] = a
    pixels[i * 4 + 3] = 255
  }
  writeSidecarPng(out, pixels, png.width, png.height, {
    hash: hashDescriptor(ALPHA_DESCRIPTOR),
    v: 1,
  })
  return out
}
```

(Check the exact `BakedSidecarMetadata` field names in `packages/bake/src/types.ts` before writing the metadata literal — the normals baker's `bake.node.ts` call site is the authoritative example; mirror it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run packages/normals/src/alphaBake.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/normals/src/alphaBake.node.ts packages/normals/src/alphaBake.test.ts
git commit -m "feat(normals): alpha hitmask baker writing stamped .alpha.png sidecars"
```

---

### Task 2: CLI baker registration

**Files:**

- Create: `packages/normals/src/alphaCli.ts`
- Modify: `packages/normals/package.json` (the `flatland.bake` array at line ~62)
- Modify: `packages/normals/tsup.config.ts` (add the new CLI entry — mirror how `src/cli.ts` is configured)

- [ ] **Step 1: Write the CLI baker**

Read `packages/normals/src/cli.ts` first (the `normal` baker) and mirror its `Baker` shape exactly:

```ts
import type { Baker } from '@three-flatland/bake'
import { bakeAlphaMapFile } from './alphaBake.node.js'

const USAGE = [
  'Usage:',
  '  flatland-bake alpha <input.png> [output.png]',
  '',
  'Extracts the alpha channel from an RGBA PNG into <input>.alpha.png',
  '(alpha stored in R, replicated to G/B). The output is stamped with a',
  '`flatland` tEXt chunk so runtime loaders can invalidate stale bakes.',
  '',
  'Used by hitTestMode: "alpha" for pixel-perfect pointer hit testing.',
].join('\n')

const baker: Baker = {
  name: 'alpha',
  description: 'Bake an alpha hitmask sidecar from a sprite PNG',

  usage() {
    return USAGE
  },

  run(args) {
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      process.stdout.write(USAGE + '\n')
      return Promise.resolve(args.length === 0 ? 1 : 0)
    }
    const [input, output] = args
    const out = bakeAlphaMapFile(input!, output)
    process.stdout.write(`wrote ${out}\n`)
    return Promise.resolve(0)
  },
}

export default baker
```

(If the `Baker` interface in `packages/bake/src/types.ts` lacks `usage()`, drop that member — match the interface as it exists; the `normal` baker in `cli.ts` is the authority.)

- [ ] **Step 2: Register in package.json**

In `packages/normals/package.json`, extend the `flatland.bake` array:

```json
"flatland": {
  "bake": [
    {
      "name": "normal",
      "description": "Bake a tangent-space normal map from a sprite PNG",
      "entry": "./dist/cli.js"
    },
    {
      "name": "alpha",
      "description": "Bake an alpha hitmask sidecar from a sprite PNG",
      "entry": "./dist/alphaCli.js"
    }
  ]
}
```

Add `src/alphaCli.ts` to the tsup entry list so `./dist/alphaCli.js` exists after build.

- [ ] **Step 3: Build and smoke the CLI**

```bash
pnpm --filter=@three-flatland/normals build
npx flatland-bake alpha --help
```

Expected: usage text printed. Then bake a real file:

```bash
npx flatland-bake alpha examples/react/hit-test/public/sprites/knight.png
ls examples/react/hit-test/public/sprites/knight.alpha.png
git checkout -- examples/ 2>/dev/null; rm -f examples/react/hit-test/public/sprites/knight.alpha.png
```

(Smoke only — don't commit baked example assets in this task; the examples adopt sidecars when the docs do.)

- [ ] **Step 4: Run the normals suite**

Run: `npx vitest --run packages/normals/src`
Expected: all PASS (including the discovery test `cli.test.ts` if it asserts baker registration — update its expectations if it enumerates bakers).

- [ ] **Step 5: Commit**

```bash
git add packages/normals/src/alphaCli.ts packages/normals/package.json packages/normals/tsup.config.ts
git commit -m "feat(normals): register flatland-bake alpha baker"
```

---

### Task 3: resolveAlphaMap (runtime probe + fallback)

**Files:**

- Create: `packages/three-flatland/src/events/resolveAlphaMap.ts`
- Modify: `packages/three-flatland/src/events/index.ts`
- Test: `packages/three-flatland/src/events/resolveAlphaMap.test.ts`

Read `packages/normals/src/resolveNormalMap.ts` first — this module is its structural twin (probe → baked load → fallback → devtime warn). Reuse its mocking approach from `resolveNormalMap.test.ts` for fetch/probe stubs.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AlphaMap } from './AlphaMap'
import { resolveAlphaMap, ALPHA_SIDECAR_DESCRIPTOR, decodeAlphaPng } from './resolveAlphaMap'
import * as bake from '@three-flatland/bake'

afterEach(() => vi.restoreAllMocks())

describe('decodeAlphaPng', () => {
  it('reads the R channel from decoded RGBA pixels', () => {
    // 2×1: R=200 and R=10
    const rgba = new Uint8ClampedArray([200, 200, 200, 255, 10, 10, 10, 255])
    const map = decodeAlphaPng(rgba, 2, 1)
    expect(map).toBeInstanceOf(AlphaMap)
    expect(map.data[0]).toBe(200)
    expect(map.data[1]).toBe(10)
  })
})

describe('resolveAlphaMap', () => {
  it('skips the probe entirely with forceRuntime', async () => {
    const probe = vi.spyOn(bake, 'probeBakedSibling')
    const fallback = vi.fn().mockResolvedValue(new AlphaMap(new Uint8Array([1]), 1, 1))
    const map = await resolveAlphaMap('/sprites/a.png', {
      forceRuntime: true,
      runtimeFallback: fallback,
    })
    expect(probe).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
    expect(map!.data[0]).toBe(1)
  })

  it('falls back to runtime when the sidecar probe misses', async () => {
    vi.spyOn(bake, 'probeBakedSibling').mockResolvedValue({ ok: false } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallback = vi.fn().mockResolvedValue(new AlphaMap(new Uint8Array([7]), 1, 1))
    const map = await resolveAlphaMap('/sprites/a.png', { runtimeFallback: fallback })
    expect(fallback).toHaveBeenCalledOnce()
    expect(map!.data[0]).toBe(7)
    expect(warn).toHaveBeenCalled() // devtime "no baked sibling" warning
    warn.mockRestore()
  })

  it('uses the constant descriptor hash for the probe', async () => {
    const probe = vi.spyOn(bake, 'probeBakedSibling').mockResolvedValue({ ok: false } as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await resolveAlphaMap('/sprites/a.png', {
      runtimeFallback: async () => null,
    })
    expect(probe).toHaveBeenCalledWith('/sprites/a.alpha.png', {
      expectedHash: bake.hashDescriptor(ALPHA_SIDECAR_DESCRIPTOR),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run packages/three-flatland/src/events/resolveAlphaMap.test.ts`
Expected: FAIL — cannot resolve `./resolveAlphaMap`

- [ ] **Step 3: Write the implementation**

```ts
import { bakedSiblingURL, hashDescriptor, probeBakedSibling } from '@three-flatland/bake'
import { AlphaMap } from './AlphaMap'

/** Must stay in lockstep with ALPHA_DESCRIPTOR in @three-flatland/normals/alphaBake. */
export const ALPHA_SIDECAR_DESCRIPTOR = { kind: 'alpha', v: 1 } as const

export interface ResolveAlphaMapOptions {
  /** Skip the sidecar probe and always extract at runtime. */
  forceRuntime?: boolean
  /**
   * Runtime extraction strategy. The SpriteSheetLoader passes a
   * texture-readback closure; injectable here for testing and for
   * worker-based readback later.
   */
  runtimeFallback: () => Promise<AlphaMap | null>
}

/** Build an AlphaMap from decoded RGBA pixels (alpha lives in R). */
export function decodeAlphaPng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): AlphaMap {
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4]!
  return new AlphaMap(alpha, width, height)
}

/**
 * Resolve an alpha hitmask for a source image URL: probe the baked
 * `.alpha.png` sibling (hash-stamped — see flatland-bake alpha), load
 * it on a match, otherwise fall back to runtime extraction with a
 * devtime warning. Mirrors resolveNormalMap. Spec §10.
 */
export async function resolveAlphaMap(
  sourceURL: string,
  options: ResolveAlphaMapOptions
): Promise<AlphaMap | null> {
  if (!options.forceRuntime) {
    const bakedURL = bakedSiblingURL(sourceURL, '.alpha.png')
    const probe = await probeBakedSibling(bakedURL, {
      expectedHash: hashDescriptor(ALPHA_SIDECAR_DESCRIPTOR),
    })
    if (probe.ok && probe.hashMatches) {
      const bitmap = await createImageBitmap(await (await fetch(bakedURL)).blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      return decodeAlphaPng(data, width, height)
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        probe.ok
          ? `three-flatland: stale alpha sidecar for ${sourceURL} — re-run \`flatland-bake alpha\``
          : `three-flatland: no baked alpha sidecar for ${sourceURL} — extracting at runtime. ` +
              `Run \`flatland-bake alpha\` to precompute.`
      )
    }
  }
  return options.runtimeFallback()
}
```

(Check `resolveNormalMap.ts` for a shared `devtimeWarn` helper in the bake or normals package — if one is importable from `@three-flatland/bake`, use it instead of inline `console.warn` and adjust the test to spy on it.)

- [ ] **Step 4: Export from the events barrel**

Add to `packages/three-flatland/src/events/index.ts`:

```ts
export {
  resolveAlphaMap,
  decodeAlphaPng,
  ALPHA_SIDECAR_DESCRIPTOR,
  type ResolveAlphaMapOptions,
} from './resolveAlphaMap'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest --run packages/three-flatland/src/events/resolveAlphaMap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/three-flatland/src/events/resolveAlphaMap.ts packages/three-flatland/src/events/resolveAlphaMap.test.ts packages/three-flatland/src/events/index.ts
git commit -m "feat(events): resolveAlphaMap with baked-sidecar probe and runtime fallback"
```

---

### Task 4: SpriteSheetLoader `alpha` option + SpriteSheet.alphaMap

**Files:**

- Modify: `packages/three-flatland/src/sprites/types.ts` (the `SpriteSheet` interface, ~line 79)
- Modify: `packages/three-flatland/src/loaders/SpriteSheetLoader.ts` (mirror the `normals` option plumbing at lines ~38, ~92, ~111, ~178)
- Test: extend the existing loader test file (find it: `ls packages/three-flatland/src/loaders/*.test.ts`) following its existing mocking style for the normals option

- [ ] **Step 1: Add the SpriteSheet field**

In `types.ts`, after `normalMap?: Texture` add:

```ts
  /**
   * CPU alpha hitmask, co-registered with `texture`. Populated when
   * the loader is given `alpha: true`. Consumed by
   * `hitTestMode: 'alpha'` (assign to `sprite.alphaMap`). Spec §8.4.
   */
  alphaMap?: AlphaMap
```

with `import type { AlphaMap } from '../events/AlphaMap'` at the top.

- [ ] **Step 2: Write the failing loader test**

Following the existing loader test idioms (read the file first), add:

```ts
it('populates sheet.alphaMap when alpha: true', async () => {
  // Mirror the normals-option test setup exactly: stub fetch/probe so the
  // sidecar probe MISSES, and stub the texture image so the runtime
  // fallback (AlphaMap.fromTexture) can run against a canvas mock — or,
  // if the normals tests stub resolveNormalMap at module level, stub
  // resolveAlphaMap the same way and assert it was called with the
  // texture URL and that its return value landed on sheet.alphaMap.
})
```

The executor must write this test concretely after reading the existing loader tests — copy the normals-option test wholesale and swap the option/field/module names. The assertion contract: `loadAsync(url, { alpha: true })` → `sheet.alphaMap` is the `AlphaMap` produced by `resolveAlphaMap`; without the option, `sheet.alphaMap` is `undefined`.

- [ ] **Step 3: Implement the option**

In `SpriteSheetLoader.ts`, mirroring `normals` exactly:

1. Options interface: `alpha?: boolean` with TSDoc pointing at `hitTestMode: 'alpha'`.
2. Loader field: `alpha = false` next to `normals` (~line 92), included in the options bag (~line 111).
3. In the load path where `options?.normals` is handled (~line 178), add the parallel branch:

```ts
if (options?.alpha) {
  sheet.alphaMap =
    (await resolveAlphaMap(textureUrl, {
      forceRuntime: options.forceRuntime ?? false,
      runtimeFallback: async () => AlphaMap.fromTexture(sheet.texture),
    })) ?? undefined
}
```

with `import { resolveAlphaMap } from '../events/resolveAlphaMap'` and `import { AlphaMap } from '../events/AlphaMap'`. Use the same `textureUrl` variable the normals branch resolves against (read the surrounding code; the URL handed to `resolveNormalMap` is the one to reuse).

- [ ] **Step 4: Run the loader suite**

Run: `npx vitest --run packages/three-flatland/src/loaders`
Expected: PASS including the new test

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/sprites/types.ts packages/three-flatland/src/loaders/SpriteSheetLoader.ts packages/three-flatland/src/loaders/*.test.ts
git commit -m "feat(loaders): alpha option populating SpriteSheet.alphaMap via sidecar resolve"
```

---

### Task 5: AnimatedSprite2D auto-wiring

**Files:**

- Modify: `packages/three-flatland/src/sprites/AnimatedSprite2D.ts` (`_spriteSheet` set path — find the `spriteSheet` setter / constructor assignment at ~line 71–82)
- Test: extend `packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts`

- [ ] **Step 1: Write the failing test**

Following the existing AnimatedSprite2D test setup (read the file; it constructs sheets from mock textures):

```ts
it('adopts the sheet alphaMap for alpha hit-testing (spec §8.4)', () => {
  const sheet = makeSheet() // the file's existing sheet factory
  sheet.alphaMap = new AlphaMap(new Uint8Array([255]), 1, 1)
  const sprite = new AnimatedSprite2D({ spriteSheet: sheet })
  expect(sprite.alphaMap).toBe(sheet.alphaMap)
})

it('does not clobber an explicitly assigned alphaMap', () => {
  const sheet = makeSheet()
  sheet.alphaMap = new AlphaMap(new Uint8Array([255]), 1, 1)
  const mine = new AlphaMap(new Uint8Array([0]), 1, 1)
  const sprite = new AnimatedSprite2D({})
  sprite.alphaMap = mine
  sprite.spriteSheet = sheet
  expect(sprite.alphaMap).toBe(mine)
})
```

with `import { AlphaMap } from '../events/AlphaMap'`. Adapt `makeSheet`/constructor call shapes to the file's actual helpers.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest --run packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts`
Expected: new tests FAIL (`sprite.alphaMap` stays null)

- [ ] **Step 3: Implement**

In every code path where `_spriteSheet` is assigned (constructor and the `spriteSheet` setter — find both), add:

```ts
if (value?.alphaMap && this.alphaMap === null) {
  this.alphaMap = value.alphaMap
}
```

(`value` = the incoming sheet in the setter; in the constructor use the options sheet. The `=== null` guard preserves explicit assignments.)

- [ ] **Step 4: Run to verify pass + full sprites suite**

Run: `npx vitest --run packages/three-flatland/src/sprites`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add packages/three-flatland/src/sprites/AnimatedSprite2D.ts packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts
git commit -m "feat(sprites): AnimatedSprite2D adopts SpriteSheet.alphaMap"
```

---

### Task 6: Final gate + schema-rider issue

- [ ] **Step 1: Full verification**

```bash
npx vitest --typecheck --run packages/three-flatland/src packages/normals/src
pnpm --filter=three-flatland typecheck && pnpm --filter=@three-flatland/normals typecheck
npx eslint packages/three-flatland/src/events packages/three-flatland/src/loaders packages/normals/src
npx prettier --check 'packages/three-flatland/src/events/**' 'packages/normals/src/alpha*'
```

Expected: all green.

- [ ] **Step 2: File the schema rider issue**

```bash
gh issue create --title "feat(schema): add meta.alpha sidecar URI to atlas.v1.json" \
  --body "When the feat-vscode-tools atlas schema lands, add \`meta.alpha: string\` alongside \`meta.normal\` so SpriteSheetLoader can discover the alpha hitmask sidecar from the atlas JSON instead of the bakedSiblingURL naming convention. See planning/superpowers/specs/2026-06-12-event-system-design.md §10 (decision D2)."
```

- [ ] **Step 3: Update the hit-test docs page**

In `docs/src/content/docs/examples/hit-test.mdx` (Plan 2), replace the alpha-mode teaser with the real workflow: `flatland-bake alpha sprites.png` + `loadAsync(url, { alpha: true })` + `sprite.alphaMap = sheet.alphaMap` (or AnimatedSprite2D auto-wiring), and the runtime-fallback warning behavior.

- [ ] **Step 4: Commit**

```bash
git add docs/src/content/docs/examples/hit-test.mdx
git commit -m "docs: alpha hit-testing workflow (bake, load, assign)"
```
