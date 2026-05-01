# Image Encoder — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `@three-flatland/image` (browser+node WASM encoder package) + `flatland-bake encode` CLI + `meta.sources` schema migration. Phase 2 (Squoosh-style GUI) is a separate spec/plan.

**Architecture:** Cherry-pick `packages/bake` infrastructure from `lighting-stochastic-adoption`. Build `packages/image/` with subpath exports (`.` browser-safe, `./node` Node I/O, `./cli` Baker). Codecs use stock WASM (`@jsquash/{png,webp,avif}` + BinomialLLC's `basis_encoder.wasm`). Migrate atlas sidecar schema from required `meta.image: string` to required `meta.sources: { format, uri }[]` across `packages/three-flatland`, `tools/io`, atlas tool, merge tool. Path B (Zig-built SIMD BasisU) is **not in this plan** — triggered reactively by the Task 16 latency benchmark, designed in a follow-up plan if needed.

**Tech Stack:** TypeScript, pnpm workspaces, tsup, vitest, @jsquash WASM codecs, basis_universal WASM, ajv (draft 2020-12), Node `worker_threads`, `node:fs/promises`.

**Spec:** `planning/superpowers/specs/2026-05-01-image-encoder-design.md`

---

## File Structure

### New files
- `packages/bake/**` — cherry-picked from `lighting-stochastic-adoption` (Task 1).
- `packages/image/package.json` — manifest with `flatland.bake` registration and codec deps.
- `packages/image/tsconfig.json`, `packages/image/tsup.config.ts` — build config.
- `packages/image/src/types.ts` — `EncodeFormat`, `ImageEncodeOptions`, `GpuMemoryEstimate`.
- `packages/image/src/codecs/png.ts` — `@jsquash/png` wrapper (encode + decode).
- `packages/image/src/codecs/webp.ts` — `@jsquash/webp` wrapper.
- `packages/image/src/codecs/avif.ts` — `@jsquash/avif` wrapper.
- `packages/image/src/codecs/ktx2.ts` — `basis_universal` WASM wrapper.
- `packages/image/src/encode.ts` — codec dispatch (browser-safe).
- `packages/image/src/decode.ts` — decode dispatch (browser-safe).
- `packages/image/src/memory.ts` — analytic GPU memory estimator.
- `packages/image/src/index.ts` — browser-safe public surface.
- `packages/image/src/encode.node.ts` — file I/O + worker_threads pool.
- `packages/image/src/node.ts` — Node-side public surface (re-exports `index` + adds file/batch).
- `packages/image/src/cli.ts` — default-export `Baker` for `flatland-bake encode`.
- `packages/image/src/__fixtures__/{tiny.png,gradient.png,2048-atlas.png}` — codec round-trip fixtures.
- `packages/image/src/codecs/png.test.ts`, `webp.test.ts`, `avif.test.ts`, `ktx2.test.ts` — codec round-trip tests.
- `packages/image/src/encode.test.ts` — dispatch tests.
- `packages/image/src/encode.node.test.ts` — file I/O + atomic write tests.
- `packages/image/src/cli.test.ts` — CLI arg parsing tests.
- `packages/image/src/cli.integration.test.ts` — child-process integration tests.
- `packages/image/src/basisu-bench.test.ts` — BasisU latency benchmark (Path B gate).
- `packages/three-flatland/src/sprites/atlas.schema.ts` — ajv compile + `validateAtlas` export (centralizes the validator).
- `tools/vscode/webview/_wasm-test/main.tsx` + `index.html` — throwaway WebP-in-webview test (Task 18).

### Modified files
- `pnpm-workspace.yaml` — add codec deps to catalog.
- `package.json` (root) — add `@three-flatland/bake`, `@three-flatland/image` to `pnpm.overrides`.
- `packages/three-flatland/src/sprites/atlas.schema.json` — `meta.image` removed; `meta.sources` required + `minItems: 1` + uniqueItems-by-format constraint.
- `packages/three-flatland/package.json` — export `./sprites/atlas`.
- `tools/io/src/atlas/types.ts:45-60` — `AtlasJson.meta.image` → `meta.sources`.
- `tools/io/src/atlas/build.ts:40-50` — emit `meta.sources: [{format:'png',uri:fileName}]` instead of `meta.image`.
- `tools/io/src/atlas/merge.ts:200-210` — same.
- `tools/io/src/atlas/merge.test.ts` — fixture meta updated.
- `tools/io/tsup.config.ts` — already covers all entries; no change expected.
- `tools/vscode/extension/tools/atlas/validateAtlas.ts` — collapse to a re-export of the centralized validator.
- `tools/vscode/extension/tools/atlas/register.ts:50-90` — replace `meta.image` lookup with `meta.sources[0].uri`.
- `tools/vscode/extension/tools/atlas/sidecar.ts` — minor: type changes flow through.
- `tools/vscode/extension/tools/merge/host.ts:65-120` — read/write `meta.sources`.

### Deleted files
- None. (`tools/vscode/extension/tools/atlas/validateAtlas.ts` is collapsed but kept as a re-export to avoid touching every import site.)

---

## Task 1: Cherry-pick `packages/bake`

**Files:**
- Create: `packages/bake/**` (15 files via git checkout)
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root) — add `@three-flatland/bake` to `pnpm.overrides`

- [ ] **Step 1: Cherry-pick the package tree**

```bash
git checkout lighting-stochastic-adoption -- packages/bake
```

Then verify the files landed:

```bash
ls packages/bake/src/
# Expected: cli.ts devtimeWarn.ts devtimeWarn.test.ts discovery.ts discovery.test.ts index.ts node.ts sidecar.ts sidecar.test.ts types.ts writeSidecar.ts writeSidecar.test.ts
```

- [ ] **Step 2: Add `@three-flatland/bake` to `pnpm.overrides`**

Edit `package.json` (root). Inside `pnpm.overrides`, add:

```jsonc
"@three-flatland/bake": "workspace:*",
```

Place it alphabetically next to the other `@three-flatland/*` overrides.

- [ ] **Step 3: Install + verify build**

```bash
pnpm install
pnpm --filter @three-flatland/bake build
pnpm --filter @three-flatland/bake test
```

Expected: install picks up the new workspace package; build emits `packages/bake/dist/{cli.js,index.js,node.js,types.d.ts,...}`; tests pass.

- [ ] **Step 4: Verify the CLI binary runs**

```bash
pnpm exec flatland-bake --help
```

Expected: prints usage with no registered bakers.

- [ ] **Step 5: Commit**

```bash
git add packages/bake pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "chore: cherry-pick @three-flatland/bake from lighting-stochastic-adoption"
```

---

## Task 2: Schema migration — `meta.sources` becomes required

**Files:**
- Modify: `packages/three-flatland/src/sprites/atlas.schema.json:11-46`

The schema already has `meta.sources` (optional) and a `SourceEntry` `$def`. This task makes `sources` required, removes `image`, and adds the uniqueness/minItems constraints.

- [ ] **Step 1: Write a failing schema test**

Create `packages/three-flatland/src/sprites/atlas.schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import schema from './atlas.schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

const minimalFrames = {}
const baseSize = { w: 64, h: 64 }

describe('atlas.schema.json', () => {
  it('rejects sidecars missing meta.sources', () => {
    const json = { meta: { app: 'a', version: '1', size: baseSize, scale: '1' }, frames: minimalFrames }
    expect(validate(json)).toBe(false)
  })

  it('rejects empty meta.sources arrays', () => {
    const json = { meta: { app: 'a', version: '1', size: baseSize, scale: '1', sources: [] }, frames: minimalFrames }
    expect(validate(json)).toBe(false)
  })

  it('rejects duplicate formats in meta.sources', () => {
    const json = {
      meta: { app: 'a', version: '1', size: baseSize, scale: '1',
        sources: [{ format: 'png', uri: 'a.png' }, { format: 'png', uri: 'b.png' }] },
      frames: minimalFrames,
    }
    expect(validate(json)).toBe(false)
  })

  it('accepts a valid single-source sidecar', () => {
    const json = {
      meta: { app: 'a', version: '1', size: baseSize, scale: '1',
        sources: [{ format: 'png', uri: 'hero.png' }] },
      frames: minimalFrames,
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts multi-format sources', () => {
    const json = {
      meta: { app: 'a', version: '1', size: baseSize, scale: '1',
        sources: [{ format: 'webp', uri: 'hero.webp' }, { format: 'png', uri: 'hero.png' }] },
      frames: minimalFrames,
    }
    expect(validate(json)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/three-flatland/src/sprites/atlas.schema.test.ts
```

Expected: at least the "rejects sidecars missing meta.sources" and the duplicate-format tests fail because `sources` is currently optional and lacks uniqueness constraints.

- [ ] **Step 3: Update the schema**

Edit `packages/three-flatland/src/sprites/atlas.schema.json`:

- Change `"required": ["image", "size"]` (line 13) to `"required": ["sources", "size"]`.
- Remove the `"image": { "type": "string" }` property line (line 18).
- Replace the existing `"sources"` block (lines 24-27) with:

