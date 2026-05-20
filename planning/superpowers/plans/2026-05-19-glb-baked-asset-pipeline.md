# GLB Baked-Asset Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship `@three-flatland/asset` — a zero-dependency runtime GLB reader + a Node-side glTF-Transform bake helper — and migrate `slug` to emit/read a single `.slug.glb`.

**Architecture:** Bake with glTF-Transform (Node devDep) into a standard `.glb`, naming buffers via a `FLATLAND_asset` glTF extension. Read at runtime with a tiny zero-dep GLB-chunk parser that resolves the extension's named buffers to zero-copy typed-array views. Salvage `defineRecord`/`RecordCursor`/layout from the prior `@three-flatland/pak` work; delete the bespoke container.

**Tech Stack:** TypeScript, pnpm + turbo, tsup (`bundle:false`), vitest 2.x. Runtime entry zero-dep; bake entry peer-deps `@gltf-transform/core`.

**Spec:** `planning/superpowers/specs/2026-05-19-glb-baked-asset-pipeline-design.md` — read it first. Section refs (§) point there.

**Starting point:** `packages/pak` exists from the (now-superseded) flpak effort: `schema.ts`, `pack.ts`, `unpack.ts`, `records.ts`, `layout.ts`, tests, fixtures. `records.ts` + `layout.ts` + the record types in `schema.ts` are salvaged; `pack.ts` + `unpack.ts` + `flpak-metadata.schema.json` + the `PakMetadata`/`PAK_JSON_SCHEMA` framing are deleted.

---

## File structure (target)

```
packages/asset/                     (renamed from packages/pak)
  package.json                      # name @three-flatland/asset; exports "." + "./bake"
  tsup.config.ts ; tsconfig.json
  README.md
  src/
    schema.ts        # DataType, ELEMENT_SIZE, RecordSchema/RecordField, AssetError (salvaged + trimmed)
    layout.ts        # defineRecord, f32.../vec, LayoutType, recordFor   (salvaged verbatim)
    records.ts       # RecordCursor, TypedRecordCursor, makeCursor       (salvaged verbatim)
    glb.ts           # readGLB(buf) -> { json, bin }  (GLB container chunk parser)
    readAsset.ts     # readAsset(buf) -> FlatlandAsset (resolves FLATLAND_asset over glb.ts)
    index.ts         # runtime public exports (zero-dep)
    bake/
      extension.ts   # FLATLAND_asset glTF-Transform Extension + ExtensionProperty
      bake.ts        # helpers: addRecordBuffer / addRawBuffer / addImage / setMeta -> Document
      index.ts       # ./bake public exports (peer-deps @gltf-transform/core)
    *.test.ts ; __fixtures__/
```

---

# Phase 0 — Repurpose the package (pak → asset)

## Task 0.1: Rename package + prune dead format code

**Files:** `git mv packages/pak packages/asset`; edit `package.json`; delete `pack.ts`, `unpack.ts`, `pack.test.ts`, `unpack.test.ts`, `validation.test.ts`, `conformance.test.ts`, `__fixtures__/*`, `flpak-metadata.schema.json`; trim `schema.ts`; update `index.ts`.

- [ ] **Step 1:** `git mv packages/pak packages/asset`. In `packages/asset/package.json`: set `"name": "@three-flatland/asset"`; replace `exports` with two entries:
  ```jsonc
  "exports": {
    ".":      { "source": "./src/index.ts", "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } },
    "./bake": { "source": "./src/bake/index.ts", "import": { "types": "./dist/bake/index.d.ts", "default": "./dist/bake/index.js" }, "require": { "types": "./dist/bake/index.d.cts", "default": "./dist/bake/index.cjs" } }
  }
  ```
  Add `"peerDependencies": { "@gltf-transform/core": "catalog:" }` and `"peerDependenciesMeta": { "@gltf-transform/core": { "optional": true } }`. Update `files` to drop `flpak-metadata.schema.json`. Add `@gltf-transform/core` to the workspace catalog in `pnpm-workspace.yaml` (pin a current version, e.g. `^4.3.0`) and as a devDependency of `packages/asset`.
