# GLB Baked-Asset Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

> **SUPERSEDED (2026-05-21):** The standalone `@three-flatland/gltf` package described below was built, then torn down. Its thin GLB loader + `FL_slug_font` extension authoring now live **inline in `@three-flatland/slug`** (`src/glb.ts`, `src/bake.ts`, `src/format.ts`) — no separate package. See the design spec's "Package shape" section. The slug-migration outcome (single `.slug.glb`, native accessors, `FL_slug_font` extension, passes glTF-Validator) stands; only the package factoring changed.

**Goal:** Ship `@three-flatland/gltf` — a zero-dependency runtime GLB reader (`.`) + a Node glTF-Transform bake helper (`./bake`) — and migrate `slug` to emit/read a single `.slug.glb` using native glTF accessors + a thin `FL_slug_font` extension.

**Architecture:** Native-first. Tabular data → glTF accessors (SoA); ragged data → flat bufferView + FLOAT offset accessor; half-float data textures → raw bufferViews referenced by the extension; the semantic layer (kind/version/metrics + accessor map) → an `FL_slug_font` extension nested in the glTF JSON. Bake with glTF-Transform; read with a tiny GLB-chunk parser. No bespoke format, no EXT_structural_metadata.

**Spec:** `planning/superpowers/specs/2026-05-19-glb-baked-asset-pipeline-design.md` — read it first (esp. the native-first rule, the `FL_slug_font` worked example, and the composition section).

**Starting point:** `packages/pak` exists from the superseded flpak effort. It is reset to `packages/gltf` and its flpak source (pack/unpack/record-schema/cursor/layout + tests + fixtures) is deleted — none of it carries over (SoA accessor columns are plain typed arrays; the record cursor was only for AoS, which slug doesn't need).

---

## File structure (target)

```
packages/gltf/                    (renamed from packages/pak; flpak src removed)
  package.json                     # @three-flatland/gltf; exports "." + "./bake"
  tsup.config.ts ; tsconfig.json ; README.md
  src/
    glb.ts          # readGLB(buf) -> { json, binByteOffset } : GLB container chunk parser
    readAsset.ts    # readAsset(buf) -> FlatlandAsset { json, accessor(i), bufferView(i), ext(name) }
    index.ts        # runtime exports (zero-dep)
    bake/
      gltf.ts       # glTF-Transform helpers: addColumn(accessor), addRawBufferView, addExtension
      index.ts      # ./bake exports (peer-deps @gltf-transform/core)
    *.test.ts ; __fixtures__/
```

---

# Phase 0 — Reset the package (pak → asset)

## Task 0.1: Rename + clear flpak source

- [ ] **Step 1:** `git mv packages/pak packages/gltf`. In `package.json`: `"name": "@three-flatland/gltf"`; set `exports` to `.` (runtime) + `./bake`; add `"peerDependencies": { "@gltf-transform/core": "catalog:" }` + `peerDependenciesMeta` optional; add `@gltf-transform/core` to `pnpm-workspace.yaml` catalog (`^4.3.0`) and as a devDependency of `packages/gltf`. Drop `flpak-metadata.schema.json` from `files`.
- [ ] **Step 2:** Delete all flpak src: `src/pack.ts`, `src/unpack.ts`, `src/records.ts`, `src/layout.ts`, `src/schema.ts`, every `src/*.test.ts`, `src/__fixtures__/`, `flpak-metadata.schema.json`. Replace `src/index.ts` with `export {}` (stub; filled in Phase 1).
- [ ] **Step 3:** `pnpm install`; `pnpm --filter @three-flatland/gltf typecheck` (exit 0; empty package builds).
- [ ] **Step 4:** Commit: `refactor(asset): reset pak→asset for the GLB pipeline (drop flpak source)`.

---

# Phase 1 — Runtime GLB reader (zero-dep)

## Task 1.1: `glb.ts` — GLB container parser

- [ ] **Step 1: Failing test** `src/glb.test.ts`. Hand-build a minimal valid GLB: 12-byte header (magic `0x46546C67` = "glTF" LE, version 2, total length), JSON chunk (`0x4E4F534A`) with `{"asset":{"version":"2.0"}}`, BIN chunk (`0x004E4942`) with a few bytes. Assert `readGLB(buf)` returns `{ json, binByteOffset }` with `json.asset.version === '2.0'` and `binByteOffset` pointing at the first BIN byte. Malformed case (bad magic) throws.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `glb.ts`.** Validate magic `0x46546C67` + version `2` + total length; walk chunks; first chunk MUST be JSON → UTF-8 decode + `JSON.parse`; second chunk (optional) BIN → record its absolute payload byte offset. Return `{ json, binByteOffset }`. Throw a typed `AssetError` on bad magic/version/truncation/invalid JSON. All reads little-endian via `DataView`.
- [ ] **Step 4:** Run → pass; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): GLB container chunk parser`.

## Task 1.2: `readAsset.ts` — accessor/bufferView/extension resolution

- [ ] **Step 1: Failing test** `src/readAsset.test.ts`. Hand-build a GLB whose JSON has `bufferViews` (byteOffset/byteLength), `accessors` (componentType/type/count over those bufferViews), and `extensions.FL_demo`. Assert `readAsset(buf)`: `.ext('FL_demo')` returns the JSON object; `.accessor(i)` returns a zero-copy typed view with correct values for FLOAT/USHORT/SHORT/UINT accessors (componentType→TypedArray; honor `type` SCALAR/VEC2/3/4 for element count); `.bufferView(i)` returns a zero-copy `Uint8Array`. Assert views share the input `ArrayBuffer` (zero-copy). Out-of-range index throws.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `readAsset.ts`.** Call `readGLB`. Build:
  - `accessor(i)`: read `json.accessors[i]` → its `bufferView` → `byteOffset` (bufferView + accessor) → absolute = `binByteOffset + bvOffset + accOffset`; element count = `count × components(type)`; construct the typed array (`COMPONENT_TYPE_CTORS[componentType]`) as a view into `buf`.
  - `bufferView(i)`: `new Uint8Array(buf, binByteOffset + bv.byteOffset, bv.byteLength)`.
  - `ext(name)`: `json.extensions?.[name]`.
    Define `COMPONENT_TYPE_CTORS` ({5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}) and `TYPE_COMPONENTS` ({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16}). Throw `AssetError` on unknown index/type. All zero-copy.
- [ ] **Step 4:** Run → pass; export `readAsset`, `FlatlandAsset`, `AssetError` from `index.ts`; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): readAsset — zero-copy accessor/bufferView/extension reader`.