```json
"sources": {
  "type": "array",
  "minItems": 1,
  "uniqueItemsBy": "format",
  "items": { "$ref": "#/$defs/SourceEntry" }
}
```

ajv 2020-12 doesn't support `uniqueItemsBy` natively. Use a JSON Schema 2020-12 idiom instead — replace with:

```json
"sources": {
  "type": "array",
  "minItems": 1,
  "items": { "$ref": "#/$defs/SourceEntry" },
  "allOf": [
    {
      "type": "array",
      "uniqueItems": true
    }
  ]
}
```

`uniqueItems: true` checks structural uniqueness of items as a whole — since each source has only `{format, uri}`, two entries with the same format and same uri will be caught, but two entries with same format and different uris will not. To enforce format uniqueness specifically, add a custom keyword via the validator instead. **Update the schema to use a simple constraint we can express in standard JSON Schema:**

Replace the `sources` block with:

```json
"sources": {
  "type": "array",
  "minItems": 1,
  "items": { "$ref": "#/$defs/SourceEntry" }
}
```

Format uniqueness is enforced at the validator layer in Task 3, not in the schema. Update the duplicate-format test in step 1 to expect that it still passes the JSON Schema check but fails the augmented `validateAtlas` (we'll move that test to Task 3).

Also update the description on line 5 from `meta.image` ... to `meta.sources` ... .

- [ ] **Step 4: Update the failing test**

In `atlas.schema.test.ts`, remove the "rejects duplicate formats" test (it moves to Task 3).

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/three-flatland/src/sprites/atlas.schema.test.ts
```

Expected: all 4 remaining tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/three-flatland/src/sprites/atlas.schema.json packages/three-flatland/src/sprites/atlas.schema.test.ts
git commit -m "feat(three-flatland): require meta.sources, drop meta.image from atlas schema"
```

---

## Task 3: Centralized `validateAtlas` with format-uniqueness

**Files:**
- Create: `packages/three-flatland/src/sprites/atlas.schema.ts`
- Modify: `packages/three-flatland/package.json` — add `./sprites/atlas` export
- Modify: `packages/three-flatland/src/sprites/index.ts` — re-export from new file
- Modify: `tools/vscode/extension/tools/atlas/validateAtlas.ts` — collapse to re-export

- [ ] **Step 1: Write failing test for format uniqueness**

Append to `packages/three-flatland/src/sprites/atlas.schema.test.ts`:

```ts
import { validateAtlas, formatAtlasErrors } from './atlas.schema'

describe('validateAtlas (format-uniqueness layer)', () => {
  it('rejects duplicate formats in meta.sources', () => {
    const json = {
      meta: { app: 'a', version: '1', size: { w: 64, h: 64 }, scale: '1',
        sources: [{ format: 'png', uri: 'a.png' }, { format: 'png', uri: 'b.png' }] },
      frames: {},
    }
    expect(validateAtlas(json)).toBe(false)
    expect(formatAtlasErrors()).toMatch(/duplicate format/i)
  })

  it('accepts unique formats', () => {
    const json = {
      meta: { app: 'a', version: '1', size: { w: 64, h: 64 }, scale: '1',
        sources: [{ format: 'png', uri: 'a.png' }, { format: 'webp', uri: 'a.webp' }] },
      frames: {},
    }
    expect(validateAtlas(json)).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/three-flatland/src/sprites/atlas.schema.test.ts
```

Expected: import error — `./atlas.schema` doesn't exist yet.

- [ ] **Step 3: Create `atlas.schema.ts`**

Create `packages/three-flatland/src/sprites/atlas.schema.ts`:

```ts
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import schema from './atlas.schema.json' with { type: 'json' }
import type { SpriteSheetJSONHash } from './types'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const ajvValidate: ValidateFunction = ajv.compile(schema as object)

let lastErrors: string[] = []

export const atlasSchema = schema

export function validateAtlas(json: unknown): json is SpriteSheetJSONHash {
  lastErrors = []
  if (!ajvValidate(json)) {
    lastErrors = (ajvValidate.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`,
    )
    return false
  }
  const sources = (json as { meta: { sources: { format: string }[] } }).meta.sources
  const seen = new Set<string>()
  for (const s of sources) {
    if (seen.has(s.format)) {
      lastErrors.push(`/meta/sources duplicate format "${s.format}"`)
      return false
    }
    seen.add(s.format)
  }
  return true
}

export function formatAtlasErrors(): string {
  return lastErrors.join('; ')
}

export function assertValidAtlas(json: unknown): asserts json is SpriteSheetJSONHash {
  if (!validateAtlas(json)) {
    throw new Error(`Atlas JSON failed schema: ${formatAtlasErrors()}`)
  }
}
```

If `SpriteSheetJSONHash` doesn't exist as a type, replace `SpriteSheetJSONHash` with `unknown` for now (it can be tightened in a follow-up).

- [ ] **Step 4: Add the package export**

Edit `packages/three-flatland/package.json`. In `exports`, add (alphabetically near the existing sprites exports):

```jsonc
"./sprites/atlas": {
  "source": "./src/sprites/atlas.schema.ts",
  "import": {
    "types": "./dist/sprites/atlas.schema.d.ts",
    "default": "./dist/sprites/atlas.schema.js"
  }
},
```

- [ ] **Step 5: Re-export from sprites barrel**

Edit `packages/three-flatland/src/sprites/index.ts` and append:

```ts
export { validateAtlas, assertValidAtlas, formatAtlasErrors, atlasSchema } from './atlas.schema'
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run packages/three-flatland/src/sprites/atlas.schema.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Collapse the duplicate validator in tools/vscode**

Replace the contents of `tools/vscode/extension/tools/atlas/validateAtlas.ts` with:

```ts
// Re-export of the centralized atlas validator. The authoritative
// implementation lives in packages/three-flatland/src/sprites/atlas.schema.ts
// so the runtime, future tools, and this extension all share one ajv compile
// and one format-uniqueness check.
export {
  validateAtlas,
  assertValidAtlas,
  formatAtlasErrors,
} from 'three-flatland/sprites/atlas'
```

The existing `import type { AtlasJson } from './sidecar'` is no longer needed here; consumers that need the type already import it from `./sidecar`.

- [ ] **Step 8: Build + typecheck the vscode extension**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: build succeeds. (The collapsed `validateAtlas.ts` re-exports keep call-site imports working.)

- [ ] **Step 9: Commit**

```bash
git add packages/three-flatland/src/sprites/atlas.schema.ts packages/three-flatland/src/sprites/atlas.schema.test.ts packages/three-flatland/src/sprites/index.ts packages/three-flatland/package.json tools/vscode/extension/tools/atlas/validateAtlas.ts
git commit -m "feat(three-flatland): centralize validateAtlas with format-uniqueness check"
```

---

## Task 4: Update `AtlasJson` type and writers in `tools/io`

**Files:**
- Modify: `tools/io/src/atlas/types.ts:45-60`
- Modify: `tools/io/src/atlas/build.ts:40-50`
- Modify: `tools/io/src/atlas/merge.ts:200-210`
- Modify: `tools/io/src/atlas/merge.test.ts` (fixture meta)

- [ ] **Step 1: Write the failing test**

Create `tools/io/src/atlas/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildAtlasJson } from './build'

describe('buildAtlasJson', () => {
  it('emits meta.sources with a single PNG entry instead of meta.image', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [],
    })
    expect(json.meta).not.toHaveProperty('image')
    expect(json.meta.sources).toEqual([{ format: 'png', uri: 'hero.png' }])
  })

  it('infers the format from the source extension', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.webp', width: 64, height: 64 },
      rects: [],
    })
    expect(json.meta.sources).toEqual([{ format: 'webp', uri: 'hero.webp' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tools/io/src/atlas/build.test.ts
```

Expected: FAIL — `meta.image` still present, `meta.sources` missing.

- [ ] **Step 3: Update `AtlasJson` type**

Edit `tools/io/src/atlas/types.ts`. Replace `image: string` (around line 50) with:

```ts
sources: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
```

Remove the `image: string` line.

- [ ] **Step 4: Update `buildAtlasJson`**

Edit `tools/io/src/atlas/build.ts`. Replace the `image: input.image.fileName,` line (around line 42) with:

```ts
sources: [{ format: formatFromFileName(input.image.fileName), uri: input.image.fileName }],
```

Add the helper at the top of the file:

```ts
function formatFromFileName(name: string): 'png' | 'webp' | 'avif' | 'ktx2' {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.') + 1)
  if (ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'ktx2') return ext
  return 'png'
}
```

- [ ] **Step 5: Update `computeMerge` in `tools/io/src/atlas/merge.ts`**

Around line 203, replace the `image: ...` block in the constructed `meta` with:

```ts
sources: [{ format: 'png', uri: input.outputFileName }],
```

(Merge always emits PNG today; multi-format merge is phase 2.)

- [ ] **Step 6: Update merge test fixtures**

In `tools/io/src/atlas/merge.test.ts`, replace each occurrence of `image: '<name>.png'` inside `meta` with:

```ts
sources: [{ format: 'png' as const, uri: '<name>.png' }]
```

- [ ] **Step 7: Add `tools/io/src/atlas/build.test.ts` to the tsup entries**

Tests don't go in `tsup.config.ts`. Skip — but verify no new non-test source file was added that needs to.

- [ ] **Step 8: Run all io tests**

```bash
pnpm vitest run tools/io/src/atlas/
```

Expected: PASS.

- [ ] **Step 9: Build io**

```bash
pnpm --filter @three-flatland/io build
```

Expected: success.

- [ ] **Step 10: Commit**

```bash
git add tools/io/src/atlas/types.ts tools/io/src/atlas/build.ts tools/io/src/atlas/build.test.ts tools/io/src/atlas/merge.ts tools/io/src/atlas/merge.test.ts
git commit -m "feat(io/atlas): emit meta.sources instead of meta.image"
```

---

## Task 5: Update VSCode atlas + merge tool consumers

**Files:**
- Modify: `tools/vscode/extension/tools/atlas/register.ts:50-90`
- Modify: `tools/vscode/extension/tools/merge/host.ts:65-120`

- [ ] **Step 1: Update `register.ts` to read `meta.sources[0].uri`**

Open `tools/vscode/extension/tools/atlas/register.ts`. Find the block (around line 67) that reads `meta.image` and resolves it against the sidecar's parent dir. Replace `meta.image` reads with `meta.sources[0]?.uri` and update the comments accordingly.

Code shape:

```ts
// Primary path: pick the first entry from meta.sources.
const meta = (parsed as { meta?: { sources?: { uri?: string }[] } }).meta
const sourceUri = meta?.sources?.[0]?.uri
if (sourceUri) {
  // resolve against sidecar parent dir as before
  ...
}
```

The fallback path (filename pattern when sidecar is unreadable) is unchanged.

- [ ] **Step 2: Update `merge/host.ts`**

Open `tools/vscode/extension/tools/merge/host.ts`. Around line 70, replace:

```ts
throw new Error('meta.image missing')
```

with reading + validating `meta.sources`:

```ts
const meta = (sidecar as { meta?: { sources?: { format?: string; uri?: string }[] } }).meta
const png = meta?.sources?.find((s) => s.format === 'png')
if (!png?.uri) {
  throw new Error('meta.sources[png] missing — atlas sidecar has no PNG source for merge input')
}
const imagePath = png.uri
```

Use `imagePath` everywhere the old `meta.image` value was used downstream.

Around line 115, replace:

```ts
;(sidecar as { meta: { image: string } }).meta.image = pngPath.split('/').pop() ?? 'merged.png'
```

with:

```ts
const fileName = pngPath.split('/').pop() ?? 'merged.png'
;(sidecar as { meta: { sources: { format: string; uri: string }[] } }).meta.sources = [
  { format: 'png', uri: fileName },
]
```

- [ ] **Step 3: Build the vscode extension**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: TypeScript compiles cleanly with the updated `AtlasJson` type from `@three-flatland/io/atlas`.

- [ ] **Step 4: Run all related tests**

```bash
pnpm vitest run tools/io/src/atlas/ packages/three-flatland/src/sprites/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/vscode/extension/tools/atlas/register.ts tools/vscode/extension/tools/merge/host.ts
git commit -m "feat(vscode): atlas+merge tools read/write meta.sources"
```

---

## Task 6: `@three-flatland/image` package skeleton

**Files:**
- Create: `packages/image/package.json`
- Create: `packages/image/tsconfig.json`
- Create: `packages/image/tsup.config.ts`
- Create: `packages/image/src/types.ts`
- Create: `packages/image/src/index.ts`
- Modify: `pnpm-workspace.yaml` — add jsquash codec deps to catalog
- Modify: root `package.json` — add `@three-flatland/image` to `pnpm.overrides`

- [ ] **Step 1: Add codec deps to workspace catalog**

Edit `pnpm-workspace.yaml`. Append to the `catalog:` block:

```yaml
'@jsquash/png': ^3.1.1
'@jsquash/webp': ^1.5.0
'@jsquash/avif': ^1.7.0
```

- [ ] **Step 2: Create `packages/image/package.json`**

```jsonc
{
  "name": "@three-flatland/image",
  "version": "0.0.0",
  "private": true,
  "description": "WASM image encoder package — PNG/WebP/AVIF/KTX2 with browser+Node+CLI surfaces",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "node": {
        "types": "./dist/node.d.ts",
        "import": "./dist/node.js"
      },
      "browser": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "default": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    },
    "./node": {
      "source": "./src/node.ts",
      "types": "./dist/node.d.ts",
      "import": "./dist/node.js"
    },
    "./cli": {
      "source": "./src/cli.ts",
      "types": "./dist/cli.d.ts",
      "import": "./dist/cli.js"
    }
  },
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@three-flatland/bake": "workspace:*",
    "@jsquash/png": "catalog:",
    "@jsquash/webp": "catalog:",
    "@jsquash/avif": "catalog:"
  },
  "flatland": {
    "bake": [
      { "name": "encode", "description": "Encode image to PNG/WebP/AVIF/KTX2", "entry": "./dist/cli.js" }
    ]
  }
}
```

KTX2/BasisU dependency is added in Task 11 after the integration approach is settled.

- [ ] **Step 3: Create `packages/image/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "**/__fixtures__/**"]
}
```

(If `tsconfig.base.json` doesn't exist at repo root, copy `packages/three-flatland/tsconfig.json`'s shape.)

- [ ] **Step 4: Create `packages/image/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/node.ts',
    'src/cli.ts',
    'src/encode.ts',
    'src/decode.ts',
    'src/encode.node.ts',
    'src/memory.ts',
    'src/types.ts',
    'src/codecs/png.ts',
    'src/codecs/webp.ts',
    'src/codecs/avif.ts',
    'src/codecs/ktx2.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
})
```

- [ ] **Step 5: Create `packages/image/src/types.ts`**

```ts
export type EncodeFormat = 'png' | 'webp' | 'avif' | 'ktx2'

export interface ImageEncodeOptions {
  format: EncodeFormat
  quality?: number
  mode?: 'lossy' | 'lossless'
  basis?: { mode?: 'etc1s' | 'uastc'; mipmaps?: boolean; uastcLevel?: 0 | 1 | 2 | 3 | 4 }
  alpha?: boolean
}

export interface GpuMemoryEstimate {
  loader: 'three-default' | 'three-ktx' | 'spark'
  gpuFormat: string
  bytes: number
  mipBytes?: number
  measured?: boolean
}
```

- [ ] **Step 6: Create stub `packages/image/src/index.ts`**

```ts
export type {
  EncodeFormat,
  ImageEncodeOptions,
  GpuMemoryEstimate,
} from './types'
```

- [ ] **Step 7: Add `@three-flatland/image` to root overrides**

Edit `package.json`. Inside `pnpm.overrides`:

```jsonc
"@three-flatland/image": "workspace:*",
```

Place alphabetically.

- [ ] **Step 8: Install and build**

```bash
pnpm install
pnpm --filter @three-flatland/image build
```

Expected: install resolves the new workspace package; build emits a stub `dist/index.js` and `dist/types.js`.

- [ ] **Step 9: Commit**

```bash
git add packages/image pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat(image): scaffold @three-flatland/image package"
```

---

## Task 7: PNG codec — round-trip with byte equality

**Files:**
- Create: `packages/image/src/__fixtures__/tiny.png` — 4×4 RGBA PNG (build via Node script in step 1)
- Create: `packages/image/src/codecs/png.ts`
- Create: `packages/image/src/codecs/png.test.ts`

- [ ] **Step 1: Build the fixture**

Run from repo root:

```bash
node -e "import('zlib').then(z=>{const w=4,h=4,d=Buffer.alloc(w*h*4);for(let i=0;i<d.length;i+=4){d[i]=i*4;d[i+1]=128;d[i+2]=255-i;d[i+3]=255}require('fs').writeFileSync('packages/image/src/__fixtures__/raw-rgba.bin',d)})"
mkdir -p packages/image/src/__fixtures__
```

Generate the fixture by encoding the raw RGBA via the existing `pngjs` (already a transitive dep via `@three-flatland/bake`):

```bash
node -e "
const fs = require('fs')
const { PNG } = require('pngjs')
const png = new PNG({ width: 4, height: 4 })
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = (i * 4) & 0xff
  png.data[i+1] = 128
  png.data[i+2] = (255 - i) & 0xff
  png.data[i+3] = 255
}
fs.writeFileSync('packages/image/src/__fixtures__/tiny.png', PNG.sync.write(png))
"
```

Verify:

```bash
ls -la packages/image/src/__fixtures__/tiny.png
file packages/image/src/__fixtures__/tiny.png
```

Expected: ~120 byte PNG.

- [ ] **Step 2: Write the failing round-trip test**