- [ ] **Step 2:** Delete `src/pack.ts`, `src/unpack.ts`, `src/pack.test.ts`, `src/unpack.test.ts`, `src/validation.test.ts`, `src/conformance.test.ts`, `src/__fixtures__/`, and `flpak-metadata.schema.json`.
- [ ] **Step 3:** Trim `src/schema.ts` to the salvaged surface: keep `PakDataType` (rename to `DataType`), `ELEMENT_SIZE`, `PakRecordField`→`RecordField`, `PakRecordSchema`→`RecordSchema`, and `PakError`→`AssetError` (keep the `code` mechanism; trim `PakErrorCode` to codes we still use: `BAD_GLB`, `BAD_EXTENSION`, `BAD_RECORD`, `BAD_ACCESS`). Delete `PakBufferDescriptor`, `PakMetadata`, `PAK_JSON_SCHEMA`. Update `layout.ts` and `records.ts` imports for the renamed types (mechanical).
- [ ] **Step 4:** Update `src/index.ts` to export only the salvaged runtime surface for now: `defineRecord`/constructors/`recordFor`/`RecordLayout`/`LayoutType` from `./layout`; `RecordCursor`/`TypedRecordCursor`/`makeCursor` from `./records`; `DataType`/`ELEMENT_SIZE`/`RecordSchema`/`RecordField`/`AssetError` from `./schema`. (readAsset added in Phase 1.)
- [ ] **Step 5:** `pnpm install`; `pnpm exec vitest run packages/asset` (layout + records + schema tests pass — these are the salvaged ones); `pnpm --filter @three-flatland/asset typecheck` (0).
- [ ] **Step 6:** Commit: `refactor(asset): rename pak→asset; drop bespoke container, keep records/layout`.

---

# Phase 1 — Runtime GLB reader (zero-dep)

## Task 1.1: `glb.ts` — GLB container chunk parser

**Files:** Create `src/glb.ts`, `src/glb.test.ts`.

- [ ] **Step 1: Failing test** — `glb.test.ts`. Build a minimal valid GLB by hand (12-byte header: magic `0x46546C67` = "glTF" LE, version 2, total length; JSON chunk type `0x4E4F534A`; BIN chunk type `0x004E4942`) with a tiny JSON `{"asset":{"version":"2.0"}}` and a few BIN bytes. Assert `readGLB(buf)` returns `{ json, binByteOffset, binByteLength }` with `json.asset.version === '2.0'` and the bin offset/length pointing at the right bytes. Add a malformed case (bad magic → throws `AssetError('BAD_GLB')`).

  Note the GLB magic is **"glTF"** = bytes `67 6C 54 46`, LE u32 `0x46546C67` (NOT our old flpak magic — this is the real glTF container).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `glb.ts`.** Parse: validate magic `0x46546C67` and version `2`; read total length; walk chunks (`u32 chunkLength`, `u32 chunkType`, payload). First chunk MUST be JSON (`0x4E4F534A`) → UTF-8 + `JSON.parse`. The (optional) second chunk BIN (`0x004E4942`) → record its absolute byte offset + length. Return `{ json, binByteOffset, binByteLength }` (offsets absolute, into the source `ArrayBuffer`). Throw `AssetError('BAD_GLB', …)` on bad magic/version/truncation/invalid JSON. All reads little-endian via `DataView`.