---

# Phase 2 — Bake side (Node, glTF-Transform)

## Task 2.1: Bake helpers

- [ ] **Step 1: Failing test** `src/bake/gltf.test.ts` — using `@gltf-transform/core` (`Document`, `NodeIO`): create a doc with a FLOAT accessor (a column), a raw bufferView (texture bytes), and a root extension object; `writeBinary()`; then `readAsset()` the bytes and assert the accessor values, the raw bytes, and `ext('FL_demo')` round-trip. (Proves bake↔read interop.)
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3: Implement `bake/gltf.ts`.** Helpers over glTF-Transform — **all data is accessors; no raw bufferViews, no `otherBufferViews`**:
  - `addColumn(doc, buffer, name, typedArray, type)` → `Accessor` (componentType inferred from the typed array — `Uint16Array`→USHORT carries half-float bits, `Float32Array`→FLOAT, etc.; `type` SCALAR/VECn). Returns the `Accessor` so it can be referenced.
  - The `FL_*` extension is authored as a glTF-Transform **`Extension` + `ExtensionProperty`** that holds `.addRef()` references to the `Accessor` objects and, in `write(context)`, emits the extension JSON using `context.accessorIndexMap.get(accessor)` to resolve final indices — the **public** index-map API (no internal `otherBufferViews`). `read(context)` resolves indices back via `context.accessors[i]` (only needed if a Node-side reader is wanted; the browser runtime uses our own `readAsset`).
  - For G2.1's generic round-trip test, a minimal demo extension (`FL_demo`) exercising one accessor ref + a metadata object is sufficient; the slug-specific `FL_slug_font` shape is authored in Task 4.1 using the same machinery.
  - Pin `@gltf-transform/core` to the catalog version; the round-trip test (bake → `readAsset`) is the guard.
- [ ] **Step 4:** Run → pass; build emits both entries; typecheck 0.
- [ ] **Step 5:** Commit: `feat(asset): glTF-Transform bake helpers (accessors, raw bufferViews, extension)`.

---

# Phase 3 — Conformance fixtures + README

## Task 3.1: Golden `.glb` fixture + conformance + validator

- [ ] **Step 1:** A Node test/script bakes a fixture `.glb` covering a FLOAT column accessor, a USHORT VEC2 accessor, a raw bufferView, and a small `FL_demo` extension with nested JSON metadata; write `__fixtures__/sample.glb` + `sample.expected.json`. Commit the bytes.
- [ ] **Step 2:** `conformance.test.ts` reads `sample.glb` from disk → `readAsset` → asserts decoded values match; asserts GLB magic on disk is `67 6C 54 46`.
- [ ] **Step 3:** Validate the fixture with the official glTF-Validator (the `gltf-validator` npm package as a devDep): assert **0 errors** (info-level "unused accessor"/"unknown extension" notes OK). If wiring it is heavy, document a manual check and gate it behind an optional script.
- [ ] **Step 4:** Commit: `test(asset): golden GLB fixture + glTF-Validator check`.

## Task 3.2: README