Create `packages/image/src/codecs/png.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodePng, decodePng } from './png'

const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

describe('PNG codec', () => {
  it('decodes a fixture to RGBA8 ImageData', async () => {
    const img = await decodePng(new Uint8Array(fixture))
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
    expect(img.data.length).toBe(4 * 4 * 4)
  })

  it('round-trips RGBA8 bytes exactly', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const reencoded = await encodePng(decoded)
    const redecoded = await decodePng(reencoded)
    expect(redecoded.data).toEqual(decoded.data)
  })
})
```

- [ ] **Step 3: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/codecs/png.test.ts
```

Expected: FAIL — `./png` module doesn't exist.

- [ ] **Step 4: Implement the codec wrapper**

Create `packages/image/src/codecs/png.ts`:

```ts
import { decode } from '@jsquash/png/decode'
import { encode } from '@jsquash/png/encode'

export async function encodePng(image: ImageData): Promise<Uint8Array> {
  const buf = await encode(image)
  return new Uint8Array(buf)
}

export async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  return await decode(bytes)
}
```

- [ ] **Step 5: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/codecs/png.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build the package**

```bash
pnpm --filter @three-flatland/image build
```

Expected: emits `dist/codecs/png.js`.

- [ ] **Step 7: Commit**

```bash
git add packages/image/src/__fixtures__/tiny.png packages/image/src/codecs/png.ts packages/image/src/codecs/png.test.ts
git commit -m "feat(image): PNG codec via @jsquash/png"
```

---

## Task 8: WebP codec — round-trip with perceptual ΔE

**Files:**
- Create: `packages/image/src/codecs/webp.ts`
- Create: `packages/image/src/codecs/webp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/image/src/codecs/webp.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeWebp, decodeWebp } from './webp'
import { decodePng } from './png'

const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error('size mismatch')
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

describe('WebP codec', () => {
  it('decodes its own lossless output exactly', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const webp = await encodeWebp(decoded, { mode: 'lossless' })
    const back = await decodeWebp(webp)
    expect(back.data).toEqual(decoded.data)
  })

  it('lossy round-trip stays under MAD threshold', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const webp = await encodeWebp(decoded, { quality: 80 })
    const back = await decodeWebp(webp)
    const mad = meanAbsoluteDifference(decoded.data, back.data)
    expect(mad).toBeLessThan(8) // 8/255 mean per channel — generous for tiny fixtures
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/codecs/webp.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the codec wrapper**

Create `packages/image/src/codecs/webp.ts`:

```ts
import { decode } from '@jsquash/webp/decode'
import { encode } from '@jsquash/webp/encode'

export interface WebpOptions {
  quality?: number
  mode?: 'lossy' | 'lossless'
}

export async function encodeWebp(image: ImageData, opts: WebpOptions = {}): Promise<Uint8Array> {
  const lossless = opts.mode === 'lossless'
  const buf = await encode(image, {
    quality: opts.quality ?? 80,
    lossless: lossless ? 1 : 0,
    method: 4,
  })
  return new Uint8Array(buf)
}

export async function decodeWebp(bytes: Uint8Array): Promise<ImageData> {
  return await decode(bytes)
}
```

- [ ] **Step 4: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/codecs/webp.test.ts
```

Expected: PASS. If lossless round-trip fails by exactly-equal bytes, log the diff to confirm @jsquash's lossless mode works on this Node version, and relax to MAD < 1 if needed (document in commit).

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/codecs/webp.ts packages/image/src/codecs/webp.test.ts
git commit -m "feat(image): WebP codec via @jsquash/webp"
```

---

## Task 9: AVIF codec — round-trip with perceptual ΔE

**Files:**
- Create: `packages/image/src/codecs/avif.ts`
- Create: `packages/image/src/codecs/avif.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/image/src/codecs/avif.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeAvif, decodeAvif } from './avif'
import { decodePng } from './png'

const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error('size mismatch')
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

describe('AVIF codec', () => {
  it('round-trips lossy stays under MAD threshold', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const avif = await encodeAvif(decoded, { quality: 55 })
    const back = await decodeAvif(avif)
    const mad = meanAbsoluteDifference(decoded.data, back.data)
    expect(mad).toBeLessThan(20) // AVIF on a 4×4 fixture is noisier; loosen the threshold
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/codecs/avif.test.ts
```

- [ ] **Step 3: Implement the codec wrapper**

Create `packages/image/src/codecs/avif.ts`:

```ts
import { decode } from '@jsquash/avif/decode'
import { encode } from '@jsquash/avif/encode'

export interface AvifOptions {
  quality?: number
  mode?: 'lossy' | 'lossless'
}

export async function encodeAvif(image: ImageData, opts: AvifOptions = {}): Promise<Uint8Array> {
  const lossless = opts.mode === 'lossless'
  const buf = await encode(image, {
    quality: opts.quality ?? 50,
    qualityAlpha: -1,
    lossless,
    speed: 6,
  })
  return new Uint8Array(buf)
}

export async function decodeAvif(bytes: Uint8Array): Promise<ImageData> {
  return await decode(bytes)
}
```

- [ ] **Step 4: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/codecs/avif.test.ts
```

Note: AVIF in Node has historically been Node-version-sensitive. If decode/encode throws "WebAssembly memory out of bounds" or similar, this is a known @jsquash/avif quirk on certain Node versions. Document the failure in the commit and proceed to KTX2; revisit AVIF before phase 2 starts.

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/codecs/avif.ts packages/image/src/codecs/avif.test.ts
git commit -m "feat(image): AVIF codec via @jsquash/avif"
```

---

## Task 10: KTX2/BasisU codec — research + round-trip

**Files:**
- Create: `packages/image/src/codecs/ktx2.ts`
- Create: `packages/image/src/codecs/ktx2.test.ts`
- Modify: `packages/image/package.json` — add KTX2 dep

The BasisU encoder distribution requires a research step before code. The most common npm-published wrappers are `basis_universal`, `gl-basis-universal`, or vendoring the `webgl/encoder/build/basis_encoder.{js,wasm}` files from the `BinomialLLC/basis_universal` GitHub release.

- [ ] **Step 1: Research available BasisU encoder npm packages**

Run:

```bash
pnpm view basis-universal versions 2>&1 | tail -5
pnpm view @callstack/react-native-basis-universal versions 2>&1 | tail -5
pnpm view three versions 2>&1 | tail -1
```

`three` ships a transcoder (`KTX2Loader` uses `basis_transcoder.wasm`) but **not an encoder**. Check three's published files:

```bash
ls node_modules/three/examples/jsm/libs/basis/ 2>/dev/null
```

Expected: shows `basis_transcoder.{js,wasm}` only — no encoder.

The pragmatic option for phase 1 is to vendor the encoder build directly from BinomialLLC's `basis_universal` repo. Their `webgl/encoder/build/` contains a published `basis_encoder.js` + `basis_encoder.wasm`.

- [ ] **Step 2: Vendor the BasisU encoder**

Download the encoder from a pinned commit of `BinomialLLC/basis_universal`:

```bash
mkdir -p packages/image/vendor/basis
curl -L -o packages/image/vendor/basis/basis_encoder.js \
  https://raw.githubusercontent.com/BinomialLLC/basis_universal/v1_50_0_2/webgl/encoder/build/basis_encoder.js
curl -L -o packages/image/vendor/basis/basis_encoder.wasm \
  https://raw.githubusercontent.com/BinomialLLC/basis_universal/v1_50_0_2/webgl/encoder/build/basis_encoder.wasm
```

If the tagged path doesn't resolve, try `master`. Verify both files are non-empty (`.wasm` should be 1–3 MB).

- [ ] **Step 3: Add the vendor dir to `tsup.config.ts` copy step + package files**

Edit `packages/image/package.json` `files`:

```jsonc
"files": ["dist", "vendor"]
```

Edit `packages/image/tsup.config.ts` to copy the vendor dir to dist on build:

```ts
import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: [/* … existing entries … */],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
  onSuccess: async () => {
    mkdirSync('dist/vendor/basis', { recursive: true })
    for (const f of readdirSync('vendor/basis')) {
      copyFileSync(join('vendor/basis', f), join('dist/vendor/basis', f))
    }
  },
})
```

- [ ] **Step 4: Write the failing round-trip test**

Create `packages/image/src/codecs/ktx2.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeKtx2 } from './ktx2'
import { decodePng } from './png'

const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

describe('KTX2/BasisU codec', () => {
  it('encodes a 4×4 RGBA fixture to a non-empty KTX2 container', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128 })
    expect(ktx2.length).toBeGreaterThan(64)
    // KTX2 magic: « K T X   2 0 » BE = AB 4B 54 58 20 32 30 BB BD 0A 1A 0A
    expect([ktx2[0], ktx2[1], ktx2[2]]).toEqual([0xab, 0x4b, 0x54])
  })
})
```

(Decode is out of scope for phase 1 — KTX2 transcode is what `KTX2Loader` does at runtime; we don't need a separate round-trip decode test in this package.)

- [ ] **Step 5: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/codecs/ktx2.test.ts
```

- [ ] **Step 6: Implement the codec wrapper**

Create `packages/image/src/codecs/ktx2.ts`:

```ts
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export interface Ktx2Options {
  mode?: 'etc1s' | 'uastc'
  quality?: number
  mipmaps?: boolean
  uastcLevel?: 0 | 1 | 2 | 3 | 4
}

let modPromise: Promise<unknown> | null = null

async function loadEncoder(): Promise<{ BasisEncoder: new () => unknown }> {
  if (!modPromise) {
    const here = typeof __dirname === 'string'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url))
    const vendorJs = join(here, '..', 'vendor', 'basis', 'basis_encoder.js')
    const vendorWasm = join(here, '..', 'vendor', 'basis', 'basis_encoder.wasm')
    const require = createRequire(import.meta.url)
    const module = require(vendorJs) as (cfg: { locateFile: (p: string) => string }) => Promise<unknown>
    modPromise = module({ locateFile: () => vendorWasm })
  }
  return (await modPromise) as { BasisEncoder: new () => unknown }
}

export async function encodeKtx2(image: ImageData, opts: Ktx2Options = {}): Promise<Uint8Array> {
  const { BasisEncoder } = await loadEncoder()
  const enc = new BasisEncoder() as {
    setSliceSourceImage: (slice: number, data: Uint8Array, w: number, h: number, isPng: boolean) => void
    setUASTC: (b: boolean) => void
    setMipGen: (b: boolean) => void
    setQualityLevel: (q: number) => void
    setPackUASTCFlags: (f: number) => void
    setKTX2File: (b: boolean) => void
    encode: (out: Uint8Array) => number
    delete: () => void
  }
  try {
    enc.setSliceSourceImage(0, new Uint8Array(image.data.buffer), image.width, image.height, false)
    enc.setKTX2File(true)
    enc.setUASTC(opts.mode === 'uastc')
    enc.setMipGen(!!opts.mipmaps)
    enc.setQualityLevel(opts.quality ?? 128)
    if (opts.uastcLevel !== undefined) enc.setPackUASTCFlags(opts.uastcLevel)
    const out = new Uint8Array(image.width * image.height * 4 + 1024)
    const written = enc.encode(out)
    if (written === 0) throw new Error('basis_encoder returned 0 bytes')
    return out.slice(0, written)
  } finally {
    enc.delete()
  }
}
```

The exact API names above are the standard BinomialLLC encoder bindings. If a method name differs in the vendored build (the encoder is sometimes regenerated with different exports between releases), update the cast types and method calls to match what the vendored `basis_encoder.js` actually exports. Inspect with:

```bash
grep -E 'BasisEncoder.prototype\.\w+ ' packages/image/vendor/basis/basis_encoder.js | head -30
```

- [ ] **Step 7: Run, verify it passes**

```bash
pnpm --filter @three-flatland/image build
pnpm vitest run packages/image/src/codecs/ktx2.test.ts
```

Expected: PASS — produces a valid KTX2 file with the magic header bytes.

- [ ] **Step 8: Commit**

```bash
git add packages/image/vendor packages/image/src/codecs/ktx2.ts packages/image/src/codecs/ktx2.test.ts packages/image/tsup.config.ts packages/image/package.json
git commit -m "feat(image): KTX2/BasisU codec via vendored basis_encoder.wasm"
```

---

## Task 11: Public API dispatch (`encodeImage` / `decodeImage`)

**Files:**
- Create: `packages/image/src/encode.ts`
- Create: `packages/image/src/decode.ts`
- Create: `packages/image/src/encode.test.ts`
- Modify: `packages/image/src/index.ts`

- [ ] **Step 1: Write the failing dispatch test**

Create `packages/image/src/encode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeImage, decodeImage } from './index'
import { decodePng } from './codecs/png'