- [ ] **Step 4:** Run → pass; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): GLB container chunk parser`.

## Task 1.2: `readAsset.ts` — resolve `FLATLAND_asset` to zero-copy views

**Files:** Create `src/readAsset.ts`, `src/readAsset.test.ts`; update `src/index.ts`.

- [ ] **Step 1: Failing test** — hand-build (or, simpler, build via the Phase-2 bake helper once it exists — but to keep Phase 1 independent, hand-build) a GLB whose JSON has: `bufferViews` (byteOffset/byteLength into BIN), optional `accessors`, optional `images`, and a root `extensions.FLATLAND_asset` with `{ kind, version, buffers: { glyphs: { bufferView: 0, record: {...} }, cmap: { accessor: 0 }, raw: { bufferView: 1, mime: '...' } }, metrics: {...} }`. Assert `readAsset(buf)`: `.kind`/`.version`/`.meta.metrics`; `.view('cmap')` returns a typed view with correct values; `.records('glyphs', GlyphLayout).get(i,'field')` reads correctly; `.bytes('raw')` returns the right bytes; `.has()` works; unknown name throws `AssetError('BAD_ACCESS')`. Assert views are zero-copy (same underlying `ArrayBuffer` as input).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `readAsset.ts`.** Call `readGLB`. Read `json.extensions.FLATLAND_asset` (throw `BAD_EXTENSION` if absent). For each `buffers[name]` pointer, resolve to a byte range:
  - `bufferView: i` → `json.bufferViews[i]` gives `byteOffset`/`byteLength` (relative to the buffer; for GLB the single buffer is the BIN chunk) → absolute = `binByteOffset + (bufferView.byteOffset ?? 0)`.
  - `accessor: i` → `json.accessors[i]` → its `bufferView` + `byteOffset` + `componentType`/`type`/`count` → byte range + element type.
  - `image: i` → `json.images[i]` (a bufferView + `mimeType`) → for `image(name)`.
  Build `FlatlandAsset` (§ spec): `view(name)` constructs the typed-array view (element type from the pointer's `record`/`accessor`/explicit `type`), `bytes(name)` a `Uint8Array` view, `records(name, layout?)` delegates to salvaged `makeCursor` with a synthesized `descriptor`-like `{ off, len, record }` (adapt `makeCursor`'s signature if needed — it already takes `(buf, binStart, descriptor, name, layout?)`; pass `binStart=0` and absolute offsets, or refactor to take an absolute base). Validate record constraints (reuse the salvaged record-validation logic from the old `unpack` — move it into a shared helper rather than re-deriving). All views slice the input `ArrayBuffer` (zero-copy).
- [ ] **Step 4:** Run → pass; export `readAsset` + `FlatlandAsset` from `index.ts`; typecheck 0; whole `packages/asset` suite passes.
- [ ] **Step 5:** Commit: `feat(asset): readAsset — FLATLAND_asset extension → zero-copy views`.

---

# Phase 2 — Bake side (Node, glTF-Transform)

## Task 2.1: `FLATLAND_asset` glTF-Transform Extension

**Files:** Create `src/bake/extension.ts`, `src/bake/extension.test.ts`.

- [ ] **Step 1: Failing test** — using `@gltf-transform/core` (`Document`, `NodeIO`), register the extension, create a doc with one accessor + one raw bufferView + metadata, `writeBinary()`, then `readAsset()` the bytes and assert the named buffers + metadata round-trip. (This proves bake↔read interop.)
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `extension.ts`.** Define `class FlatlandAssetExtension extends Extension` with `extensionName = 'FLATLAND_asset'`, and an `ExtensionProperty` holding `kind`/`version`/`meta` + a name→pointer map. `write(context)`: serialize the `buffers` map using `context.accessorIndexMap.get(accessor)` for accessor pointers and `context.otherBufferViews` for raw bufferViews (capture the resulting index via `context.otherBufferViewsIndexMap`); write `{ kind, version, buffers, ...meta }` to the document-level extension JSON. `read(context)`: parse the extension JSON; resolve accessor pointers via `context.accessors[i]` and raw bufferViews via `context.bufferViews[i]`. **Isolate the `otherBufferViews` usage here** (the one semi-internal glTF-Transform API, §friction) with a comment + the pinned-version note.
- [ ] **Step 4:** Run → pass; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): FLATLAND_asset glTF-Transform extension`.

## Task 2.2: Bake helpers + `./bake` entry

**Files:** Create `src/bake/bake.ts`, `src/bake/index.ts`, `src/bake/bake.test.ts`.