- [ ] **Step 1:** `packages/gltf/README.md`: what the package is (read/bake Flatland assets in standard GLB), the native-first rule, the `FL_*` extension shape + the worked example, the runtime reader API, the bake API, and the composition model (`FL_pak` manifest + `FL_asset_ref` name refs, deferred). Factual, no emojis.
- [ ] **Step 2:** Commit: `docs(asset): README`.

---

# Phase 4 — Slug migration to `.slug.glb`

> Read `packages/slug/src/baked.ts` first. Mapping is in the spec's slug-migration table.

## Task 4.1: `slug-bake` emits `.slug.glb`

- [ ] **Step 1:** `packages/slug/package.json`: add `@three-flatland/gltf` (`workspace:*`) + devdep `@gltf-transform/core`. `pnpm install`.
- [ ] **Step 2: Failing test** in `baked.test.ts`: `packBaked(input)` returns a `.glb` `Uint8Array`; `readAsset(out.buffer)` exposes `ext('FL_slug_font')` with `version`, `metrics`, `glyphs.fields` accessor refs, `cmap`/`kern` accessors, `bands.offsetAccessor` + `dataBufferView`, and `curveTexture`/`bandTexture` bufferView refs.
- [ ] **Step 3:** Rewrite `packBaked` over `@three-flatland/gltf/bake`: glyph table → 10 SoA FLOAT accessors; cmap → USHORT VEC2; kern → SHORT SCALAR stride-3; band data → flat USHORT accessor; band offsets → FLOAT accessor (N+1 prefix sum); curve texture → USHORT accessor (half-float bits); band texture → FLOAT accessor; metrics/strokeSets/dims/`kind`/`version` → `FL_slug_font` extension JSON referencing those accessors by index (`extensionsRequired` for the standalone font file). Update `bakedURLs` → single `{base}.slug.glb`; update `cli.ts` to write one file.
- [ ] **Step 4:** Run → pass; typecheck 0.
- [ ] **Step 5:** Commit: `feat(slug): bake to single .slug.glb via @three-flatland/gltf`.

## Task 4.2: `SlugFontLoader` + `unpackBaked` read the `.glb`

- [ ] **Step 1: Failing test:** `unpackBaked(readAsset(packBaked(input).buffer))` reconstructs the glyph map / cmap / kern; band data random-accessed via the offset accessor.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Rewrite `unpackBaked` to take a `FlatlandAsset`: read `ext('FL_slug_font')`; glyph columns via `accessor(fields.X.accessor)`; cmap/kern via their accessors; bands via `bufferView(bands.dataBufferView)` sliced by the FLOAT offset accessor (per-glyph random access). Rewrite `SlugFontLoader` to fetch one `.slug.glb`, `readAsset`, build curve/band `DataTexture`s from the texture bufferViews (zero-copy) + dims from the extension. Remove the two-file fetch.
- [ ] **Step 4:** Run → pass; `pnpm --filter @three-flatland/slug typecheck` 0.
- [ ] **Step 5:** Commit: `feat(slug): load single .slug.glb via readAsset`.

## Task 4.3: Slug equivalence

- [ ] **Step 1:** Equivalence test — migrated font reproduces glyph bounds / advanceWidth / cmap+kern lookups matching the source font (golden or spot-check vs `parseFont`). Run → pass.
- [ ] **Step 2:** Commit: `test(slug): glyph-metric equivalence over the .slug.glb path`.

---

# Phase 5 — Integration + verification

## Task 5.1: Repo-wide green + housekeeping

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm --filter @three-flatland/gltf build && pnpm --filter @three-flatland/slug build` — all green.
- [ ] **Step 2:** `pnpm lint && pnpm format:check` — fix any.
- [ ] **Step 3:** Update `.library/three-flatland/loader-architecture.md` if present: add `@three-flatland/gltf` (Layer 0; runtime reader `.` + Node bake `./bake`) + the GLB-as-baked-asset-container decision. Changeset if releasing.
- [ ] **Step 4:** Commit: `chore(asset): workspace integration + loader-architecture note`.

---

## Self-review checklist

- **Spec coverage:** native-first rule → all phases; GLB reader → Phase 1; bake helpers + extension → Phase 2; conformance + validator → Phase 3; slug `.slug.glb` → Phase 4; integration → Phase 5. Composition (`FL_pak`/`FL_asset_ref`) is documented (spec) and deferred (no task) until a compose tool is real — by design.
- **No format invention:** the only framing parsed is the standard GLB container; writing is glTF-Transform. Data is native accessors + bufferViews + extension JSON.
- **No dead salvage:** flpak `pack`/`unpack`/`record`/`cursor`/`layout` are deleted (Phase 0), not carried as unused code.
- **Half-float / offsets:** curve/band as raw bufferViews referenced by the extension (not custom-MIME images); band offsets as FLOAT (not UNSIGNED_INT) per the spec restriction.