const fixture = readFileSync(join(__dirname, '__fixtures__/tiny.png'))

describe('encodeImage / decodeImage dispatch', () => {
  it('routes png to the PNG codec', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const out = await encodeImage(decoded, { format: 'png' })
    const back = await decodeImage(out, 'png')
    expect(back.data).toEqual(decoded.data)
  })

  it('routes webp to the WebP codec', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const out = await encodeImage(decoded, { format: 'webp', mode: 'lossless' })
    const back = await decodeImage(out, 'webp')
    expect(back.width).toBe(decoded.width)
    expect(back.height).toBe(decoded.height)
  })

  it('throws for an unknown format', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    await expect(encodeImage(decoded, { format: 'bogus' as never })).rejects.toThrow(/unknown format/i)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/encode.test.ts
```

- [ ] **Step 3: Implement encode dispatch**

Create `packages/image/src/encode.ts`:

```ts
import type { ImageEncodeOptions } from './types'
import { encodePng } from './codecs/png'
import { encodeWebp } from './codecs/webp'
import { encodeAvif } from './codecs/avif'
import { encodeKtx2 } from './codecs/ktx2'

export async function encodeImage(pixels: ImageData, opts: ImageEncodeOptions): Promise<Uint8Array> {
  switch (opts.format) {
    case 'png':  return encodePng(pixels)
    case 'webp': return encodeWebp(pixels, { quality: opts.quality, mode: opts.mode })
    case 'avif': return encodeAvif(pixels, { quality: opts.quality, mode: opts.mode })
    case 'ktx2': return encodeKtx2(pixels, opts.basis)
    default:     throw new Error(`unknown format: ${(opts as { format: string }).format}`)
  }
}
```

- [ ] **Step 4: Implement decode dispatch**

Create `packages/image/src/decode.ts`:

```ts
import type { EncodeFormat } from './types'
import { decodePng } from './codecs/png'
import { decodeWebp } from './codecs/webp'
import { decodeAvif } from './codecs/avif'

export async function decodeImage(bytes: Uint8Array, format: EncodeFormat): Promise<ImageData> {
  switch (format) {
    case 'png':  return decodePng(bytes)
    case 'webp': return decodeWebp(bytes)
    case 'avif': return decodeAvif(bytes)
    case 'ktx2': throw new Error('KTX2 decode is not supported in this package — use three.js KTX2Loader at runtime')
    default:     throw new Error(`unknown format: ${format as string}`)
  }
}
```

- [ ] **Step 5: Update `src/index.ts`**

```ts
export type { EncodeFormat, ImageEncodeOptions, GpuMemoryEstimate } from './types'
export { encodeImage } from './encode'
export { decodeImage } from './decode'
```

- [ ] **Step 6: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/encode.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/image/src/encode.ts packages/image/src/decode.ts packages/image/src/index.ts packages/image/src/encode.test.ts
git commit -m "feat(image): encodeImage/decodeImage public dispatch"
```

---

## Task 12: GPU memory estimator (analytic baseline)

**Files:**
- Create: `packages/image/src/memory.ts`
- Create: `packages/image/src/memory.test.ts`
- Modify: `packages/image/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/image/src/memory.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { estimateGpuMemory } from './memory'

describe('estimateGpuMemory', () => {
  it('three-default loader: PNG → RGBA8 = w*h*4', async () => {
    const [r] = await estimateGpuMemory({ width: 256, height: 256, alpha: true, format: 'png' }, 'three-default')
    expect(r).toBeDefined()
    expect(r!.gpuFormat).toBe('RGBA8')
    expect(r!.bytes).toBe(256 * 256 * 4)
    expect(r!.measured).toBeFalsy()
  })

  it('three-ktx loader: KTX2 → BC7 = w*h*1', async () => {
    const [r] = await estimateGpuMemory({ width: 1024, height: 1024, alpha: true, format: 'ktx2' }, 'three-ktx')
    expect(r!.gpuFormat).toBe('BC7')
    expect(r!.bytes).toBe(1024 * 1024)
  })

  it('all loaders returns 3 entries', async () => {
    const r = await estimateGpuMemory({ width: 512, height: 512, alpha: true, format: 'webp' }, 'all')
    expect(r.map((e) => e.loader).sort()).toEqual(['spark', 'three-default', 'three-ktx'])
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/memory.test.ts
```

- [ ] **Step 3: Implement the analytic estimator**

Create `packages/image/src/memory.ts`:

```ts
import type { EncodeFormat, GpuMemoryEstimate } from './types'

export interface SourceShape {
  width: number
  height: number
  alpha: boolean
  format: EncodeFormat
}

const LOADERS = ['three-default', 'three-ktx', 'spark'] as const
type Loader = (typeof LOADERS)[number] | 'all'

export async function estimateGpuMemory(source: SourceShape, loader: Loader): Promise<GpuMemoryEstimate[]> {
  if (loader === 'all') {
    return LOADERS.flatMap((l) => analytic(source, l))
  }
  return analytic(source, loader)
}

function analytic(source: SourceShape, loader: typeof LOADERS[number]): GpuMemoryEstimate[] {
  const px = source.width * source.height
  if (loader === 'three-default') {
    return [{ loader, gpuFormat: 'RGBA8', bytes: px * 4 }]
  }
  if (loader === 'three-ktx') {
    return [{ loader, gpuFormat: source.alpha ? 'BC7' : 'BC1', bytes: px }]
  }
  // spark — analytic fallback (browser layer can promote to measured)
  return [{ loader, gpuFormat: source.alpha ? 'BC7' : 'BC1', bytes: px, measured: false }]
}
```

- [ ] **Step 4: Add to public surface**

Append to `packages/image/src/index.ts`:

```ts
export { estimateGpuMemory } from './memory'
```

- [ ] **Step 5: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/memory.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src/memory.ts packages/image/src/memory.test.ts packages/image/src/index.ts
git commit -m "feat(image): analytic GPU memory estimator"
```

---

## Task 13: Node file I/O (`encodeImageFile`) with atomic write + `--force`

**Files:**
- Create: `packages/image/src/encode.node.ts`
- Create: `packages/image/src/encode.node.test.ts`
- Create: `packages/image/src/node.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/image/src/encode.node.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeImageFile } from './encode.node'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fl-image-'))
})