- [ ] **Step 1: Failing test** — assert the ergonomic helpers produce a `.glb` that `readAsset` decodes: `addRecordBuffer(doc, ext, name, bytes, layoutOrSchema)`, `addRawBuffer(doc, ext, name, bytes, { mime? })`, `addAccessor(doc, ext, name, typedArray, { type, normalized? })`, `addImage(doc, ext, name, bytes, mime)`, `setMeta(ext, { kind, version, ...domain })`. Then `new NodeIO().registerExtensions([FlatlandAssetExtension]).writeBinary(doc)` → `readAsset` → assert.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `bake.ts`** (thin wrappers over `Document`/the extension) and `bake/index.ts` exporting the helpers + `FlatlandAssetExtension`. `@gltf-transform/core` is a peer/dev dep; imported only here.
- [ ] **Step 4:** Run → pass; `pnpm --filter @three-flatland/asset build` emits `dist/` for both entries; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): bake helpers + ./bake entry`.

---

# Phase 3 — Conformance fixtures + README

## Task 3.1: Golden `.glb` fixtures + conformance test

- [ ] **Step 1:** A Node script/test bakes a fixture `.glb` covering an accessor, a raw record bufferView, a raw opaque buffer, and an embedded image; write `__fixtures__/sample.glb` + `sample.expected.json`. Commit the bytes.
- [ ] **Step 2:** `conformance.test.ts` reads `sample.glb` from disk, `readAsset`s it, asserts decoded values match; asserts the GLB magic on disk is `67 6C 54 46` ("glTF"). Run → pass.
- [ ] **Step 3:** Validate the fixture with the official glTF-Validator if available (`npx @gltf/validator` or the `gltf-validator` npm package as a devDep) — assert no errors (info-level unknown-extension note OK). If wiring the validator is heavy, document the manual check and skip in CI.
- [ ] **Step 4:** Commit: `test(asset): golden GLB conformance fixtures`.

## Task 3.2: README

- [ ] **Step 1:** Write `packages/asset/README.md`: what the package is (read/bake Flatland assets in standard GLB), the `FLATLAND_asset` extension shape, the runtime reader API, the bake API, the GLB-is-standard note (validators/viewers), and the cross-language convention. Factual, no emojis, no marketing.
- [ ] **Step 2:** Commit: `docs(asset): README`.

---

# Phase 4 — Slug migration to `.slug.glb`

## Task 4.1: `slug-bake` emits `.slug.glb`

**Files:** `packages/slug/package.json` (+dep `@three-flatland/asset`, devdep `@gltf-transform/core`); `packages/slug/src/baked.ts`; `packages/slug/src/cli.ts`; tests.

- [ ] **Step 1: Failing test** — extend `baked.test.ts`: `packBaked(input)` now returns a `.glb` `Uint8Array`; `readAsset(out.buffer)` exposes `kind: 'flatland.slug.font'`, `version`, and named buffers `curve`/`band`/`glyphs`/`cmap`/`kern`/`bands`/`bandOffsets`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Rewrite `packBaked` using `@three-flatland/asset/bake` + `@gltf-transform/core`. Define `GlyphLayout`/`CmapLayout`/`KernLayout`/`BandOffsetLayout` via `defineRecord`. Build the `bands` opaque buffer as today + a `bandOffsets` Uint32 prefix index. Curve/band textures → raw bufferViews; glyph/cmap/kern → record bufferViews; metrics/strokeSets/textureWidth + texture dims → `setMeta`. Emit one `.glb`. Update `bakedURLs` → single `{base}.slug.glb`; update `cli.ts` to write one file.
- [ ] **Step 4:** Run → pass; typecheck 0.
- [ ] **Step 5:** Commit: `feat(slug): bake to single .slug.glb via @three-flatland/asset`.

## Task 4.2: `SlugFontLoader` + `unpackBaked` read the `.glb`

- [ ] **Step 1: Failing test** — `unpackBaked(readAsset(packBaked(input).buffer))` reconstructs glyph map / cmap / kern; band data random-accessed via `bandOffsets`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Rewrite `unpackBaked` to take a `FlatlandAsset`: glyph table via `records('glyphs', GlyphLayout)`, cmap/kern via cursor, bands via `view('bands')` + `bandOffsets` random access (slice per glyph — drops the walk-all-prior pass). Rewrite `SlugFontLoader` to fetch one `.slug.glb`, `readAsset`, build curve/band `DataTexture`s from `view()`/`bytes()` + dims from `meta`. Remove the two-file fetch.
- [ ] **Step 4:** Run → pass; `pnpm --filter @three-flatland/slug typecheck` 0.
- [ ] **Step 5:** Commit: `feat(slug): load single .slug.glb via readAsset`.

## Task 4.3: Slug equivalence + domain schema

- [ ] **Step 1:** Equivalence test — migrated font reproduces glyph bounds / advanceWidth / cmap+kern lookups matching the source font (golden or spot-check against `parseFont`). Run → pass.
- [ ] **Step 2:** Author `packages/slug/src/flatland.slug.font.schema.json` documenting the `FLATLAND_asset` `meta` shape for slug (kind const, required metrics/textures/bandLayout, slug encoding-version). Reference from the slug README.
- [ ] **Step 3:** Commit: `test(slug): glyph-metric equivalence + slug.font schema`.

---

# Phase 5 — Workspace integration + verification

## Task 5.1: Repo-wide green + housekeeping

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm --filter @three-flatland/asset build && pnpm --filter @three-flatland/slug build` — all green.
- [ ] **Step 2:** `pnpm lint && pnpm format:check` — fix any (no-semi/single-quote/trailing-comma).
- [ ] **Step 3:** Update `.library/three-flatland/loader-architecture.md` if present: add `@three-flatland/asset` (Layer 0; runtime reader `.` + Node bake `./bake`) and note the GLB-as-baked-asset-container decision (supersedes any bespoke-format note). Add a changeset if releasing.
- [ ] **Step 4:** Commit: `chore(asset): workspace integration + loader-architecture note`.

---

## Self-review checklist
- **Spec coverage:** §architecture (bake/runtime split) → Phases 1–2; §FLATLAND_asset extension → Tasks 1.2/2.1; §friction (float16/AoS/otherBufferViews) → Task 2.1 (isolated + pinned); §package shape → Task 0.1; §slug migration → Phase 4; §cross-language + testing → Phase 3. Covered.
- **Salvage honored:** `layout.ts`/`records.ts` reused verbatim (Phase 0 keeps them; Phase 1 reader feeds `makeCursor`); record-validation logic from old `unpack` moved into a shared helper, not re-derived.
- **No format invention:** the only binary framing we touch is the standard GLB container parse (read side); writing is delegated to glTF-Transform.
- **No speculative generality:** atlas/tilemap deferred to "when real" (spec Open/future); build is slug-driven.