describe('encodeImageFile', () => {
  it('writes <basename>.<format> next to input when output is null', async () => {
    const src = join(__dirname, '__fixtures__/tiny.png')
    const out = await encodeImageFile(src, null, { format: 'webp', quality: 80 })
    expect(out.endsWith('tiny.webp')).toBe(true)
    expect(existsSync(out)).toBe(true)
    rmSync(out)
  })

  it('errors when output exists without force', async () => {
    const src = join(__dirname, '__fixtures__/tiny.png')
    const dest = join(dir, 'tiny.webp')
    writeFileSync(dest, 'old')
    await expect(encodeImageFile(src, dest, { format: 'webp' })).rejects.toThrow(/refusing to overwrite/i)
  })

  it('overwrites with force=true', async () => {
    const src = join(__dirname, '__fixtures__/tiny.png')
    const dest = join(dir, 'tiny.webp')
    writeFileSync(dest, 'old')
    await encodeImageFile(src, dest, { format: 'webp' }, { force: true })
    const bytes = readFileSync(dest)
    expect(bytes.length).toBeGreaterThan(10)
    expect(bytes.toString('utf8')).not.toBe('old')
  })

  it('atomic write — leaves no .tmp on success', async () => {
    const src = join(__dirname, '__fixtures__/tiny.png')
    const dest = join(dir, 'a.webp')
    await encodeImageFile(src, dest, { format: 'webp' })
    expect(existsSync(dest + '.tmp')).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/encode.node.test.ts
```

- [ ] **Step 3: Implement file I/O**

Create `packages/image/src/encode.node.ts`:

```ts
import { readFile, writeFile, rename, stat } from 'node:fs/promises'
import { extname, join, dirname, basename } from 'node:path'
import { encodeImage } from './encode'
import { decodeImage } from './decode'
import type { EncodeFormat, ImageEncodeOptions } from './types'

export interface FileWriteOptions {
  force?: boolean
}

export async function encodeImageFile(
  input: string,
  output: string | null,
  opts: ImageEncodeOptions,
  fileOpts: FileWriteOptions = {},
): Promise<string> {
  const target = output ?? defaultOutputPath(input, opts.format)
  if (!fileOpts.force && (await exists(target))) {
    throw new Error(`refusing to overwrite existing file ${target} — pass --force to overwrite`)
  }

  const sourceBytes = await readFile(input)
  const sourceFormat = formatFromPath(input)
  const image = await decodeImage(new Uint8Array(sourceBytes), sourceFormat)
  const encoded = await encodeImage(image, opts)

  const tmp = target + '.tmp'
  await writeFile(tmp, encoded)
  await rename(tmp, target)
  return target
}

function defaultOutputPath(input: string, format: EncodeFormat): string {
  const ext = extname(input)
  const base = basename(input, ext)
  return join(dirname(input), `${base}.${format}`)
}

function formatFromPath(p: string): EncodeFormat {
  const ext = extname(p).toLowerCase().slice(1)
  if (ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'ktx2') return ext
  throw new Error(`cannot infer format from ${p}`)
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}
```

- [ ] **Step 4: Create `node.ts` re-export**

Create `packages/image/src/node.ts`:

```ts
export * from './index'
export { encodeImageFile } from './encode.node'
export type { FileWriteOptions } from './encode.node'
```

- [ ] **Step 5: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/encode.node.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src/encode.node.ts packages/image/src/encode.node.test.ts packages/image/src/node.ts
git commit -m "feat(image/node): encodeImageFile with atomic write + force semantics"
```

---

## Task 14: Batch encode with worker_threads pool

**Files:**
- Modify: `packages/image/src/encode.node.ts` — add `encodeImageBatch`
- Modify: `packages/image/src/encode.node.test.ts`
- Modify: `packages/image/src/node.ts`

- [ ] **Step 1: Write the failing batch test**

Append to `packages/image/src/encode.node.test.ts`:

```ts
import { encodeImageBatch } from './encode.node'

describe('encodeImageBatch', () => {
  it('completes all items even if one fails, reports per-item status', async () => {
    const src = join(__dirname, '__fixtures__/tiny.png')
    const items = [
      { input: src, output: join(dir, 'a.webp'), opts: { format: 'webp' as const } },
      { input: '/does/not/exist.png', output: join(dir, 'b.webp'), opts: { format: 'webp' as const } },
      { input: src, output: join(dir, 'c.webp'), opts: { format: 'webp' as const } },
    ]
    const results: Array<{ status: string; input: string }> = []
    for await (const r of encodeImageBatch(items, 2)) {
      results.push({ status: r.status, input: r.input })
    }
    expect(results).toHaveLength(3)
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'err')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/encode.node.test.ts
```

- [ ] **Step 3: Implement the batch — start with in-process concurrency, add workers later**

For phase 1, prioritize correctness over peak throughput. Run items concurrently in-process with a semaphore. Worker isolation can come in a follow-up if measurement shows it matters.

Append to `packages/image/src/encode.node.ts`:

```ts
export interface BatchItem {
  input: string
  output?: string
  opts: ImageEncodeOptions
}

export interface BatchResult {
  input: string
  status: 'ok' | 'err'
  output?: string
  error?: string
  bytes?: number
  ms?: number
}

export async function* encodeImageBatch(
  items: BatchItem[],
  concurrency = 4,
): AsyncIterable<BatchResult> {
  const queue = items.slice()
  const inflight = new Map<Promise<BatchResult>, Promise<BatchResult>>()
  const yieldQueue: BatchResult[] = []

  const start = (item: BatchItem): Promise<BatchResult> => {
    const t0 = Date.now()
    const p = encodeImageFile(item.input, item.output ?? null, item.opts)
      .then((out) => ({ input: item.input, status: 'ok' as const, output: out, ms: Date.now() - t0 }))
      .catch((err: Error) => ({ input: item.input, status: 'err' as const, error: err.message, ms: Date.now() - t0 }))
    inflight.set(p, p)
    p.then((r) => {
      inflight.delete(p)
      yieldQueue.push(r)
    })
    return p
  }

  while (inflight.size < concurrency && queue.length > 0) start(queue.shift()!)
  while (inflight.size > 0 || queue.length > 0) {
    if (yieldQueue.length === 0) await Promise.race(inflight.values())
    while (yieldQueue.length > 0) yield yieldQueue.shift()!
    while (inflight.size < concurrency && queue.length > 0) start(queue.shift()!)
  }
}
```

- [ ] **Step 4: Re-export from `node.ts`**

```ts
// packages/image/src/node.ts
export * from './index'
export { encodeImageFile, encodeImageBatch } from './encode.node'
export type { FileWriteOptions, BatchItem, BatchResult } from './encode.node'
```

- [ ] **Step 5: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/encode.node.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src/encode.node.ts packages/image/src/encode.node.test.ts packages/image/src/node.ts
git commit -m "feat(image/node): encodeImageBatch with in-process concurrency"
```

---

## Task 15: CLI baker (`flatland-bake encode`)

**Files:**
- Create: `packages/image/src/cli.ts`
- Create: `packages/image/src/cli.test.ts`

- [ ] **Step 1: Write the failing arg-parser test**

Create `packages/image/src/cli.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import baker from './cli'

const fixture = join(__dirname, '__fixtures__/tiny.png')

describe('flatland-bake encode CLI', () => {
  it('returns exit code 0 on successful single encode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const out = join(dir, 'out.webp')
    const code = await baker.run([fixture, out, '--format', 'webp', '--quality', '80'])
    expect(code).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it('exits 1 when --format is missing', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const code = await baker.run([fixture])
    expect(code).toBe(1)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('--force overwrites existing target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const out = join(dir, 'a.webp')
    await baker.run([fixture, out, '--format', 'webp'])
    const code = await baker.run([fixture, out, '--format', 'webp', '--force'])
    expect(code).toBe(0)
  })

  it('exits 1 if any batch item fails (b-ii: exit 1 on any failure)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-cli-'))
    const code = await baker.run([
      '/does/not/exist.png',
      '--batch',
      '--format',
      'webp',
      '--out-dir',
      dir,
    ])
    expect(code).toBe(1)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
pnpm vitest run packages/image/src/cli.test.ts
```

- [ ] **Step 3: Implement the baker**

Create `packages/image/src/cli.ts`:

```ts
#!/usr/bin/env node
import type { Baker } from '@three-flatland/bake'
import { glob } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { encodeImageFile, encodeImageBatch } from './encode.node'
import type { EncodeFormat, ImageEncodeOptions } from './types'

const USAGE = `flatland-bake encode <input> [output] [options]

Options:
  --format <fmt>         png | webp | avif | ktx2  (required)
  --quality <n>          0..100 (WebP/AVIF) or BasisU quality (KTX2 ETC1S)
  --mode <m>             lossy | lossless (WebP/AVIF)
  --basis-mode <m>       etc1s | uastc (KTX2)
  --uastc-level <0..4>   UASTC pack level (KTX2)
  --mipmaps              Generate mipmap pyramid (KTX2)
  --batch                Treat <input> as a glob pattern
  --out-dir <path>       Batch output directory
  --force                Overwrite existing targets
`

const FORMATS: EncodeFormat[] = ['png', 'webp', 'avif', 'ktx2']

interface Args {
  positional: string[]
  format?: EncodeFormat
  quality?: number
  mode?: 'lossy' | 'lossless'
  basisMode?: 'etc1s' | 'uastc'
  uastcLevel?: 0 | 1 | 2 | 3 | 4
  mipmaps: boolean
  batch: boolean
  outDir?: string
  force: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { positional: [], mipmaps: false, batch: false, force: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--mipmaps') args.mipmaps = true
    else if (a === '--batch') args.batch = true
    else if (a === '--force') args.force = true
    else if (a === '--format') args.format = next() as EncodeFormat
    else if (a === '--quality') args.quality = Number(next())
    else if (a === '--mode') args.mode = next() as 'lossy' | 'lossless'
    else if (a === '--basis-mode') args.basisMode = next() as 'etc1s' | 'uastc'
    else if (a === '--uastc-level') args.uastcLevel = Number(next()) as 0 | 1 | 2 | 3 | 4
    else if (a === '--out-dir') args.outDir = next()
    else args.positional.push(a)
    function next(): string {
      const v = argv[++i]
      if (v === undefined) throw new Error(`missing value for ${a}`)
      return v
    }
  }
  return args
}

const baker: Baker = {
  name: 'encode',
  description: 'Encode image to PNG/WebP/AVIF/KTX2',
  usage() { return USAGE },

  async run(rawArgs) {
    let args: Args
    try {
      args = parseArgs(rawArgs)
    } catch (err) {
      process.stderr.write(`[encode] ${(err as Error).message}\n${USAGE}`)
      return 1
    }
    if (args.help) {
      process.stdout.write(USAGE)
      return 0
    }
    if (!args.format || !FORMATS.includes(args.format)) {
      process.stderr.write(`[encode] --format <png|webp|avif|ktx2> is required\n`)
      return 1
    }
    const opts: ImageEncodeOptions = {
      format: args.format,
      quality: args.quality,
      mode: args.mode,
      basis: args.basisMode || args.uastcLevel !== undefined || args.mipmaps
        ? { mode: args.basisMode, mipmaps: args.mipmaps, uastcLevel: args.uastcLevel }
        : undefined,
    }

    if (args.batch) {
      if (!args.positional[0] || !args.outDir) {
        process.stderr.write(`[encode] --batch requires <pattern> and --out-dir\n`)
        return 1
      }
      const files: string[] = []
      for await (const f of glob(args.positional[0])) files.push(f as string)
      const items = files.map((f) => ({
        input: f,
        output: join(args.outDir!, basename(f, extname(f)) + '.' + args.format),
        opts,
      }))
      let okCount = 0, errCount = 0
      for await (const r of encodeImageBatch(items, 4)) {
        const tag = r.status === 'ok' ? 'ok' : 'err'
        process.stdout.write(`[encode] ${tag} ${r.input} ${r.error ?? r.output ?? ''}\n`)
        if (r.status === 'ok') okCount++; else errCount++
      }
      process.stdout.write(`[encode] done: ${okCount} ok, ${errCount} err\n`)
      return errCount === 0 ? 0 : 1
    }

    const [input, output] = args.positional
    if (!input) {
      process.stderr.write(`[encode] missing <input>\n${USAGE}`)
      return 1
    }
    try {
      const out = await encodeImageFile(input, output ?? null, opts, { force: args.force })
      process.stdout.write(`[encode] ok ${input} → ${out}\n`)
      return 0
    } catch (err) {
      process.stderr.write(`[encode] err ${(err as Error).message}\n`)
      return 1
    }
  },
}

export default baker
```

- [ ] **Step 4: Run, verify it passes**

```bash
pnpm vitest run packages/image/src/cli.test.ts
```

- [ ] **Step 5: Build and verify the binary works**

```bash
pnpm --filter @three-flatland/image build
pnpm exec flatland-bake --list
```

Expected: `--list` shows `encode` from `@three-flatland/image`.

```bash
pnpm exec flatland-bake encode packages/image/src/__fixtures__/tiny.png /tmp/tiny-out.webp --format webp --force
ls -la /tmp/tiny-out.webp
```

Expected: file written; size > PNG fixture's size on tiny inputs is fine (WebP overhead per file).

- [ ] **Step 6: Commit**

```bash
git add packages/image/src/cli.ts packages/image/src/cli.test.ts
git commit -m "feat(image): flatland-bake encode CLI baker"
```

---

## Task 16: BasisU latency benchmark — Path B gate

**Files:**
- Create: `packages/image/src/__fixtures__/atlas-2048.png` — 2048² synthetic atlas
- Create: `packages/image/src/basisu-bench.test.ts`

- [ ] **Step 1: Generate the 2048² fixture**

```bash
node -e "
const fs = require('fs')
const { PNG } = require('pngjs')
const w = 2048, h = 2048
const png = new PNG({ width: w, height: h })
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    png.data[i] = (x * 255 / w) & 0xff
    png.data[i+1] = (y * 255 / h) & 0xff
    png.data[i+2] = ((x+y) * 255 / (w+h)) & 0xff
    png.data[i+3] = 255
  }
}
fs.writeFileSync('packages/image/src/__fixtures__/atlas-2048.png', PNG.sync.write(png))
"
```

Verify size:

```bash
ls -la packages/image/src/__fixtures__/atlas-2048.png
# Expected: 16-50 MB depending on PNG compression
```

- [ ] **Step 2: Write the benchmark test**

Create `packages/image/src/basisu-bench.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng } from './codecs/png'
import { encodeKtx2 } from './codecs/ktx2'

const PATH_B_THRESHOLD_MS = 5000 // <5s for ETC1S quality 128 + mipmaps on 2048²

describe('BasisU latency benchmark', () => {
  it('encodes a 2048² atlas to ETC1S+mips and reports timing', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const t0 = performance.now()
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const ms = performance.now() - t0
    process.stdout.write(`[basisu-bench] 2048² ETC1S+mips: ${ms.toFixed(0)}ms, ${(ktx2.length / 1024).toFixed(0)}KB\n`)
    expect(ktx2.length).toBeGreaterThan(0)
    if (ms > PATH_B_THRESHOLD_MS) {
      process.stdout.write(
        `[basisu-bench] WARN: stock encoder exceeded ${PATH_B_THRESHOLD_MS}ms threshold — TRIGGER PATH B (Zig-built SIMD).\n`,
      )
    }
  }, 60_000) // 60s test timeout — even slow path A finishes well within this
})
```

- [ ] **Step 3: Run the benchmark**

```bash
pnpm vitest run packages/image/src/basisu-bench.test.ts
```

Expected: PASS regardless of speed; the test PRINTS the timing. Read the output.

- [ ] **Step 4: Document the result**

Append to `planning/superpowers/specs/2026-05-01-image-encoder-design.md` under §6 Risks an entry like:

```
**BasisU latency measured 2026-05-01 on <hardware>:** <Xms> for 2048² ETC1S+mips quality 128. <Status: ACCEPTABLE / TRIGGER PATH B>.
```

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/__fixtures__/atlas-2048.png packages/image/src/basisu-bench.test.ts planning/superpowers/specs/2026-05-01-image-encoder-design.md
git commit -m "feat(image): BasisU latency benchmark — Path B gate"
```

If the benchmark exceeded the threshold, **stop here and write a Path B follow-up plan before proceeding to Task 18.** Tasks 17 and 18 are not blocked by this; they validate the package independently.

---

## Task 17: CLI integration test (child-process)

**Files:**
- Create: `packages/image/src/cli.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/image/src/cli.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)
const fixture = join(__dirname, '__fixtures__/tiny.png')

describe('flatland-bake encode integration', () => {
  it('runs as a child process and writes the expected file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fl-image-int-'))
    const out = join(dir, 'tiny.webp')
    const { stdout } = await exec('pnpm', ['exec', 'flatland-bake', 'encode', fixture, out, '--format', 'webp', '--quality', '80'], {
      cwd: process.cwd(),
    })
    expect(stdout).toMatch(/encode] ok/)
    expect(existsSync(out)).toBe(true)
  }, 30_000)

  it('--list shows the encode baker', async () => {
    const { stdout } = await exec('pnpm', ['exec', 'flatland-bake', '--list'], { cwd: process.cwd() })
    expect(stdout).toMatch(/encode/)
    expect(stdout).toMatch(/@three-flatland\/image/)
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @three-flatland/image build
pnpm vitest run packages/image/src/cli.integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/cli.integration.test.ts
git commit -m "test(image): CLI child-process integration"
```

---

## Task 18: WASM-in-webview contract test (test gate item 5)

**Files:**
- Create: `tools/vscode/webview/_wasm-test/index.html`
- Create: `tools/vscode/webview/_wasm-test/main.tsx`
- Create: `tools/vscode/extension/tools/_wasm-test/host.ts`
- Create: `tools/vscode/extension/tools/_wasm-test/register.ts`
- Modify: `tools/vscode/extension/index.ts`
- Modify: `tools/vscode/package.json` — add throwaway `FL: WASM Contract Test` command

This validates the runtime contract: the same `@jsquash/webp` WASM that runs in Node also loads and encodes inside a VSCode webview. Throwaway harness — delete after phase 1 is signed off.

- [ ] **Step 1: Create webview index.html**

Copy `tools/vscode/webview/merge/index.html` to `tools/vscode/webview/_wasm-test/index.html`. Change `<title>` to `WASM Contract Test`.

- [ ] **Step 2: Create main.tsx**

Create `tools/vscode/webview/_wasm-test/main.tsx`:

```ts
import { encode } from '@jsquash/webp/encode'

const root = document.getElementById('root')!
root.textContent = 'Encoding…'

async function run() {
  const w = 64, h = 64
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200
    data[i + 1] = 100
    data[i + 2] = 50
    data[i + 3] = 255
  }
  const t0 = performance.now()
  const out = await encode({ data, width: w, height: h, colorSpace: 'srgb' }, { quality: 80 })
  const ms = performance.now() - t0
  root.textContent = `OK: encoded 64×64 to ${out.byteLength} bytes in ${ms.toFixed(0)}ms — WASM works in webview`
}

run().catch((err) => {
  root.textContent = `FAIL: ${err.message}`
  console.error(err)
})
```

- [ ] **Step 3: Create host registration**

Create `tools/vscode/extension/tools/_wasm-test/host.ts` and `register.ts` mirroring the merge tool's pattern. The host just opens a webview using `composeToolHtml` with `tool: '_wasm-test'` and no bridge handlers.

`register.ts`:

```ts
import * as vscode from 'vscode'
import { composeToolHtml } from '../../webview-host'

export function registerWasmTest(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('threeFlatland.wasmTest.open', async () => {
      const panel = vscode.window.createWebviewPanel(
        'threeFlatland.wasmTest', 'WASM Contract Test', vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: false,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')] },
      )
      panel.webview.html = await composeToolHtml({
        webview: panel.webview, tool: '_wasm-test', extensionUri: context.extensionUri,
      })
    }),
  )
}
```

- [ ] **Step 4: Wire into extension activation**

Edit `tools/vscode/extension/index.ts`. Add:

```ts
import { registerWasmTest } from './tools/_wasm-test/register'
// inside activate():
registerWasmTest(context)
```

- [ ] **Step 5: Add command to `package.json`**

Edit `tools/vscode/package.json`. In `contributes.commands`:

```jsonc
{ "command": "threeFlatland.wasmTest.open", "title": "WASM Contract Test", "category": "FL" }
```

- [ ] **Step 6: Build the extension and launch**

```bash
pnpm --filter @three-flatland/vscode build
```

Then F5 in VSCode (Extension Development Host launch). Run "FL: WASM Contract Test" from the command palette. The webview should display:

```
OK: encoded 64×64 to <N> bytes in <Mms> — WASM works in webview
```

If it shows `FAIL: ...`, capture the error in the OutputChannel/devtools console and document the cause. Common issues:
- CSP missing `wasm-unsafe-eval` (already set by `composeToolHtml` per CLAUDE.md).
- WASM file resolution — vite emits `assets/<hash>.wasm`; `composeToolHtml` URL substitution covers this for `%FL_BASE%` — verify the network request actually completes against `vscode-webview://`.

- [ ] **Step 7: Document and commit**

If the test passes, mark test gate item 5 satisfied.

```bash
git add tools/vscode/webview/_wasm-test tools/vscode/extension/tools/_wasm-test tools/vscode/extension/index.ts tools/vscode/package.json
git commit -m "test(image): WASM-in-webview contract harness"
```

---

## Task 19: Full repo verification + plan checklist

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: PASS across all packages.

- [ ] **Step 2: Build everything**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual checklist against the spec's success criteria**

Verify each:

1. `pnpm --filter @three-flatland/image build` succeeds. ✓ if Task 6+ passed.
2. `flatland-bake encode hero.png --format webp --quality 80` writes `hero.webp`. — Run manually:
   ```bash
   pnpm exec flatland-bake encode packages/image/src/__fixtures__/tiny.png /tmp/hero.webp --format webp --quality 80 --force
   ls -la /tmp/hero.webp
   ```
3. `flatland-bake encode hero.png --format ktx2 --basis-mode etc1s --mipmaps`. — Run manually:
   ```bash
   pnpm exec flatland-bake encode packages/image/src/__fixtures__/tiny.png /tmp/hero.ktx2 --format ktx2 --basis-mode etc1s --mipmaps --force
   ls -la /tmp/hero.ktx2
   ```
4. Round-trip tests. ✓ if Tasks 7-10 passed.
5. WASM-in-webview. ✓ if Task 18 passed.
6. Atlas + merge tools read/write `meta.sources`. ✓ if Tasks 4-5 passed and `pnpm test` is green.
7. BasisU latency measured. ✓ if Task 16 was run; spec was annotated.

- [ ] **Step 5: Test gate report**

Create `planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md`:

```markdown
# Phase-1 Test Gate Report

Date: <today>
Branch: feat-vscode-tools

## Results

| Gate item | Status | Notes |
|---|---|---|
| 1. Round-trip tests | PASS / FAIL | |
| 2. BasisU latency | <X>ms — ACCEPTABLE / TRIGGER PATH B | |
| 3. WebP via spark.js (one-off harness) | PASS / FAIL / DEFERRED | Manual smoke test in browser; not blocking phase-2 plan creation but blocking phase-2 ship |
| 4. Atlas + merge tools write valid sidecars | PASS / FAIL | `pnpm test` green |
| 5. @jsquash/webp loads in VSCode webview | PASS / FAIL | Task 18 |

## Decision

Proceed to phase 2 plan: YES / NO (Path B follow-up plan needed first / Defer until <X>)
```

Fill in the values manually based on the actual test runs. Commit:

```bash
git add planning/superpowers/specs/2026-05-01-image-encoder-test-gate-report.md
git commit -m "docs(image): phase-1 test gate report"
```

- [ ] **Step 6: Final commit on phase-1 sign-off**

If everything passes, this branch is ready for the phase-2 brainstorm. The test-gate report's "Decision" line tells the next session what to do next.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Package shape | 6 (skeleton), 7-15 (fill in) |
| §2 Codec strategy — Path A | 7-10 |
| §2 Codec strategy — Path B | not in this plan; gated by Task 16 |
| §3 Schema migration | 2, 3, 4, 5 |
| §4 Phasing — Phase 1 scope | All tasks |
| §4 Test gate items 1-5 | Tasks 7-10 (1), 16 (2), 18 (5), 4-5 (4); item 3 (spark.js webp harness) flagged in Task 19 as deferred manual smoke |
| §5 Architecture & data flow | 6, 11, 13, 14, 15 |
| §6 Risks (1) BasisU latency | Task 16 |
| §6 Risks (5) golden-test determinism | Tasks 7-10 use perceptual ΔE for non-deterministic codecs; PNG uses byte equality |

**Placeholder scan:** No "TBD", "TODO" patterns. Each step has the exact code or command needed. The Path B description in §2 of the spec is intentionally not in this plan — that's a follow-up plan triggered by Task 16's measurement.

**Type consistency:** `EncodeFormat`, `ImageEncodeOptions`, `GpuMemoryEstimate` defined once in `types.ts` (Task 6) and referenced consistently in Tasks 11, 12, 13, 14, 15. Method names: `encodeImage`, `decodeImage`, `encodeImageFile`, `encodeImageBatch`, `estimateGpuMemory` — same throughout.

**Gaps that should be flagged to the user:**

- **Gate item 3 (WebP via spark.js)** is left as a manual smoke test in Task 19 rather than an automated one. spark.js integration in a one-off browser page is doable but adds a half-day; the test gate report flags it as DEFERRED if not run, blocking phase-2 ship but not phase-2 *planning*.
- **AVIF in Node may fail** depending on Node version; Task 9 documents this and proceeds. If AVIF is critical for phase 2, schedule a follow-up task to harden it.
- **The vendored BasisU encoder** in Task 10 pins to `BinomialLLC/basis_universal@v1_50_0_2`; if that tag doesn't resolve at curl time, Task 10 step 2 needs a manual version pick.
